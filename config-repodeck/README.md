# repodeck

Turn any GitHub repository into a card you can embed on your site.

## How it works

1. Add a `config-repodeck/` folder to the repo you want to showcase
2. Put a `RESUME.txt` (short summary), a `README.md` (full description), and a `screenshots/` folder inside it
3. Paste a `<repo-deck>` tag on your page

The card fetches everything from the GitHub API and renders it. Click the card to open a modal with the full README, a screenshot gallery, and a link to the repo.

## Packages

| Package | What it does |
|---|---|
| `@repodeck/core` | Headless data layer. Fetches and parses config-repodeck/ contents. No DOM, no framework. |
| `repodeck` | The `<repo-deck>` Custom Element. Works in any stack. |
| `@repodeck/react` | `<RepoDeck />` wrapper for React projects. |

## Usage

```html
<script src="https://unpkg.com/repodeck@latest/dist/repodeck.js"></script>

<repo-deck
  owner="your-name"
  repo="your-repo"
  preset="standard"
  theme="auto"
></repo-deck>
```

## Features

- Three presets: minimal, standard, detailed
- Light, dark, and auto themes
- Bento grid layout for screenshots
- Modal with focus trap, ESC close, and full keyboard navigation
- Per-field error handling (missing README does not break the card)
- CSS custom properties for theming
- Configurable border radius (sharp, soft, round)
- i18n support (English, Portuguese, Spanish, French)
- Zero framework lock-in

## License

MIT
