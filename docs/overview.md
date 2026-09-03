# Overview

`repodeck` is a monorepo of three npm packages that turn a GitHub
repository into an embeddable web card. You drop a `config-repodeck/`
folder inside the repo you want to showcase, paste one HTML tag where
you want the card to appear, and the component does the rest.

The core idea is **configuration lives in the showcased repo, not in
your site**. The README, the screenshots and the short summary that
the card displays all come from the same place where the project
itself evolves, so there is no second source of truth to keep in sync.

## The three packages

```
repodeck/
├── packages/
│   ├── core/              @repodeck/core        Headless data layer. No DOM.
│   ├── web-component/     repodeck              <repo-deck> Custom Element.
│   └── react/             @repodeck/react       <RepoDeck> wrapper.
```

| Package             | Install              | When to use                                                                          |
|---------------------|----------------------|--------------------------------------------------------------------------------------|
| `repodeck`          | `npm i repodeck`     | The default. Plain HTML, Vue, Svelte, Angular, anything with a `<script>` tag.        |
| `@repodeck/react`   | `npm i @repodeck/react repodeck` | React users. Idiomatic `<RepoDeck owner="…" repo="…" />` JSX.                |
| `@repodeck/core`    | `npm i @repodeck/core`       | SSR, SSG, custom templates, build-time batch fetching, server-to-server pipelines. |

If you only need a card on a page, `npm i repodeck` is enough.

## How a card is built

When the page mounts `<repo-deck owner="me" repo="hello">`, the
component:

1. Calls the GitHub REST API (or your custom endpoint) to fetch the
   contents of `config-repodeck/` inside `me/hello`.
2. Parses each file into typed data: `README.md` → sanitised HTML
   (`marked` + `DOMPurify`), `RESUME.txt` → truncated plain text,
   `screenshots/` → ordered list with `raw.githubusercontent.com`
   URLs.
3. Renders the card: the first screenshot becomes a cover, extra
   shots collapse behind a `+N` badge; the modal holds the full
   gallery. The layout follows the `preset` attribute (minimal,
   standard, detailed).
4. When the user clicks the card, opens a modal with whichever
   sections were named in `modal-sections` (defaults to
   `readme,screenshots,link`).

If the user prefers to do all that fetching **before** the page is
served (next section), the web component can also consume
already-fetched `CardData` directly from a `<script>` tag; see
[Build-time data](./build-time.md).

## The `config-repodeck/` convention

The repo you want to embed on your site needs a folder called
`config-repodeck/` at its root. None of the files inside that folder
are strictly required. Each missing file produces a per-field error
in the card, never a broken page:

```
config-repodeck/
├── README.md          shown in the card modal (Markdown, sanitised)
├── RESUME.txt         shown on the card face (≤ 280 chars ideal)
└── screenshots/       image folder (cover on the card, gallery in the modal)
    ├── 01-home.png
    └── 02-dashboard.png
```

Optional extras supported out of the box today:

- **Frontmatter** at the top of `README.md` for per-card
  configuration like `accent` colour, custom `title`, `description`,
  `order` and `topics` overrides.
- **Locale switching**: a `RESUME.pt.txt`, `RESUME.fr.txt` etc.
  alongside the default `RESUME.txt` lets the card pick a localised
  version based on the `locale` attribute.

See [The `config-repodeck/` folder](./config-folder.md) for the
nitty-gritty.

## Events, theming and the public API

The component fires typed custom events (`repodeck:loaded`,
`repodeck:error`, `repodeck:modal-open`, `repodeck:modal-close`) so
you can plug analytics, A/B tests or any external interaction
without touching the component source.

Everything visual is overridable through CSS custom properties
(`--repodeck-bg`, `--repodeck-accent`, …), so dark mode, custom
brand colours and bespoke radii are just CSS, no rebuild needed.

See [Theming & customisation](./theming.md) for the full list and
[API reference](./api-reference.md) for every method and type.
