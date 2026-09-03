# @repodeck/react

> Thin React wrapper around the [`repodeck`](../web-component) web component.

Gives React users a familiar `<RepoDeck />` component instead of dealing with custom-element refs directly.

## Install

```bash
npm install @repodeck/react repodeck
```

## Usage

```tsx
import { RepoDeck, RepoDeckList } from '@repodeck/react';

export default function Page() {
  return (
    <div>
      <RepoDeck
        owner="your-name"
        repo="your-repo"
        preset="standard"
        showStats
        onLoad={(data) => console.log('loaded', data)}
        onModalOpen={() => console.log('modal opened')}
      />

      <RepoDeckList
        repos="your-name/project-a,your-name/project-b,your-name/project-c"
        showStats
        lazy
        sort="stars"
        sortOrder="desc"
      />
    </div>
  );
}
```

## Props

### `<RepoDeck>`

| Prop | Type | Default | Description |
|---|---|---|---|
| `owner` | `string` | required | GitHub owner |
| `repo` | `string` | required | GitHub repo |
| `branch` | `string` | `main` | Branch to read from |
| `ref` | `string` | (none) | Tag or commit SHA pin |
| `preset` | `'minimal' \| 'standard' \| 'detailed'` | `standard` | Card preset |
| `configPath` | `string` | `config-repodeck` | Custom config folder name |
| `theme` | `'light' \| 'dark' \| 'auto'` | `auto` | Card theme |
| `modalSections` | `string` | `readme,screenshots,link` | Ordered modal sections |
| `radius` | `'sharp' \| 'soft' \| 'round' \| string` | `soft` | Corner radius |
| `dataUrl` | `string` | (none) | Custom data endpoint, `inline`, or `direct` |
| `token` | `string` | (none) | GitHub token sent to the data endpoint |
| `showStats` | `boolean` | false | Show stars/forks badge |
| `lazy` | `boolean` | false | IntersectionObserver lazy load |
| `hideBranding` | `boolean` | false | Hide "powered by" link |
| `noOptimize` | `boolean` | false | Disable the default WebP re-encoding of screenshots |
| `locale` | `'en' \| 'pt' \| 'es' \| 'fr'` | `en` | UI language |
| `debug` | `boolean` | false | Verbose lifecycle logging |
| `onLoad` | `(data) => void` | (none) | Called when data loads |
| `onError` | `(error) => void` | (none) | Called on error |
| `onModalOpen` | `() => void` | (none) | Called when modal opens |
| `onModalClose` | `() => void` | (none) | Called when modal closes |

### `<RepoDeckList>`

| Prop | Type | Default | Description |
|---|---|---|---|
| `repos` | `string` | required | Comma-separated `owner/repo` list |
| `cols` | `string` | (none) | Grid columns (e.g. `3` or `repeat(auto-fit, minmax(280px, 1fr))`) |
| `gap` | `string` | (none) | Grid gap (e.g. `16px`) |
| `sort` | `'none' \| 'order' \| 'stars' \| 'name'` | `none` | Sort key |
| `sortOrder` | `'asc' \| 'desc'` | `asc` | Sort direction |
| `filterTag` | `string` | (none) | Filter by frontmatter tags |
| `batchCheck` | `boolean` | false | Check rate limit before loading |
| `token` | `string` | (none) | GitHub token forwarded to each card |
| `noOptimize` | `boolean` | false | Disables WebP re-encoding on every card |
| ... | | | All other props from `<RepoDeck>` are forwarded to each card |

## License

MIT