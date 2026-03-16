# Highlight Non-ASCII

![Lunch](https://img.shields.io/badge/lunch-404%20not%20found-fff?style=flat&logo=doordash&logoColor=FFFFFF&label=lunch&labelColor=5B595C&color=A9DC76) ![Cookie Policy](https://img.shields.io/badge/cookies-accept%20all%20regrets-fff?style=flat&logo=cookiecutter&logoColor=FFFFFF&label=cookie%20policy&labelColor=5B595C&color=AB9DF2) ![AIM Status](https://img.shields.io/badge/aim%20status-away%20for%20snacks-fff?style=flat&logo=applemessages&logoColor=FFFFFF&label=AIM%20status&labelColor=5B595C&color=A9DC76) ![Captcha](https://img.shields.io/badge/captcha-am%20i%20a%20robot-fff?style=flat&logo=hcaptcha&logoColor=FFFFFF&label=captcha&labelColor=5B595C&color=5C7CFA) ![Hoverboard](https://img.shields.io/badge/hoverboard-not%20a%20board-fff?style=flat&logo=target&logoColor=FFFFFF&label=hoverboard&labelColor=5B595C&color=A9DC76) ![Thumbnail](https://img.shields.io/badge/thumbnail-surprised%20face-fff?style=flat&logo=youtube&logoColor=FFFFFF&label=thumbnail&labelColor=5B595C&color=FF6188) ![SLA](https://img.shields.io/badge/sla-best%20effort-fff?style=flat&logo=statuspage&logoColor=FFFFFF&label=SLA&labelColor=5B595C&color=FF6188) ![PHP](https://img.shields.io/badge/php-please%20no-fff?style=flat&logo=php&logoColor=FFFFFF&label=PHP&labelColor=5B595C&color=FF6188) ![Type Safety](https://img.shields.io/badge/type%20safety-any-fff?style=flat&logo=typescript&logoColor=FFFFFF&label=type%20safety&labelColor=5B595C&color=78DCE8)

<p align="center">
  <img src="assets/header.svg" width="600" />
</p>

An Obsidian plugin that highlights any character outside the standard ASCII range (0x00-0x7F) in both Edit Mode (Live Preview) and Reading View.

Useful for catching invisible Unicode characters, accidental special characters, or non-standard punctuation in your notes.

## Features

- Highlights non-ASCII characters with a visible red background
- Works in Edit Mode (Live Preview) with optional Reading View support
- **Auto-replace** -- batch replace common non-ASCII characters with ASCII equivalents via the command palette
- Configurable replacement rules with a find/replace list in settings
- Configurable allowlist to exclude specific characters (accented letters, emojis, etc.)
- Per-note control via frontmatter
- **Status bar counter** -- shows the number of non-ASCII characters in the current note alongside Obsidian's word and character counts
- **Reading view toggle** -- optionally enable highlighting in preview/reading mode (off by default)
- Customizable highlight CSS
- Toggle on/off from settings or the command palette

    ![Example of Hightlights in action](assets/example_highlights.png)

## Usage

1. Install and enable the plugin.
2. Non-ASCII characters will be highlighted automatically.
3. Use **Settings > Highlight Non-ASCII** to configure:
    - **Enable highlighting** -- toggle the feature on or off
    - **Highlight in reading view** -- enable highlighting in preview/reading mode (off by default, since edit mode is usually sufficient)
    - **Allowed characters** -- paste characters that should NOT be highlighted (e.g. accented letters, specific emojis)
    - **Custom CSS** -- edit the highlight style directly
4. Use the command palette: **Toggle non-ASCII highlighting** to quickly enable/disable.

    ![Example of Hightlights in action](assets/example_counter.png)

## Auto-replace

The plugin includes a batch replacement feature for cleaning up common non-ASCII characters like curly quotes, em dashes, and non-breaking spaces.

### How to use

1. Open a note that contains non-ASCII characters
2. Open the command palette (`Ctrl/Cmd + P`)
3. Run **Highlight Non-ASCII: Auto replace non-ASCII characters**
4. All matching characters in the note will be replaced according to your configured rules

### Default replacement rules

The plugin comes with these defaults out of the box:

| Find           | Replace | Description              |
| -------------- | ------- | ------------------------ |
| `'` (U+2018)   | `'`     | Left single curly quote  |
| `'` (U+2019)   | `'`     | Right single curly quote |
| `"` (U+201C)   | `"`     | Left double curly quote  |
| `"` (U+201D)   | `"`     | Right double curly quote |
| `--` (U+2013)  | `-`     | En dash                  |
| `---` (U+2014) | `--`    | Em dash                  |
| `...` (U+2026) | `...`   | Horizontal ellipsis      |
| ` ` (U+00A0)   | ` `     | Non-breaking space       |

### Customizing rules

You can add, edit, or remove replacement rules in **Settings > Highlight Non-ASCII** under the **Auto-replace rules** section. Each rule shows:

- **Find** -- the character to search for
- **Replace** -- the text to replace it with
- **Unicode codepoint** -- the U+ identifier for the find character
- **Remove** button to delete the rule

Click **Add rule** to create a new find/replace pair.

![Example of Hightlights in action](assets/example_auto_replace_rules.png)

## Disabling for specific notes

Add the following frontmatter to any note where you want to turn off highlighting:

```yaml
---
highlight-non-ascii: false
---
```

If the property is missing or set to `true`, highlighting remains active (as long as the global toggle is enabled).

## Installation

### Obsidian Community Plugin (pending)

This plugin has been submitted for review to the Obsidian community plugin directory. Once approved, you will be able to install it directly from **Settings > Community plugins > Browse** by searching for "Highlight Non-ASCII".

### Using BRAT

You can install this plugin right now using the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin:

1. Install BRAT from **Settings > Community plugins > Browse** (search for "BRAT" by TfTHacker)
2. Open the BRAT settings
3. Under the **Beta plugins** section, click **Add beta plugin**

    ![BRAT beta plugin list](assets/brat_example_beta_plugin_list.png)

4. In the overlay, enter this plugin's repository: `https://github.com/saltyfireball/obsidian-highlight-non-ascii` (or just `saltyfireball/obsidian-highlight-non-ascii`)

    ![BRAT add beta plugin](assets/brat_example_beta_modal.png)

5. Leave the version set to latest

    ![BRAT beta plugin filled](assets/brat_example_beta_modal_filled.png)

6. Click **Add plugin**

### Manual

1. Download the latest release from the [Releases](https://github.com/saltyfireball/obsidian-highlight-non-ascii/releases) page
2. Copy `main.js`, `manifest.json`, and `styles.css` into your vault's `.obsidian/plugins/highlight-non-ascii/` directory
3. Enable the plugin in **Settings > Community plugins**

## License

MIT -- see [LICENSE](LICENSE) for details.
