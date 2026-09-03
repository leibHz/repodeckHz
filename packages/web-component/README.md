# repodeck

> GitHub repos as embeddable web cards. A Custom Element that reads a `config-repodeck/` folder from any repo and renders a polished card with an expandable modal. Works in any stack, no framework lock-in.

This is the **main product** of the repodeck package family. Drop one `<repo-deck>` tag on any page, get a polished card with screenshots, resume, README, and stats.

The bundle registers two elements:

- `<repo-deck>`, the current element (`repodeck.js`, use for new embeds).
- `<repo-deck>` / `<repodeck-list>`, legacy elements (`repodeck.js`, kept for backwards compatibility).

## Install

```bash
npm install repodeck
# or
bun add repodeck
```

## Quick start (any HTML page)

```html
<script type="module">
  import 'repodeck/auto';
</script>

<repo-deck
  owner="your-name"
  repo="your-repo"
  preset="standard"
  theme="auto"
  radius="soft"
></repo-deck>
```

The target repo must contain a `config-repodeck/` folder:

```
config-repodeck/
├── README.md          # expanded content (modal)
├── RESUME.txt         # short plain-text summary (card)
└── screenshots/       # project images, sorted alphabetically
    ├── 01-home.png
    └── 02-dashboard.png
```

## Framework integrations

### React / Next.js

```tsx
import 'repodeck/auto';

export default function Page() {
  return <repo-deck owner="your-name" repo="your-repo" preset="standard" />;
}
```

### Vue

```vue
<script setup>
import 'repodeck/auto';
</script>

<template>
  <repo-deck owner="your-name" repo="your-repo" preset="standard" />
</template>
```

### Svelte

```svelte
<script>
  import 'repodeck/auto';
</script>

<repo-deck owner="your-name" repo="your-repo" preset="standard" />
```

### Plain HTML (CDN via unpkg)

```html
<script type="module" src="https://unpkg.com/repodeck/dist/repodeck.js"></script>
<repo-deck owner="your-name" repo="your-repo"></repo-deck>
```

## Attributes

| Attribute | Default | Description |
|---|---|---|
| `owner` | required | GitHub owner |
| `repo` | required | GitHub repo |
| `branch` | `main` | Branch to read from |
| `ref` | (none) | Tag or commit SHA pin (overrides `branch`) |
| `preset` | `standard` | `minimal` \| `standard` \| `detailed` |
| `config-path` | `config-repodeck` | Name of the config folder |
| `theme` | `auto` | `light` \| `dark` \| `auto` |
| `modal-sections` | `readme,screenshots,link` | Ordered comma list |
| `radius` | `soft` | `sharp` \| `soft` \| `round` \| any CSS length |
| `data-url` | `/api/repodeck/data` | Endpoint serving CardData JSON, `inline` for pre-baked data, or `direct` for browser-only GitHub calls |
| `locale` | `en` | UI language: `en` \| `pt` \| `es` \| `fr` |
| `token` | (none) | GitHub token sent to the data endpoint (`Authorization: Bearer`), raises the rate limit |
| `show-stats` | (none) | Show stars/forks badge (fetches repo metadata) |
| `lazy` | (none) | Defer fetch until card is near viewport (IntersectionObserver) |
| `hide-branding` | (none) | Hide the "powered by repodeck" link |
| `no-optimize` | (none) | Disable the default WebP re-encoding of screenshots |
| `debug` | (none) | Verbose `console.log` of every fetch/lifecycle step (token-masked) |

## Image optimization

Screenshots load from `raw.githubusercontent.com` as PNG or JPEG. By default the component re-encodes them to WebP in the browser (canvas, capped at 1600px, quality 0.8) and swaps the `<img>` source for the compressed `blob:` URL. The conversion is local. Add `no-optimize` to keep the originals; WebP/AVIF/GIF/SVG images and hosts without CORS headers are skipped automatically.

## `<repodeck-list>`, the portfolio grid

```html
<script type="module">
  import 'repodeck/auto';
</script>

<repodeck-list
  repos="your-name/project-a,your-name/project-b,your-name/project-c"
  preset="standard"
  theme="auto"
  radius="soft"
  show-stats
  lazy
  sort="stars"
  sort-order="desc"
  filter-tag="library"
></repodeck-list>
```

One tag = a whole portfolio. Supports sorting (by frontmatter `order`, `stars`, `name`) and filtering (by frontmatter `tags`).

## Events

```js
const card = document.querySelector('repo-deck');
card.addEventListener('repodeck:loaded', (e) => console.log('data', e.detail.data));
card.addEventListener('repodeck:error',  (e) => console.log('error', e.detail.error));
card.addEventListener('repodeck:modal-open',  () => console.log('modal opened'));
card.addEventListener('repodeck:modal-close', () => console.log('modal closed'));
```

## Public API

```js
import { RepoDeckAPI } from 'repodeck';

// i18n
RepoDeckAPI.setLocale('pt');
RepoDeckAPI.setLocale('es', { viewDetails: 'Ver detalles', openOnGithub: 'Abrir en GitHub' });
RepoDeckAPI.getLocale(); // 'es'

// Analytics adapter
RepoDeckAPI.createAnalyticsAdapter((event) => {
  console.log(event.type, event.owner + '/' + event.repo);
  // event.type: 'viewed' | 'modal_open' | 'modal_close' | 'error'
});

// Inline data for data-url="inline"
RepoDeckAPI.provideInlineData({ /* CardData */ });

// Programmatic modal control
document.querySelector('repo-deck').openModal();
document.querySelector('repo-deck').closeModal();
```

## Theming (CSS custom properties)

```css
repo-deck {
  --repodeck-bg: #ffffff;
  --repodeck-border: #e5e7eb;
  --repodeck-accent: #ea580c;
  --repodeck-accent-fg: #ffffff;
  --repodeck-accent-soft: #fff4ec;
  --repodeck-radius: 14px;
  --repodeck-button-radius: 9px;
  --repodeck-modal-radius: 18px;
  --repodeck-title-color: #111827;
  --repodeck-text-color: #374151;
  --repodeck-muted-color: #6b7280;
  --repodeck-modal-bg: #ffffff;
  --repodeck-modal-overlay: rgba(15, 23, 42, 0.55);
  --repodeck-shadow: 0 4px 12px rgba(15,23,42,.06);
  --repodeck-shadow-hover: 0 20px 44px rgba(15,23,42,.16);
}
```

## Frontmatter (per-project customization)

Add YAML frontmatter to `README.md`:

```markdown
---
title: My Project
accent: "#0891b2"
order: 2
tags: library, charts
---
```

- `title` overrides the repo name on the card
- `accent` recolors the entire card (hex color)
- `order`, sort hint for `<repodeck-list>`
- `tags`, filter values for `<repodeck-list filter-tag="...">`

## Direct-GitHub mode (zero backend)

```html
<repo-deck
  owner="your-name"
  repo="your-repo"
  data-url="direct"
></repo-deck>
```

Calls the GitHub REST API directly from the browser (CORS-friendly). Subject to the 60 req/h anonymous rate limit. For high-traffic sites, point `data-url` to a self-hosted `@repodeck/core` endpoint instead.

## Debugging

Set the `debug` attribute on the element (or `options.debug: true` /
`REPODECK_DEBUG=1` in Node) to log every fetch/lifecycle step:
token-masked, prefixed with `[repodeck:…]`.

## License

MIT
