/*
 * Highlight Non-ASCII Plugin for Obsidian
 *
 * Highlights any character outside the ASCII range (0x00-0x7F)
 * Works in both Edit Mode (Live Preview) and Reading View.
 */

const { Plugin, PluginSettingTab, Setting } = require("obsidian");
const { ViewPlugin, Decoration, MatchDecorator } = require("@codemirror/view");
const { StateField, StateEffect } = require("@codemirror/state");

const DEFAULT_SETTINGS = {
	enabled: true,
};

// ── State effect to toggle highlighting on/off ────────────────

const toggleHighlight = StateEffect.define();

// ── Edit Mode (CodeMirror 6) ──────────────────────────────────

function buildEditorExtension(plugin) {
	const enabledField = StateField.define({
		create() {
			return plugin.settings.enabled;
		},
		update(value, tr) {
			for (const e of tr.effects) {
				if (e.is(toggleHighlight)) return e.value;
			}
			return value;
		},
	});

	const nonAsciiMatcher = new MatchDecorator({
		regexp: /[^\x00-\x7F]+/g,
		decoration: Decoration.mark({ class: "non-ascii-highlight" }),
	});

	const highlightPlugin = ViewPlugin.fromClass(
		class {
			constructor(view) {
				this.decorations = view.state.field(enabledField)
					? nonAsciiMatcher.createDeco(view)
					: Decoration.none;
			}
			update(update) {
				const enabled = update.state.field(enabledField);
				if (!enabled) {
					this.decorations = Decoration.none;
					return;
				}
				this.decorations = nonAsciiMatcher.updateDeco(
					update,
					this.decorations,
				);
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);

	return [enabledField, highlightPlugin];
}

// ── Reading View (Post Processor) ─────────────────────────────

function highlightNonAsciiInReading(el) {
	const nodes = [];
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);

	while (walker.nextNode()) {
		if (/[^\x00-\x7F]/.test(walker.currentNode.textContent)) {
			nodes.push(walker.currentNode);
		}
	}

	nodes.forEach((node) => {
		const wrapper = document.createElement("span");
		wrapper.innerHTML = node.textContent.replace(
			/[^\x00-\x7F]+/g,
			(match) => `<span class="non-ascii-highlight">${match}</span>`,
		);
		node.parentNode.replaceChild(wrapper, node);
	});
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
				highlightNonAsciiInReading(el);
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
		// Push the toggle effect to all open editor views
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (view.editor && view.editor.cm) {
				view.editor.cm.dispatch({
					effects: toggleHighlight.of(this.settings.enabled),
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
