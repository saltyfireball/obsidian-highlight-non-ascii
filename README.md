# Highlight Non-ASCII

An Obsidian plugin that highlights any character outside the standard ASCII range (0x00-0x7F) in both Edit Mode (Live Preview) and Reading View.

Useful for catching invisible Unicode characters, accidental special characters, or non-standard punctuation in your notes.

## Features

- Highlights non-ASCII characters with a visible red background
- Works in both Edit Mode (Live Preview) and Reading View
- Configurable allowlist to exclude specific characters (accented letters, emojis, etc.)
- Toggle on/off from settings or the command palette

## Usage

1. Install and enable the plugin.
2. Non-ASCII characters will be highlighted automatically.
3. Use **Settings > Highlight Non-ASCII** to configure:
    - **Enable highlighting** -- toggle the feature on or off
    - **Allowed characters** -- paste characters that should NOT be highlighted (e.g. accented letters, specific emojis)
4. Use the command palette: **Toggle non-ASCII highlighting** to quickly enable/disable.

## Installation

### From Obsidian Community Plugins

**Might not be approved yet**

1. Open **Settings > Community Plugins > Browse**
2. Search for "Highlight Non-ASCII"
3. Click **Install**, then **Enable**

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases/latest)
2. Create a folder: `<vault>/.obsidian/plugins/highlight-non-ascii/`
3. Copy the downloaded files into that folder.
4. Restart Obsidian and enable the plugin in **Settings > Community Plugins**.

## License

MIT -- see [LICENSE](LICENSE) for details.
