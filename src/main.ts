import {
	Plugin,
	PluginSettingTab,
	Setting,
	App,
	MarkdownView,
	TFile,
} from "obsidian";
// codemirror packages are provided by Obsidian at runtime
// eslint-disable-next-line import/no-extraneous-dependencies
import {
	ViewPlugin,
	Decoration,
	DecorationSet,
	EditorView,
	ViewUpdate,
} from "@codemirror/view";
// eslint-disable-next-line import/no-extraneous-dependencies
import {
	StateField,
	StateEffect,
	RangeSetBuilder,
	Extension,
} from "@codemirror/state";
import type { ObsidianEditor, ObsidianPreviewMode } from "./global.d";

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

// ---------------------------------------------------------------------------
// State effects (for dispatching setting changes to CM6)
// ---------------------------------------------------------------------------

const FRONTMATTER_KEY = "highlight-non-ascii";

const toggleHighlight = StateEffect.define<boolean>();
const updateAllowlist = StateEffect.define<string>();
const updateFrontmatterDisabled = StateEffect.define<boolean>();

// ---------------------------------------------------------------------------
// Edit Mode (CodeMirror 6 extension)
// ---------------------------------------------------------------------------

interface SettingsFieldValue {
	enabled: boolean;
	allowedSet: Set<string>;
	frontmatterDisabled: boolean;
}

function buildEditorExtension(plugin: HighlightNonAsciiPlugin): Extension {
	const settingsField = StateField.define<SettingsFieldValue>({
		create(): SettingsFieldValue {
			return {
				enabled: plugin.settings.enabled,
				allowedSet: buildAllowedSet(plugin.settings.allowedChars),
				frontmatterDisabled: plugin.isActiveFileDisabledByFrontmatter(),
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
				if (e.is(updateFrontmatterDisabled)) {
					updated = { ...updated, frontmatterDisabled: e.value };
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
								e.is(updateAllowlist) ||
								e.is(updateFrontmatterDisabled),
						),
					)
				) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const { enabled, allowedSet, frontmatterDisabled } =
					view.state.field(settingsField);
				if (!enabled || frontmatterDisabled) return Decoration.none;

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
			// eslint-disable-next-line no-control-regex -- intentionally detecting non-ASCII via control char boundary
			/[^\x00-\x7F]/.test(textNode.textContent)
		) {
			nodes.push(textNode);
		}
	}

	nodes.forEach((node) => {
		const wrapper = createSpan();
		let inHighlight = false;
		let buffer = "";

		const flushBuffer = () => {
			if (buffer.length === 0) return;
			if (inHighlight) {
				wrapper.createSpan({ cls: "non-ascii-highlight", text: buffer });
			} else {
				wrapper.appendText(buffer);
			}
			buffer = "";
		};

		for (const ch of Array.from(node.textContent || "")) {
			const code = ch.codePointAt(0);
			const shouldHighlight =
				code !== undefined && code > 0x7f && !allowedSet.has(ch);

			if (shouldHighlight) {
				if (!inHighlight) {
					flushBuffer();
					inHighlight = true;
				}
				buffer += ch;
			} else {
				if (inHighlight) {
					flushBuffer();
					inHighlight = false;
				}
				buffer += ch;
			}
		}

		flushBuffer();

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

		;

		containerEl.createEl("p", {
			text: "Highlights any character outside the standard ASCII range (0x00-0x7F) "
				+ "in both Edit Mode (Live Preview) and Reading View. "
				+ "Use the allowlist to exclude specific characters from highlighting.",
			cls: "setting-item-description",
		});

		const frontmatterHint = containerEl.createDiv("hna-frontmatter-hint");
		new Setting(frontmatterHint).setName("Per-note control").setHeading();
		frontmatterHint.createEl("p", {
			text: "You can disable highlighting for a specific note by adding "
				+ "the following to its frontmatter:",
		});
		const snippetText = "---\nhighlight-non-ascii: false\n---";
		const codeWrapper = frontmatterHint.createDiv("hna-code-wrapper");
		const codeBlock = codeWrapper.createEl("pre");
		codeBlock.createEl("code", { text: snippetText });
		const copyBtn = codeWrapper.createEl("button", {
			text: "Copy",
			cls: "hna-copy-btn",
			attr: { type: "button", "aria-label": "Copy to clipboard" },
		});
		copyBtn.addEventListener("click", () => {
			void navigator.clipboard.writeText(snippetText);
			copyBtn.textContent = "Copied!";
			setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
		});
		frontmatterHint.createEl("p", {
			text: "If the property is missing or set to true, highlighting "
				+ "remains active (as long as the global toggle above is enabled).",
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
				text.setPlaceholder("Paste allowed characters here")
					.setValue(this.plugin.settings.allowedChars)
					.onChange(async (value) => {
						this.plugin.settings.allowedChars = value;
						await this.plugin.saveSettings();
						this.plugin.refreshAllEditors();
					});
				text.inputEl.rows = 3;
				text.inputEl.cols = 40;
				text.inputEl.addClass("hna-monospace");
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

		cssTextarea.addEventListener("change", () => {
			this.plugin.settings.customCSS = cssTextarea.value;
			void this.plugin.saveSettings();
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

		// Dynamic style element is required for user-customizable CSS at runtime
		// eslint-disable-next-line obsidianmd/no-forbidden-elements -- dynamic user-editable CSS requires a style element
		this.customStyleEl = document.head.createEl("style");
		this.customStyleEl.id = "highlight-non-ascii-custom-css";
		this.updateCustomCSS();

		// Editor extension for Edit / Live Preview
		this.editorExtension = buildEditorExtension(this);
		this.registerEditorExtension(this.editorExtension);

		// Reading view post processor
		this.registerMarkdownPostProcessor((el, ctx) => {
			if (!this.settings.enabled) return;
			if (ctx.sourcePath) {
				const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
				if (file instanceof TFile && this.isFileDisabledByFrontmatter(file)) {
					return;
				}
			}
			const allowedSet = buildAllowedSet(this.settings.allowedChars);
			highlightNonAsciiInReading(el, allowedSet);
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

		// Re-check frontmatter when metadata changes
		this.registerEvent(
			this.app.metadataCache.on("changed", () => {
				this.dispatchFrontmatterUpdate();
			}),
		);

		// Re-check frontmatter when switching files
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.dispatchFrontmatterUpdate();
			}),
		);
	}

	isFileDisabledByFrontmatter(file: TFile): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- frontmatter values are untyped
		const value = cache?.frontmatter?.[FRONTMATTER_KEY];
		return value === false || value === "false";
	}

	isActiveFileDisabledByFrontmatter(): boolean {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view?.file) return false;
		return this.isFileDisabledByFrontmatter(view.file);
	}

	private dispatchFrontmatterUpdate(): void {
		const disabled = this.isActiveFileDisabledByFrontmatter();
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view as MarkdownView;
			if (view?.editor) {
				const editorCm = (view.editor as unknown as ObsidianEditor).cm;
				if (editorCm instanceof EditorView) {
					editorCm.dispatch({
						effects: [updateFrontmatterDisabled.of(disabled)],
					});
				}
			}
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
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- loadData returns any
		const data = await this.loadData();
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			data as Partial<HighlightNonAsciiSettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshAllEditors(): void {
		// Push effects to all open editor views
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view as MarkdownView;
			if (view?.editor) {
				const editorCm = (view.editor as unknown as ObsidianEditor).cm;
				if (editorCm instanceof EditorView) {
					editorCm.dispatch({
						effects: [
							toggleHighlight.of(this.settings.enabled),
							updateAllowlist.of(this.settings.allowedChars),
						],
					});
				}
			}
		});

		// Force reading view to re-render
		this.app.workspace.iterateAllLeaves((leaf) => {
			const preview = (leaf.view as unknown as ObsidianPreviewMode).previewMode;
			if (preview?.rerender) {
				preview.rerender(true);
			}
		});
	}
}
