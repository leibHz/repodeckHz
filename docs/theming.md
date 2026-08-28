# Theming & customisation

Visually, repodeck is just CSS, no shadow-DOM-donut: every part is
either inherited or overrideable via plain CSS custom properties
(or `<part>` names if that's your preference). This page covers
the supported knobs.

## CSS variables

Set any of these on `repo-deck` (or on `:root` to apply globally):

```css
/* Backgrounds & strokes */
--repodeck-bg
--repodeck-border
--repodeck-modal-bg
--repodeck-modal-overlay

/* Text */
--repodeck-text-color
--repodeck-title-color
--repodeck-muted-color

/* Brand */
--repodeck-accent          /* main accent (links, badges, primary actions) */
--repodeck-accent-fg       /* text colour when on --repodeck-accent */
--repodeck-accent-soft     /* translucent tint of the accent for backdrops */

/* Radii */
--repodeck-radius          /* card container (see radius section below) */
--repodeck-button-radius   /* the "Open on GitHub" link in the modal */
--repodeck-modal-radius    /* modal container */

/* Sizes - leave defaults alone until you need them */
--repodeck-width
--repodeck-max-width
--repodeck-modal-width
--repodeck-modal-max-width
--repodeck-modal-max-height
```

Every variable falls back to a sensible default; set only what you
need to override.

## Themes

The `theme` attribute is a high-level switch:

| Value   | Behaviour                                              |
|---------|--------------------------------------------------------|
| `light` | Pin to the light palette regardless of OS.              |
| `dark`  | Pin to the dark palette regardless of OS.               |
| `auto`  | Follow `prefers-color-scheme: dark` from the OS.        |

The web component listens for changes to that media query and
re-renders.

To override `auto` per-card you can drop a style block on page load:

```css
:root { --repodeck-bg: #1e1e2e; }        /* dark-grey card */
@media (prefers-color-scheme: dark) {
  :root { --repodeck-bg: #0f172a; }
}
```

Or, programmatically, scope a variable to one card:

```html
<style>
  repo-deck#pinned {
    --repodeck-accent: #ff6b35;
    --repodeck-radius: 22px;
  }
</style>
<repo-deck id="pinned" owner="…" repo="…"></repo-deck>
```

## Radius presets

The `radius` attribute is a quick knob:

| Value     | Approximate effect                       |
|-----------|-------------------------------------------|
| `sharp`   | `2px` everywhere, almost right angles.   |
| `soft`    | `8-12px` on the card, the modern default.    |
| `round`   | Card `22px`, button `999px` (pill), modal `24px`. |
| `<css length>` | A raw CSS value (`14px`, `1.25rem`, …) applied uniformly. |

For finer control, override individual tokens:

```css
:root {
  --repodeck-radius: 22px;          /* card */
  --repodeck-button-radius: 4px;    /* tight pill button */
  --repodeck-modal-radius: 14px;    /* modal */
}
```

## Per-project accent

If your README frontmatter contains an `accent` field
(`accent: "#f97316"`), the card automatically tints itself with
that colour:

```markdown
---
title: Card title
accent: "#0891b2"   ← teal accent
order: 2
---
```

The value is parsed as a hex colour; invalid values are ignored.
The card uses the colour to set `--repodeck-accent` and a derived
`--repodeck-accent-soft` (10 % alpha).

## Branding

Each card renders a small **"powered by repodeck"** link in the
bottom-right of the modal. To hide it on individual cards, set the
`hide-branding` attribute (or `hideBranding` on
`<RepoDeck>`):

```html
<repo-deck owner="…" repo="…" hide-branding></repo-deck>
```

Branded presence keeps attribution open in the ecosystem. The
recommended pattern is to show it everywhere it's embedded by
default and only hide it on commercial contexts where you don't
want the marking.

## Reduced motion

`prefers-reduced-motion: reduce` is honoured automatically: modal
transitions and card hover animations are disabled when the user
prefers reduced motion. Nothing to configure.

## Next

- [Build-time data](./build-time.md): ship pre-fetched data so
  you can override visuals at the HTML/CSS level without coordinating
  with the API.
- [API reference](./api-reference.md): full token list and
  defaults.
