import {
	Plugin,
	PluginSettingTab,
	Setting,
	App,
	MarkdownView,
} from "obsidian";
import {
	ViewPlugin,
	Decoration,
	DecorationSet,
	EditorView,
	ViewUpdate,
} from "@codemirror/view";
import {
	StateField,
	StateEffect,
	RangeSetBuilder,
	Extension,
} from "@codemirror/state";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

interface HighlightNonAsciiSettings {
	enabled: boolean;
	allowedChars: string;
	customCSS: string;
}

const DEFAULT_CSS =
	".non-ascii-highlight {\n"
	+ "  background-color: rgba(255, 60, 60, 1);\n"
	+ "  padding: 1px;\n"
	+ "  border: 1px solid rgb(255, 255, 255);\n"
	+ "  border-radius: 2px;\n"
	+ "}";

const DEFAULT_SETTINGS: HighlightNonAsciiSettings = {
	enabled: true,
	allowedChars: "",
	customCSS: DEFAULT_CSS,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAllowedSet(allowedChars: string): Set<string> {
	const set = new Set<string>();
	for (const ch of Array.from(allowedChars)) {
		if (ch.trim() === "" && ch !== "\u00A0") continue;
		set.add(ch);
	}
	return set;
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// State effects (for dispatching setting changes to CM6)
// ---------------------------------------------------------------------------

const toggleHighlight = StateEffect.define<boolean>();
const updateAllowlist = StateEffect.define<string>();

// ---------------------------------------------------------------------------
// Edit Mode (CodeMirror 6 extension)
// ---------------------------------------------------------------------------

interface SettingsFieldValue {
	enabled: boolean;
	allowedSet: Set<string>;
}

function buildEditorExtension(plugin: HighlightNonAsciiPlugin): Extension {
	const settingsField = StateField.define<SettingsFieldValue>({
		create(): SettingsFieldValue {
			return {
				enabled: plugin.settings.enabled,
				allowedSet: buildAllowedSet(plugin.settings.allowedChars),
			};
		},
		update(value: SettingsFieldValue, tr): SettingsFieldValue {
			let updated = value;
			for (const e of tr.effects) {
				if (e.is(toggleHighlight)) {
					updated = { ...updated, enabled: e.value };
				}
				if (e.is(updateAllowlist)) {
					updated = {
						...updated,
						allowedSet: buildAllowedSet(e.value),
					};
				}
			}
			return updated;
		},
	});

	const highlightPlugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate): void {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.transactions.some((tr) =>
						tr.effects.some(
							(e) =>
								e.is(toggleHighlight) ||
								e.is(updateAllowlist),
						),
					)
				) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const { enabled, allowedSet } =
					view.state.field(settingsField);
				if (!enabled) return Decoration.none;

				const builder = new RangeSetBuilder<Decoration>();
				const doc = view.state.doc;

				for (const { from, to } of view.visibleRanges) {
					const text = doc.sliceString(from, to);
					let i = 0;
					let pos = from;

					for (const ch of Array.from(text)) {
						const charLen = ch.length;
						const code = ch.codePointAt(0);

						if (
							code !== undefined &&
							code > 0x7f &&
							!allowedSet.has(ch)
						) {
							let runEnd = pos + charLen;
							const remaining = Array.from(
								text.slice(i + charLen),
							);
							for (const nextCh of remaining) {
								const nextCode = nextCh.codePointAt(0);
								if (
									nextCode !== undefined &&
									nextCode > 0x7f &&
									!allowedSet.has(nextCh)
								) {
									runEnd += nextCh.length;
								} else {
									break;
								}
							}
							builder.add(
								pos,
								runEnd,
								Decoration.mark({
									class: "non-ascii-highlight",
								}),
							);
							const skippedLen = runEnd - pos;
							i += skippedLen;
							pos = runEnd;
							continue;
						}

						i += charLen;
						pos += charLen;
					}
				}

				return builder.finish();
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);

	return [settingsField, highlightPlugin];
}

// ---------------------------------------------------------------------------
// Reading View (Post Processor)
// ---------------------------------------------------------------------------

function highlightNonAsciiInReading(
	el: HTMLElement,
	allowedSet: Set<string>,
): void {
	const nodes: Text[] = [];
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);

	while (walker.nextNode()) {
		const textNode = walker.currentNode as Text;
		if (
			textNode.textContent &&
			/[^\x00-\x7F]/.test(textNode.textContent)
		) {
			nodes.push(textNode);
		}
	}

	nodes.forEach((node) => {
		const wrapper = document.createElement("span");
		let html = "";
		let inHighlight = false;
		let buffer = "";

		for (const ch of Array.from(node.textContent || "")) {
			const code = ch.codePointAt(0);
			const shouldHighlight =
				code !== undefined && code > 0x7f && !allowedSet.has(ch);

			if (shouldHighlight) {
				if (!inHighlight) {
					html += escapeHtml(buffer);
					buffer = "";
					inHighlight = true;
				}
				buffer += ch;
			} else {
				if (inHighlight) {
					html += `<span class="non-ascii-highlight">${escapeHtml(buffer)}</span>`;
					buffer = "";
					inHighlight = false;
				}
				buffer += ch;
			}
		}

		if (inHighlight) {
			html += `<span class="non-ascii-highlight">${escapeHtml(buffer)}</span>`;
		} else {
			html += escapeHtml(buffer);
		}

		wrapper.innerHTML = html;
		if (node.parentNode) {
			node.parentNode.replaceChild(wrapper, node);
		}
	});
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------

class HighlightNonAsciiSettingTab extends PluginSettingTab {
	plugin: HighlightNonAsciiPlugin;

	constructor(app: App, plugin: HighlightNonAsciiPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Highlight Non-ASCII" });

		containerEl.createEl("p", {
			text: "Highlights any character outside the standard ASCII range (0x00-0x7F) "
				+ "in both Edit Mode (Live Preview) and Reading View. "
				+ "Use the allowlist to exclude specific characters from highlighting.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Enable highlighting")
			.setDesc(
				"Toggle non-ASCII character highlighting on or off.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enabled)
					.onChange(async (value) => {
						this.plugin.settings.enabled = value;
						await this.plugin.saveSettings();
						this.plugin.refreshAllEditors();
					}),
			);

		new Setting(containerEl)
			.setName("Allowed characters")
			.setDesc(
				"Paste characters or emojis here that should NOT be highlighted. "
					+ "Just paste them next to each other, no separators needed. "
					+ "Example: e--n",
			)
			.addTextArea((text) => {
				text.setPlaceholder("e.g. e--n")
					.setValue(this.plugin.settings.allowedChars)
					.onChange(async (value) => {
						this.plugin.settings.allowedChars = value;
						await this.plugin.saveSettings();
						this.plugin.refreshAllEditors();
					});
				text.inputEl.rows = 3;
				text.inputEl.cols = 40;
				text.inputEl.style.fontFamily = "monospace";
			});

		new Setting(containerEl)
			.setName("Custom CSS")
			.setDesc(
				"Override the default highlight style. "
					+ "Use the .non-ascii-highlight selector to customize "
					+ "background-color, border, padding, border-radius, etc.",
			);

		const cssContainer = containerEl.createDiv("hna-css-editor");

		const cssTextarea = cssContainer.createEl("textarea", {
			cls: "hna-css-textarea",
		});
		cssTextarea.value = this.plugin.settings.customCSS || DEFAULT_CSS;
		cssTextarea.rows = 8;
		cssTextarea.spellcheck = false;

		cssTextarea.addEventListener("change", async () => {
			this.plugin.settings.customCSS = cssTextarea.value;
			await this.plugin.saveSettings();
			this.plugin.updateCustomCSS();
		});
	}
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default class HighlightNonAsciiPlugin extends Plugin {
	settings!: HighlightNonAsciiSettings;
	private editorExtension!: Extension;
	private customStyleEl: HTMLStyleElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Inject custom CSS override element
		this.customStyleEl = document.createElement("style");
		this.customStyleEl.id = "highlight-non-ascii-custom-css";
		document.head.appendChild(this.customStyleEl);
		this.updateCustomCSS();

		// Editor extension for Edit / Live Preview
		this.editorExtension = buildEditorExtension(this);
		this.registerEditorExtension(this.editorExtension);

		// Reading view post processor
		this.registerMarkdownPostProcessor((el) => {
			if (this.settings.enabled) {
				const allowedSet = buildAllowedSet(
					this.settings.allowedChars,
				);
				highlightNonAsciiInReading(el, allowedSet);
			}
		});

		// Settings tab
		this.addSettingTab(
			new HighlightNonAsciiSettingTab(this.app, this),
		);

		// Command palette toggle
		this.addCommand({
			id: "toggle-non-ascii-highlight",
			name: "Toggle non-ASCII highlighting",
			callback: async () => {
				this.settings.enabled = !this.settings.enabled;
				await this.saveSettings();
				this.refreshAllEditors();
			},
		});
	}

	onunload(): void {
		if (this.customStyleEl) {
			this.customStyleEl.remove();
			this.customStyleEl = null;
		}
	}

	updateCustomCSS(): void {
		if (this.customStyleEl) {
			this.customStyleEl.textContent = this.settings.customCSS || "";
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshAllEditors(): void {
		// Push effects to all open editor views
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view as MarkdownView;
			if (
				view?.editor &&
				(view.editor as any).cm instanceof EditorView
			) {
				(view.editor as any).cm.dispatch({
					effects: [
						toggleHighlight.of(this.settings.enabled),
						updateAllowlist.of(this.settings.allowedChars),
					],
				});
			}
		});

		// Force reading view to re-render
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view as any;
			if (view?.previewMode?.rerender) {
				view.previewMode.rerender(true);
			}
		});
	}
}
