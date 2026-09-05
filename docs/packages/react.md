# `@repodeckhz/react`

Thin React wrapper around the `<repo-deck>` Custom Element. Provides
typed props and idiomatic event handlers instead of having to manage
attribute strings and event listeners yourself.

## Install

This package depends on `@repodeckhz/web`. Install both:

```sh
npm install @repodeckhz/react @repodeckhz/web
```

## Usage

```tsx
'use client';

import { RepoDeck } from '@repodeckhz/react';

export function Portfolio() {
  return (
    <RepoDeck
      owner="your-name"
      repo="your-repo"
      preset="standard"
      theme="auto"
      showStats
      dataUrl="direct"
      onLoad={(data) => console.log('loaded!', data)}
      onError={(err) => console.error('oh no', err)}
      onModalOpen={() => console.log('modal open')}
      onModalClose={() => console.log('modal closed')}
    />
  );
}
```

## Props

| Prop             | Type                                                                       | Maps to attribute         |
|------------------|----------------------------------------------------------------------------|----------------------------|
| `owner`          | `string` (required)                                                        | `owner`                    |
| `repo`           | `string` (required)                                                        | `repo`                     |
| `branch`         | `string`                                                                   | `branch`                   |
| `ref`            | `string`, tag/commit pin (NOT React's `ref`)                              | `ref`                      |
| `preset`         | `'minimal' \| 'standard' \| 'detailed'`                                   | `preset`                   |
| `configPath`     | `string`                                                                   | `config-path`              |
| `theme`          | `'light' \| 'dark' \| 'auto'`                                             | `theme`                    |
| `modalSections`  | `string` (comma-separated)                                                 | `modal-sections`           |
| `radius`         | `'sharp' \| 'soft' \| 'round' \| string`                                  | `radius`                   |
| `dataUrl`        | `string`                                                                   | `data-url`                 |
| `showStats`      | `boolean`                                                                  | `show-stats` (presence)    |
| `lazy`           | `boolean`                                                                  | `lazy` (presence)          |
| `hideBranding`   | `boolean`                                                                  | `hide-branding` (presence) |
| `noOptimize`     | `boolean`                                                                  | `no-optimize` (presence)   |
| `token`          | `string`                                                                   | `token`                    |
| `locale`         | `'en' \| 'pt' \| 'es' \| 'fr'`                                            | `locale`                   |
| `debug`          | `boolean`                                                                  | `debug` (presence)         |
| `className`      | `string`                                                                   | wrapper `<div>`             |
| `style`          | `React.CSSProperties`                                                      | wrapper `<div>`             |
| `onLoad`         | `(data: CardData) => void`                                                 | `repodeck:loaded`           |
| `onError`        | `(error: RepoDeckError-ish) => void`                                       | `repodeck:error`            |
| `onModalOpen`    | `() => void`                                                               | `repodeck:modal-open`       |
| `onModalClose`   | `() => void`                                                               | `repodeck:modal-close`      |

Boolean props become **attribute-presence** flags (e.g. `showStats`
means the attribute `show-stats=""` is set), matching how the
underlying element reads them.

## The `ref` prop collision

The HTML `ref` attribute (tag/commit pin) clashes with React's
`ref` for forwarding DOM refs. The component resolves this by
imperatively attributing `ref` to the element via `useEffect`,
while still allowing `useRef<HTMLElement>(null)` on the React side.

```tsx
const innerRef = useRef<HTMLElement>(null);

<RepoDeck
  ref={innerRef}
  owner="…"
  repo="…"
  // tag/commit pin - passed through to the underlying element:
  ref="v1.2.3"      {/* TS will yell - see escape hatch below */}
```

If you need the tag/commit pin in strict TypeScript:

```tsx
const extra = { ref: 'v1.2.3' } as Partial<RepoDeckProps>;

<RepoDeck
  ref={innerRef}
  owner="…"
  repo="…"
  {...extra}
/>
```

## `<RepoDeckList>`

There's a companion export for the `<repodeck-list>` element. Same
approach (typed props, fewer event handlers):

```tsx
import { RepoDeckList } from '@repodeckhz/react';

export function MyProjects() {
  return (
    <RepoDeckList
      repos="me/repo-a,me/repo-b,me/repo-c"
      preset="standard"
      sort="stars"
      sortOrder="desc"
      gap="1.25rem"
    />
  );
}
```

The list inherits shared attributes (`preset`, `theme`, `radius`,
`dataUrl`, `showStats`, `lazy`, `hideBranding`, `noOptimize`,
`token`, `locale`, `modalSections`, `configPath`) onto each rendered
item.

## Next

- [package source](../../web-component/): under the hood, it's just
  attribute wiring.
- [API reference](../api-reference.md).
