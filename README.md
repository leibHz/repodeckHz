# repocard

> **Beta.** This project is in an early stage — APIs and behavior may change, and bugs are possible. Test before relying on it in production.

GitHub repos as embeddable web cards.

You add a `config-repodeck/` folder to your repo, paste one HTML tag where you want the card, and it pulls everything together: a short summary, a screenshot cover (with a `+N` badge when there are more), and a modal with the full README and a gallery. The card fetches data from the GitHub API at runtime, so you don't need a backend or build step.

Works in plain HTML, React, Vue, Svelte, Angular, whatever. No adapter, no framework dependency.

## Packages

This is a monorepo with three npm packages:

| Package | What it does | Install |
|---|---|---|
| [`@repocard/core`](./packages/core) | Headless data layer. Fetch, parse, build. No DOM. | `npm i @repocard/core` |
| [`repocard`](./packages/web-component) | `<repo-deck>` Custom Element (the main thing) + legacy `<repo-card>`. | `npm i repocard` |
| [`@repocard/react`](./packages/react) | `<RepoDeck />` wrapper for React. | `npm i @repocard/react repocard` |

If you just want to drop a card on a page, you only need `repocard`. The core package is there for people who want the data without any UI (SSR, static site generators, custom templates).

## Quick start

### HTML (any page)

```html
<script src="https://unpkg.com/repocard@latest/dist/repodeck.js"></script>

<repo-deck
  owner="your-name"
  repo="your-repo"
  preset="standard"
  theme="auto"
></repo-deck>
```

That's it. The component registers itself and renders once it enters the DOM.

The legacy `repocard.js` bundle still works (registers `<repo-card>`); new embeds should use `repodeck.js`.

### React / Next.js

```tsx
import { RepoDeck } from '@repocard/react';

<RepoDeck owner="your-name" repo="your-repo" preset="standard" showStats />
```

### Headless (SSR, SSG, any template engine)

```ts
import { buildCardData } from '@repocard/core';

const card = await buildCardData('your-name', 'your-repo', {
  include: { readme: true, resume: true, screenshots: true },
});

// card.resume.text, card.readme.html, card.screenshots[0].url, etc.
// Render it however you want.
```

## The `config-repodeck/` folder

The repo you want to showcase needs a `config-repodeck/` folder at the root:

```
config-repodeck/
├── README.md          # shown in the modal (supports markdown)
├── RESUME.txt         # short plain-text summary (shown on the card face)
└── screenshots/       # images, sorted alphabetically
    ├── 01-home.png
    └── 02-dashboard.png
```

None of these files are required. If `RESUME.txt` is missing, the card still renders, it just won't show a summary. Same for screenshots and the README. Each missing piece is reported as a field-level error, not a crash.

You can also add YAML frontmatter to the `README.md`:

```markdown
---
title: My project
accent: "#0891b2"
order: 2
tags: library, charts
---
```

## Attributes

The `<repo-deck>` element accepts these attributes:

| Attribute | Default | What it does |
|---|---|---|
| `owner` | (required) | GitHub repo owner |
| `repo` | (required) | GitHub repo name |
| `branch` | `main` | Branch to read files from |
| `preset` | `standard` | `minimal`, `standard`, or `detailed` |
| `theme` | `auto` | `light`, `dark`, or `auto` (follows system) |
| `config-path` | `config-repodeck` | Name of the config folder inside the repo |
| `modal-sections` | `readme,screenshots,link` | What shows in the modal, in what order |
| `radius` | `soft` | `sharp`, `soft`, `round`, or a CSS value like `14px` |
| `data-url` | `/api/repodeck/data` | Server endpoint, `inline` for pre-baked data, or `direct` to call the GitHub API from the browser |
| `locale` | `en` | UI language: `en`, `pt`, `es`, `fr` |
| `token` | absent | GitHub token sent to the data endpoint (raises the rate limit) |
| `show-stats` | absent | Show a stars/forks badge |
| `lazy` | absent | Defer the fetch until the card nears the viewport |
| `hide-branding` | absent | Hide the "powered by repodeck" link in the modal |
| `no-optimize` | absent | Disable the default WebP re-encoding of screenshots |
| `debug` | absent | Verbose `console.log` of every fetch/lifecycle step |

## Image optimization

Screenshots are fetched from `raw.githubusercontent.com` as PNG or JPEG, which can get heavy on a page with many cards. By default the component re-encodes them to WebP in the browser (canvas, capped at 1600px on the longest edge) and swaps the image source for the compressed version. Nothing is sent anywhere; the conversion happens locally. Add `no-optimize` to keep the original files, and images that are already WebP, GIF, SVG, or served by a host without CORS headers are left untouched automatically.

## Theming

The card ships with light and dark themes. You can override individual pieces with CSS custom properties:

```css
repo-deck {
  --repodeck-bg: #1e1e2e;
  --repodeck-border: #313244;
  --repodeck-title-color: #cdd6f4;
  --repodeck-text-color: #a6adc8;
  --repodeck-accent: #89b4fa;
  --repodeck-modal-bg: #1e1e2e;
  --repodeck-modal-overlay: rgba(0, 0, 0, 0.7);
  --repodeck-radius: 12px;
  --repodeck-button-radius: 8px;
  --repodeck-modal-radius: 16px;
}
```

## Events

The component fires custom events you can listen to:

```js
document.querySelector('repo-deck').addEventListener('repodeck:loaded', (e) => {
  console.log('Card loaded:', e.detail.data);
});
```

| Event | When it fires |
|---|---|
| `repodeck:loaded` | Data fetched and card rendered |
| `repodeck:error` | Something went wrong (detail includes the error) |
| `repodeck:modal-open` | Modal opened |
| `repodeck:modal-close` | Modal closed |

## Debugging

Every package can produce verbose logs. Nothing is logged by default.

- **Browser**: set the `debug` attribute on the element
  (`<repo-deck debug owner="…" repo="…">`) logs every fetch/lifecycle
  step, token-masked, prefixed with `[repodeck:…]`.
- **Server / Node**: pass `debug: true` to the core options
  (`buildCardData`, `prefetchCardData`, `fetchMultipleReposViaGraphQL`,
  `GitHubClient`, `CardBuilder`) or set `REPODECK_DEBUG=1` in the
  environment to enable it everywhere.

## Project structure

```
repocard/
├── packages/
│   ├── core/              @repocard/core
│   ├── web-component/     repocard
│   └── react/             @repocard/react
├── config-repodeck/       example config (this repo eats its own dog food)
└── package.json           workspace root
```

## Development

```bash
# install everything
bun install

# build all packages (ESM + CJS + types via tsup)
bun run build

# build one at a time
bun run build:core
bun run build:web-component
bun run build:react

# type check
bun run lint
```

## License

MIT
