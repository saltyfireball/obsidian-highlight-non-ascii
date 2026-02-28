# Highlight Non-ASCII

![Lunch](https://img.shields.io/badge/lunch-404%20not%20found-fff?style=flat&logo=doordash&logoColor=FFFFFF&label=lunch&labelColor=5B595C&color=A9DC76) ![Cookie Policy](https://img.shields.io/badge/cookies-accept%20all%20regrets-fff?style=flat&logo=cookiecutter&logoColor=FFFFFF&label=cookie%20policy&labelColor=5B595C&color=AB9DF2) ![AIM Status](https://img.shields.io/badge/aim%20status-away%20for%20snacks-fff?style=flat&logo=applemessages&logoColor=FFFFFF&label=AIM%20status&labelColor=5B595C&color=A9DC76) ![Captcha](https://img.shields.io/badge/captcha-am%20i%20a%20robot-fff?style=flat&logo=hcaptcha&logoColor=FFFFFF&label=captcha&labelColor=5B595C&color=5C7CFA) ![Hoverboard](https://img.shields.io/badge/hoverboard-not%20a%20board-fff?style=flat&logo=target&logoColor=FFFFFF&label=hoverboard&labelColor=5B595C&color=A9DC76) ![Thumbnail](https://img.shields.io/badge/thumbnail-surprised%20face-fff?style=flat&logo=youtube&logoColor=FFFFFF&label=thumbnail&labelColor=5B595C&color=FF6188) ![SLA](https://img.shields.io/badge/sla-best%20effort-fff?style=flat&logo=statuspage&logoColor=FFFFFF&label=SLA&labelColor=5B595C&color=FF6188) ![PHP](https://img.shields.io/badge/php-please%20no-fff?style=flat&logo=php&logoColor=FFFFFF&label=PHP&labelColor=5B595C&color=FF6188) ![Type Safety](https://img.shields.io/badge/type%20safety-any-fff?style=flat&logo=typescript&logoColor=FFFFFF&label=type%20safety&labelColor=5B595C&color=78DCE8)

<p align="center">
  <img src="assets/header.svg" width="600" />
</p>

An Obsidian plugin that highlights any character outside the standard ASCII range (0x00-0x7F) in both Edit Mode (Live Preview) and Reading View.

Useful for catching invisible Unicode characters, accidental special characters, or non-standard punctuation in your notes.

## Features

- Highlights non-ASCII characters with a visible red background
- Works in both Edit Mode (Live Preview) and Reading View
- Configurable allowlist to exclude specific characters (accented letters, emojis, etc.)
- Per-note control via frontmatter
- Customizable highlight CSS
- Toggle on/off from settings or the command palette

## Usage

1. Install and enable the plugin.
2. Non-ASCII characters will be highlighted automatically.
3. Use **Settings > Highlight Non-ASCII** to configure:
    - **Enable highlighting** -- toggle the feature on or off
    - **Allowed characters** -- paste characters that should NOT be highlighted (e.g. accented letters, specific emojis)
    - **Custom CSS** -- edit the highlight style directly
4. Use the command palette: **Toggle non-ASCII highlighting** to quickly enable/disable.

## Disabling for specific notes

Add the following frontmatter to any note where you want to turn off highlighting:

```yaml
---
highlight-non-ascii: false
---
```

If the property is missing or set to `true`, highlighting remains active (as long as the global toggle is enabled).

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
