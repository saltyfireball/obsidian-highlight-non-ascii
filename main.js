/*
 * Highlight Non-ASCII Plugin for Obsidian
 *
 * Highlights any character outside the ASCII range (0x00-0x7F)
 * Works in both Edit Mode (Live Preview) and Reading View.
 * Supports an allowlist of characters to exclude from highlighting.
 */

const { Plugin, PluginSettingTab, Setting } = require("obsidian");
const { ViewPlugin, Decoration, MatchDecorator } = require("@codemirror/view");
const { StateField, StateEffect } = require("@codemirror/state");

const DEFAULT_SETTINGS = {
	enabled: true,
	allowedChars: "",
};

// ── Helpers ───────────────────────────────────────────────────

function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build a regex that matches non-ASCII characters NOT in the allowlist.
// We match any run of non-ASCII chars, then filter in a replacer.
function buildAllowedSet(allowedChars) {
	const set = new Set();
	// Use Array.from to properly split multi-byte chars and emojis
	for (const ch of Array.from(allowedChars)) {
		if (ch.trim() === "" && ch !== "\u00A0") continue; // skip regular spaces but keep nbsp
		set.add(ch);
	}
	return set;
}

function isAllowed(char, allowedSet) {
	// Check the character itself and also surrogate pairs / ZWJ sequences
	return allowedSet.has(char);
}

// ── State effects ─────────────────────────────────────────────

const toggleHighlight = StateEffect.define();
const updateAllowlist = StateEffect.define();

// ── Edit Mode (CodeMirror 6) ──────────────────────────────────

function buildEditorExtension(plugin) {
	const settingsField = StateField.define({
		create() {
			return {
				enabled: plugin.settings.enabled,
				allowedSet: buildAllowedSet(plugin.settings.allowedChars),
			};
		},
		update(value, tr) {
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
			constructor(view) {
				this.view = view;
				this.decorations = this.buildDecorations(view);
			}

			update(update) {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.transactions.some((tr) =>
						tr.effects.some(
							(e) =>
								e.is(toggleHighlight) || e.is(updateAllowlist),
						),
					)
				) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view) {
				const { enabled, allowedSet } = view.state.field(settingsField);
				if (!enabled) return Decoration.none;

				const builder =
					new (require("@codemirror/state").RangeSetBuilder)();
				const doc = view.state.doc;

				for (const { from, to } of view.visibleRanges) {
					const text = doc.sliceString(from, to);
					// Walk through the string character by character using iterator
					let i = 0;
					const chars = Array.from(text);
					let pos = from;

					for (const ch of chars) {
						const charLen = ch.length; // UTF-16 length (2 for surrogate pairs)
						const code = ch.codePointAt(0);

						if (code > 0x7f && !allowedSet.has(ch)) {
							// Find runs of consecutive non-ascii non-allowed chars
							let runEnd = pos + charLen;
							// peek ahead
							const remaining = Array.from(
								text.slice(i + charLen),
							);
							for (const nextCh of remaining) {
								const nextCode = nextCh.codePointAt(0);
								if (
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
							// Skip ahead past the run
							const skipped = text.slice(i, i + (runEnd - pos));
							i += runEnd - pos;
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

// ── Reading View (Post Processor) ─────────────────────────────

function highlightNonAsciiInReading(el, allowedSet) {
	const nodes = [];
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);

	while (walker.nextNode()) {
		if (/[^\x00-\x7F]/.test(walker.currentNode.textContent)) {
			nodes.push(walker.currentNode);
		}
	}

	nodes.forEach((node) => {
		const wrapper = document.createElement("span");
		// Process character by character to respect allowlist
		let html = "";
		let inHighlight = false;
		let buffer = "";

		for (const ch of Array.from(node.textContent)) {
			const code = ch.codePointAt(0);
			const shouldHighlight = code > 0x7f && !allowedSet.has(ch);

			if (shouldHighlight) {
				if (!inHighlight) {
					// Flush normal buffer
					html += escapeHtml(buffer);
					buffer = "";
					inHighlight = true;
				}
				buffer += ch;
			} else {
				if (inHighlight) {
					// Flush highlight buffer
					html += `<span class="non-ascii-highlight">${escapeHtml(buffer)}</span>`;
					buffer = "";
					inHighlight = false;
				}
				buffer += ch;
			}
		}

		// Flush remaining
		if (inHighlight) {
			html += `<span class="non-ascii-highlight">${escapeHtml(buffer)}</span>`;
		} else {
			html += escapeHtml(buffer);
		}

		wrapper.innerHTML = html;
		node.parentNode.replaceChild(wrapper, node);
	});
}

function escapeHtml(str) {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// ── Settings Tab ──────────────────────────────────────────────

class HighlightNonAsciiSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Highlight Non-ASCII" });

		new Setting(containerEl)
			.setName("Enable highlighting")
			.setDesc("Toggle non-ASCII character highlighting on or off.")
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
				"Paste characters or emojis here that should NOT be highlighted. " +
					"Just paste them next to each other, no separators needed. " +
					"Example: é—ñ🔥✅",
			)
			.addTextArea((text) => {
				text.setPlaceholder("e.g. é—ñ🔥✅")
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
	}
}

// ── Plugin ────────────────────────────────────────────────────

module.exports = class HighlightNonAsciiPlugin extends Plugin {
	async onload() {
		await this.loadSettings();

		// Editor extension for Edit / Live Preview
		this.editorExtension = buildEditorExtension(this);
		this.registerEditorExtension(this.editorExtension);

		// Reading view post processor
		this.registerMarkdownPostProcessor((el) => {
			if (this.settings.enabled) {
				const allowedSet = buildAllowedSet(this.settings.allowedChars);
				highlightNonAsciiInReading(el, allowedSet);
			}
		});

		// Settings tab
		this.addSettingTab(new HighlightNonAsciiSettingTab(this.app, this));

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

		console.log("Highlight Non-ASCII plugin loaded");
	}

	onunload() {
		console.log("Highlight Non-ASCII plugin unloaded");
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	refreshAllEditors() {
		const allowedSet = buildAllowedSet(this.settings.allowedChars);

		// Push effects to all open editor views
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (view.editor && view.editor.cm) {
				view.editor.cm.dispatch({
					effects: [
						toggleHighlight.of(this.settings.enabled),
						updateAllowlist.of(this.settings.allowedChars),
					],
				});
			}
		});

		// Force reading view to re-render
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view && leaf.view.previewMode) {
				leaf.view.previewMode.rerender(true);
			}
		});
	}
};
