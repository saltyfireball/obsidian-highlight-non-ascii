import {
	Plugin,
	PluginSettingTab,
	Setting,
	App,
	MarkdownView,
	TFile,
	Notice,
} from "obsidian";
// codemirror packages are provided by Obsidian at runtime
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
import type { ObsidianEditor, ObsidianPreviewMode } from "./global.d";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

interface ReplacementRule {
	from: string;
	to: string;
}

interface HighlightNonAsciiSettings {
	enabled: boolean;
	enableReadingView: boolean;
	allowedChars: string;
	customCSS: string;
	replacements: ReplacementRule[];
}

const DEFAULT_CSS =
	".non-ascii-highlight {\n"
	+ "  background-color: rgba(255, 60, 60, 1);\n"
	+ "  padding: 1px;\n"
	+ "  border: 1px solid rgb(255, 255, 255);\n"
	+ "  border-radius: 2px;\n"
	+ "}";

const DEFAULT_REPLACEMENTS: ReplacementRule[] = [
	{ from: "\u2018", to: "'" },
	{ from: "\u2019", to: "'" },
	{ from: "\u201C", to: "\"" },
	{ from: "\u201D", to: "\"" },
	{ from: "\u2013", to: "-" },
	{ from: "\u2014", to: "--" },
	{ from: "\u2026", to: "..." },
	{ from: "\u00A0", to: " " },
];

const DEFAULT_SETTINGS: HighlightNonAsciiSettings = {
	enabled: true,
	enableReadingView: false,
	allowedChars: "",
	customCSS: DEFAULT_CSS,
	replacements: DEFAULT_REPLACEMENTS,
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
			/[^\p{ASCII}]/u.test(textNode.textContent)
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
						this.plugin.updateStatusBar();
					}),
			);

		new Setting(containerEl)
			.setName("Highlight in reading view")
			.setDesc(
				"When enabled, non-ASCII characters are also highlighted in reading/preview mode. "
					+ "Off by default since highlighting in edit mode is usually sufficient.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableReadingView)
					.onChange(async (value) => {
						this.plugin.settings.enableReadingView = value;
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

		// ── Auto-replace rules ──
		new Setting(containerEl).setName("Auto-replace rules").setHeading();

		containerEl.createEl("p", {
			text: "Define characters to find and replace when running the "
				+ "\"Auto replace non-ASCII characters\" command from the palette. "
				+ "Each rule replaces all occurrences of the \"find\" character with the \"replace\" text.",
			cls: "setting-item-description",
		});

		const rulesContainer = containerEl.createDiv("hna-rules-container");

		const renderRules = () => {
			rulesContainer.empty();

			this.plugin.settings.replacements.forEach((rule, index) => {
				const row = rulesContainer.createDiv("hna-rule-row");

				const fromLabel = row.createEl("span", { text: "Find:", cls: "hna-rule-label" });
				const fromInput = row.createEl("input", { cls: "hna-rule-input hna-monospace" });
				fromInput.type = "text";
				fromInput.value = rule.from;
				fromLabel.appendChild(fromInput);

				const toLabel = row.createEl("span", { text: "Replace:", cls: "hna-rule-label" });
				const toInput = row.createEl("input", { cls: "hna-rule-input hna-monospace" });
				toInput.type = "text";
				toInput.value = rule.to;
				toLabel.appendChild(toInput);

				const charCode = rule.from.codePointAt(0);
				const charInfo = charCode !== undefined ? `U+${charCode.toString(16).toUpperCase().padStart(4, "0")}` : "";
				row.createEl("span", { text: charInfo, cls: "hna-rule-charcode" });

				const deleteBtn = row.createEl("button", { text: "Remove", cls: "hna-rule-delete" });
				deleteBtn.tabIndex = -1;

				fromInput.addEventListener("change", () => {
					this.plugin.settings.replacements[index].from = fromInput.value;
					void this.plugin.saveSettings();
					const code = fromInput.value.codePointAt(0);
					const info = code !== undefined ? `U+${code.toString(16).toUpperCase().padStart(4, "0")}` : "";
					const codeSpan = row.querySelector(".hna-rule-charcode");
					if (codeSpan) codeSpan.textContent = info;
				});

				toInput.addEventListener("change", () => {
					this.plugin.settings.replacements[index].to = toInput.value;
					void this.plugin.saveSettings();
				});

				deleteBtn.addEventListener("click", () => {
					this.plugin.settings.replacements.splice(index, 1);
					void this.plugin.saveSettings();
					renderRules();
				});
			});
		};

		renderRules();

		new Setting(containerEl)
			.setName("Add replacement rule")
			.setDesc("Add a new find/replace pair to the list.")
			.addButton((button) =>
				button.setButtonText("Add rule").onClick(() => {
					this.plugin.settings.replacements.push({ from: "", to: "" });
					void this.plugin.saveSettings();
					renderRules();
				}),
			);
	}
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default class HighlightNonAsciiPlugin extends Plugin {
	settings!: HighlightNonAsciiSettings;
	private editorExtension!: Extension;
	private customStyleSheet: CSSStyleSheet | null = null;
	private statusBarEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Dynamic stylesheet for user-customizable CSS at runtime
		this.customStyleSheet = new CSSStyleSheet();
		document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.customStyleSheet];
		this.updateCustomCSS();

		// Editor extension for Edit / Live Preview
		this.editorExtension = buildEditorExtension(this);
		this.registerEditorExtension(this.editorExtension);

		// Reading view post processor
		this.registerMarkdownPostProcessor((el, ctx) => {
			if (!this.settings.enabled || !this.settings.enableReadingView) return;
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
				this.updateStatusBar();
			},
		});

		// Auto-replace command
		this.addCommand({
			id: "auto-replace-non-ascii",
			name: "Auto replace non-ASCII characters",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) {
					void this.runAutoReplace(file);
				}
				return true;
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
				this.updateStatusBar();
			}),
		);

		// Status bar counter
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("hna-status-bar");

		// Update count when editor content changes
		this.registerEvent(
			this.app.workspace.on("editor-change", () => {
				this.updateStatusBar();
			}),
		);

		// Update on file open
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.updateStatusBar();
			}),
		);

		// Initial update
		this.app.workspace.onLayoutReady(() => {
			this.updateStatusBar();
		});
	}

	isFileDisabledByFrontmatter(file: TFile): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		const value: unknown = cache?.frontmatter?.[FRONTMATTER_KEY];
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
		if (this.customStyleSheet) {
			document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== this.customStyleSheet);
			this.customStyleSheet = null;
		}
	}

	updateCustomCSS(): void {
		if (this.customStyleSheet) {
			this.customStyleSheet.replaceSync(this.settings.customCSS || "");
		}
	}

	updateStatusBar(): void {
		if (!this.statusBarEl) return;

		if (!this.settings.enabled) {
			this.statusBarEl.textContent = "";
			return;
		}

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			this.statusBarEl.textContent = "";
			return;
		}

		const content = view.editor.getValue();
		const allowedSet = buildAllowedSet(this.settings.allowedChars);
		let count = 0;

		for (const ch of Array.from(content)) {
			const code = ch.codePointAt(0);
			if (code !== undefined && code > 0x7f && !allowedSet.has(ch)) {
				count++;
			}
		}

		if (count > 0) {
			this.statusBarEl.textContent = `${count} non-ASCII`;
		} else {
			this.statusBarEl.textContent = "";
		}
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<HighlightNonAsciiSettings> | null;
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			data ?? {},
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

	private async runAutoReplace(file: TFile): Promise<void> {
		const rules = this.settings.replacements;
		if (rules.length === 0) {
			new Notice("No replacement rules configured.");
			return;
		}

		const content = await this.app.vault.read(file);
		let updated = content;
		let totalReplacements = 0;

		for (const rule of rules) {
			if (!rule.from) continue;
			const escaped = rule.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const regex = new RegExp(escaped, "g");
			const matches = updated.match(regex);
			if (matches) {
				totalReplacements += matches.length;
			}
			updated = updated.replace(regex, rule.to);
		}

		if (updated !== content) {
			await this.app.vault.modify(file, updated);
			new Notice(`Replaced ${totalReplacements} non-ASCII character(s).`);
			this.updateStatusBar();
		} else {
			new Notice("No matching characters found to replace.");
		}
	}
}
