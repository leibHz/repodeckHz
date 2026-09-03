# `repodeck` (web component)

The main product. Ships as a single Custom Element registered with
the name `repo-deck`. Works in any HTML page, any framework, any
hosting. No build step required.

```html
<script src="https://unpkg.com/repodeck@latest/dist/repodeck.js"></script>
<repo-deck owner="your-name" repo="your-repo" preset="standard"></repo-deck>
```

## Attributes

All attributes are reflected on the DOM. `connectedCallback`
triggers the first fetch; `attributeChangedCallback` refetches
(or only re-renders) when a relevant attribute changes.

| Attribute          | Required | Default            | Behaviour                                               |
|--------------------|----------|--------------------|---------------------------------------------------------|
| `owner`            | yes      | required           | GitHub owner / organisation.                             |
| `repo`             | yes      | required           | GitHub repository name.                                 |
| `branch`           | no       | `main`             | The branch / ref containing `config-repodeck/`.         |
| `ref`              | no       | (none)             | Tag or commit SHA pin (preferred for stable embeds).     |
| `preset`           | no       | `standard`         | `minimal` \| `standard` \| `detailed`.                  |
| `config-path`      | no       | `config-repodeck`  | Custom folder name inside the repo.                      |
| `theme`            | no       | `auto`             | `light` \| `dark` \| `auto` (follows OS preference).    |
| `modal-sections`   | no       | `readme,screenshots,link` | Ordered, comma-separated list of modal sections.  |
| `radius`           | no       | `soft`             | `sharp` \| `soft` \| `round` \| raw CSS length (e.g. `14px`). |
| `data-url`         | no       | `/api/repodeck/data` | URL that returns `CardData` JSON. Use `direct` for browser-only GitHub calls (see [Build-time data](../build-time.md)). |
| `locale`           | no       | `en`               | `en` \| `pt` \| `es` \| `fr` (or any registered bundle). |
| `token`            | no       | (none)             | Sent as `Authorization: Bearer` to the data endpoint, raising the rate limit. |
| `show-stats`       | no       | absent (off)       | Fetches `repo.stargazers_count`/`forks_count` and shows stars. |
| `lazy`             | no       | absent (off)       | IntersectionObserver-based deferred fetch.              |
| `hide-branding`    | no       | absent (on)        | Hides the small "powered by repodeck" link in the modal. |
| `no-optimize`      | no       | absent (on)        | Disables the default client-side WebP re-encoding of screenshots. |
| `debug`            | no       | absent             | Verbose `console.log` of every fetch/lifecycle step.    |

## Image optimization

Screenshots are served from `raw.githubusercontent.com` as PNG or
JPEG. By default the component re-encodes them to WebP in the
browser (canvas + `toBlob`, capped at 1600px on the longest edge,
quality 0.8) and swaps the `<img>` source for a `blob:` URL. The
conversion is local, nothing is uploaded.

To keep the originals, add the `no-optimize` attribute (the list
forwards it to every card). Already optimized formats (WebP, AVIF),
animations (GIF) and vectors (SVG) are skipped, and hosts without
CORS headers fall back to the untouched image automatically.

## Public methods

```ts
const card = document.querySelector('repo-deck');

// Modal control
card.openModal();
card.closeModal();
```

## Custom events

The element fires composed, bubbling events you can listen to from
any framework or vanilla DOM code:

| Event                    | When                                           |
|--------------------------|------------------------------------------------|
| `repodeck:loaded`        | Card data has loaded (`detail.data: CardData`).  |
| `repodeck:error`         | Fetch or render error (`detail.error: RepoDeckError`). |
| `repodeck:modal-open`    | Modal opened (`detail: { owner, repo, … }`).    |
| `repodeck:modal-close`   | Modal closed.                                   |

```js
card.addEventListener('repodeck:loaded', (e) => {
  console.log('CardData:', e.detail.data);
});
```

## `window.RepoDeck` API

When the script is loaded via `<script>` (not ESM), it exposes a
small global:

```js
window.RepoDeck.setLocale('pt');
window.RepoDeck.t('viewDetails');   // → "Ver detalhes"
window.RepoDeck.createAnalyticsAdapter((event) => {
  // event: { type: 'viewed' | 'modal_open' | 'modal_close' | 'error', ...}
});
```

ESM consumers can `import { RepoDeckAPI } from 'repodeck'` or
use `@repodeck/react`'s underlying web component instead.

## Layouts

- One screenshot → cover (single image, fills the top of the card).
- Multiple screenshots → the first shot is the cover; the rest are
  counted on a `+N` badge on the cover. The modal opens on the full
  gallery.
- Zero screenshots → generated fallback cover: initials on a
  hash-derived gradient.

## Accessibility

- Modal: `role="dialog"` + `aria-modal="true"`, focus trap, ESC
  & backdrop close, focus returns to opener.
- `prefers-reduced-motion: reduce` honoured for animations.
- All clickable elements are also keyboard-activatable.
- README sanitisation: `<script>`, `<style>`, `<iframe>` and other
  risky tags are stripped before display.

## Themed via CSS variables

See [Theming](../theming.md) for the full list of `--repodeck-*`
custom properties.

## Next

- [Build-time data](../build-time.md): feed the component
  pre-fetched data with `data-url="inline"`.
- [Theming](../theming.md): override every visual via CSS
  variables.
- [API reference](../api-reference.md): types and methods.
