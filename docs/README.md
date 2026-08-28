# repodeck documentation

Step-by-step guides for installing, configuring and embedding
repodeck cards in any kind of site. Start at the
[overview](./overview.md) if you're new.

## Table of contents

### Getting started
- [Overview: what repodeck is](./overview.md), the three layers and what each one is for.
- [Installation](./installation.md), `npm` in a website, a CLI, or a monorepo.
- [The `config-repodeck/` folder](./config-folder.md), how the source repo declares what shows up on the card.

### Packages
- [`@repocard/core`](./packages/core.md), headless data layer (server-side / build-time).
- [`repodeck` (web component)](./packages/web-component.md), the `<repo-deck>` Custom Element that ships as the main `repodeck` npm package.
- [`@repocard/react`](./packages/react.md), thin React wrapper around the web component.
- [`repodeck` CLI](./packages/cli.md), `npx repodeck init` and `npx repodeck validate`.

### Guides
- [Build-time data: `prefetchCardData()`](./build-time.md), fetch all your repos once at build (REST transport), skip runtime calls.
- [Batch fetching with GraphQL](./batch-fetching.md), `fetchMultipleReposViaGraphQL` for big pages with 12+ cards.
- [Theming & customisation](./theming.md), CSS variables, dark mode, `radius` presets, branding.

### Reference
- [API reference](./api-reference.md), every public type, function and method.
