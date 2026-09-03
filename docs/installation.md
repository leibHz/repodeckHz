# Installation

The package you install depends on how you plan to use repodeck.

## Plain HTML / web components

```sh
npm install repodeck
```

That's the only package you need to drop a card on a page:

```html
<script src="https://unpkg.com/repodeck@latest/dist/repodeck.js"></script>
<repo-deck
  owner="your-name"
  repo="your-repo"
  preset="standard"
  theme="auto"
></repo-deck>
```

The element registers itself on load and renders once it's in the
DOM.

## React / Next.js

For TypeScript-flavoured props and `onLoad` / `onError` event
handlers wired declaratively:

```sh
npm install @repodeck/react repodeck
```

```tsx
'use client';

import { RepoDeck } from '@repodeck/react';

export default function ProjectsPage() {
  return <RepoDeck owner="your-name" repo="your-repo" preset="standard" showStats />;
}
```

The React wrapper is intentionally thin. It sets attributes on the
underlying `<repo-deck>` element and forwards custom events to your
component's handlers. See `@repodeck/react`'s
[package docs](./packages/react.md) for the full props.

## Server-side / build-time (Next.js, Astro, Eleventy)

If you want to fetch card data at build time (or run a custom
endpoint that proxies the GitHub API behind your token):

```sh
npm install @repodeck/core
```

The core package is the headless layer. It builds typed `CardData`
objects and exposes them so any templating engine can render them.
See [`@repodeck/core`](./packages/core.md) for the public API and
[Build-time data](./build-time.md) for the static-generation
recipe.

## CLI

The `npx repodeck init` and `npx repodeck validate <owner>/<repo>`
commands live in the same `repodeck` package you've probably
already installed above. If you only want the CLI:

```sh
npm install --save-dev repodeck
```

See [`repodeck` CLI](./packages/cli.md).

## Pinning a version

We strongly recommend pinning a version instead of using `latest` in
production:

```html
<script src="https://unpkg.com/repodeck@0.6.0/dist/repodeck.js"></script>
```

The package follows [semver](https://semver.org). Patch releases
never break API; minors add features (opt-in); majors may break API.
