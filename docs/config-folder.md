# The `config-repodeck/` folder

Each repo you want to embed on your site needs a `config-repodeck/`
folder at the root. The contents there drive what shows up on the
card face and in the modal.

```
config-repodeck/
├── README.md          Markdown, sanitised, shown in the modal
├── RESUME.txt         Plain text, ≤ 280 chars ideal, shown on the card
└── screenshots/       Image folder (cover on the card, gallery in the modal)
    ├── 01-home.png
    └── 02-dashboard.png
```

None of these files are strictly required. Each missing file
results in a per-field error in the final card instead of crashing
the page. This is the **"erro por campo, sem tudo-ou-nada"**
contract baked into the architecture.

## `README.md`

Rendered as Markdown → sanitised HTML (`marked` + `DOMPurify`)
before injection into the modal. Security-sensitive tags (`<script>`,
`<style>`, `<iframe>`) are stripped; a curated allowlist selects
what's rendered. **You cannot use the README Markdown to inject
JavaScript into the page**, even by accident.

If you want to show the README right on the card (not just the
modal), use the `detailed` preset which adds a 140-character preview
line.

## `RESUME.txt`

A short plain-text pitch. The package normalises whitespace and
truncates long lines on the **last word boundary** above 60 % of
the configured character budget (default 280). The repository uses
CE-ASCII, so emoji + CJK + accented characters are OK.

When the modal opens the user sees the full README; the card face
only needs a one-line summary. That's the role of `RESUME.txt`.

### Localised variants

If you ship `RESUME.pt.txt`, `RESUME.fr.txt` etc. alongside the
default `RESUME.txt`, the card will try the locale-specific file
first when its `locale` attribute matches. This lets a Portuguese
visitor see the Portuguese summary, an English visitor the English
one, without serving two separate cards.

## `screenshots/`

Any image extension the package recognises (`.png`, `.jpg`,
`.jpeg`, `.webp`, `.gif`, `.svg`) is picked up. Subfolders are
ignored. Files are sorted **alphabetically**, so prefix naming like
`01-home.png`, `02-dashboard.png` gives you control over which shot
becomes the card's cover (the first image in alphabetical order).
The rest of the shots are shown in the modal gallery (plus a `+N`
badge on the card face when they exist).

Screenshots are served **directly** from
`raw.githubusercontent.com` so the GitHub API rate limit isn't
touched when the user views the card.

If a card has zero screenshots, the package generates a fallback
cover from the repo name (initials on a deterministic hue
gradient) so empty repos still look polished.

## Frontmatter at the top of `README.md`

You can override defaults at the very top of `config-repodeck/README.md`
using a YAML-ish frontmatter block:

```markdown
---
title: "My Card Title"
accent: "#f97316"
description: "Short pitch shown in galleries"
order: 3
topics: react, typescript
---
# Body of the README…
```

Recognised fields:

| Field         | Type                | Effect                                                       |
|---------------|---------------------|--------------------------------------------------------------|
| `title`       | string              | Overrides `repo.name` from the GitHub API as the card title. |
| `accent`      | hex colour          | Sets `--repodeck-accent` for the card's tonal highlights.    |
| `description` | string              | Overrides `repo.description` from the API.                    |
| `order`       | integer             | Sort order used by `<repodeck-list>`.                        |
| `topics`      | comma-separated     | Overrides the repo's GitHub Topics.                          |

Anything outside the allowlist is silently ignored, so a typo can
never pull in a stale frontmatter key.

## What's **not** in `config-repodeck`

- **Token / API key**: never. Tokens live in your server endpoint
  or are passed to `data-url="direct"` mode via element attribute in
  JavaScript (so it doesn't appear in your HTML source).
- **HTML / CSS / JS**: never. The frontend is owned by repodeck and
  themable via custom properties.
- **Anything sensitive**: the folder is meant to live in a public
  repo. Treat it like content.

## Creating the folder

```sh
npx repodeck init
```

Generates the folder with starter templates. See the
[CLI docs](./packages/cli.md) for `--repo` and `--force` flags.
