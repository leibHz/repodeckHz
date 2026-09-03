# API reference

Public types and methods for each package. Authoritative source of
truth is the TypeScript declarations in each package's
`dist/types.d.ts` file.

## Table of contents

- [`@repodeck/core`](#core)
- [`repodeck` (web component)](#web-component)
- [`@repodeck/react`](#react)

---

<a id="core"></a>

## `@repodeck/core`

```ts
import {
  // Classes (dependency-injection friendly)
  GitHubClient,
  GraphQLClient,
  Cache,
  CardBuilder,

  // Facades
  buildCardData,
  prefetchCardData,
  fetchMultipleReposViaGraphQL,

  // Presets / config
  defaultPresets,
  registerPreset,
  getPreset,
  listPresets,
  mergePresetWithUserConfig,

  // Parsers (pure)
  parseResume,
  parseReadme,
  parseReadmeFrontmatter,
  resolveScreenshots,

  // Layout / presentation
  assignBentoSpans,
  resolveScreenshotLayout,
  resolveRadiusTokens,
  buildRawUrl,

  // Errors
  RepoDeckError,
} from '@repodeck/core';
```

### Types

| Type              | Notes                                                  |
|-------------------|--------------------------------------------------------|
| `CardData`        | The aggregated output of one repo card.                |
| `CardMeta`        | `{ owner, repo, url, branch, configPath, fetchedAt }`. |
| `FieldResult<T>`  | `T \| { error: RepoDeckError }`.                      |
| `ResumeData`      | `{ text, truncated, locale? }`.                        |
| `ReadmeData`      | `{ html, raw, frontmatter? }`.                         |
| `Screenshot`      | `{ url, filename, alt }`.                              |
| `RepoStats`       | GitHub-derived repo statistics + metadata.              |
| `BuildOptions`    | `{ include, branch, configPath, token, ... }`.         |
| `PresetDefinition`| Shape of one preset.                                   |
| `RadiusTokens`    | `{ card, button, modal }`.                             |
| `LayoutItem`      | A single screenshot's slot in the modal gallery grid. |
| `ScreenshotLayout`| The resolved layout `{ mode, items, total, hidden }`.   |
| `PrefetchTarget`  | Single repo entry for `prefetchCardData` and `fetchMultipleReposViaGraphQL`. |
| `PrefetchOptions` | Options accepted by `prefetchCardData`.               |
| `GraphQLBatchTarget` | Single repo entry for the GraphQL batch (adds optional `locale`). |
| `GraphQLBatchOptions` | Options accepted by `fetchMultipleReposViaGraphQL` (token required). |

### `buildCardData(owner, repo, options?) → Promise<CardData>`

One-shot facade. Creates a `GitHubClient` and `CardBuilder`, runs
`build()`, returns the card.

### `prefetchCardData(targets, options?) → Promise<Map<string, CardData>>`

REST batch. `targets` is an array of `{ owner, repo, branch?, configPath?, include? }`; `options` is `{ concurrency?, token?, cache?, include?, timeoutMs?, retries?, debug? }`. See [Build-time data](./build-time.md).

### `fetchMultipleReposViaGraphQL(targets, options) → Promise<Map<string, CardData>>`

GraphQL batch. One POST resolves metadata + README + RESUME for up to
`batchSize` repos at once (default 10); screenshots fall back to a
single REST call per repo. `options.token` is **required**: anonymous
GraphQL is rejected by GitHub. Same `CardData` shape as the REST path.
See [Batch fetching with GraphQL](./batch-fetching.md).

### `GraphQLClient`

```ts
const client = new GraphQLClient({ token: process.env.GITHUB_TOKEN });
const data = await client.request<{ __typename: string }>('query { __typename }');
```

Low-level POST client for `https://api.github.com/graphql`. Throws
`RepoDeckError('UNAUTHORIZED')` on 401, `RepoDeckError('RATE_LIMITED')`
on 403, `RepoDeckError('NETWORK_ERROR')` on 5xx/transport errors or
GraphQL `errors` with no `data`. Retries on 5xx only.

### `validateConfig(owner, repo, options?) → void`

Early-fail input validation. Throws `RepoDeckError` with
`code: 'INVALID_CONFIG'` before any I/O.

### `GitHubClient`

```ts
const client = new GitHubClient({
  token: process.env.GITHUB_TOKEN,
  timeoutMs: 8000,    // per-request timeout (default 12000)
  retries: 2,         // 5xx / network errors only (default 2)
});

await client.fetchFileContent(owner, repo, 'config-repodeck/README.md');
await client.fetchDirectoryListing(owner, repo, 'config-repodeck/screenshots');
await client.fetchRepoStats(owner, repo);
await client.checkRateLimit();
```

All `fetch*` methods return `null` (file methods) on 404 and throw
`RepoDeckError` on any other failure.

### `Cache`

```ts
const cache = new Cache(5 * 60 * 1000);
cache.set('k', value, ttlMs);
cache.get('k');          // → value | undefined (if expired)
cache.delete('k');
cache.clear();
Cache.buildKey({ owner, repo, branch, configPath, include }); // → stable cache key
```

### `CardBuilder`

```ts
const builder = new CardBuilder(client, cache /* optional */);
const card = await builder.build(owner, repo, options);
```

Per-field error model: missing files become per-field errors, never
crash the card. `card.resume.error.code === 'NOT_FOUND'` etc.

### `parseResume(rawText, { maxChars? } = {}) → ResumeData`

Strips excess whitespace, truncates at the last word boundary above
60 % of the max-chars limit.

### `parseReadme(rawMarkdown) → Promise<ReadmeData>`

Renders markdown to **sanitised** HTML (`marked` + `DOMPurify`).
Lazy-loads both libraries on first call. Also extracts
frontmatter.

### Errors

```ts
class RepoDeckError extends Error {
  code: 'NOT_FOUND' | 'RATE_LIMITED' | 'UNAUTHORIZED' |
        'NETWORK_ERROR' | 'INVALID_CONFIG';
  status?: number;
  field?: string;
}
```

`toJSON()` produces a POJO suitable for transport.

---

<a id="web-component"></a>

## `repodeck` (web component)

The web component is a single Custom Element registered with the
name `repo-deck`. Its full attribute/event surface is documented
in [`packages/web-component.md`](./packages/web-component.md).

### Public surface (TypeScript)

```ts
// Window API
window.RepoDeck
  .setLocale(locale: string, strings?: RepoDeckLocaleStrings): void;
  .getLocale(): string;
  .t(key: string): string;
  .createAnalyticsAdapter(handler: AnalyticsHandler): AnalyticsHandler;
  .removeAnalyticsAdapter(handler: AnalyticsHandler): void;
  .provideInlineData(cardData: CardData): void;

// Or as a named export:
import { RepoDeckAPI } from 'repodeck';
```

### Types

```ts
interface RepoDeckLocaleStrings { [key: string]: string | undefined; }
interface RepoDeckAnalyticsEvent {
  type: 'viewed' | 'modal_open' | 'modal_close' | 'error' | string;
  name: string;
  owner: string | null;
  repo: string | null;
  detail: Record<string, unknown>;
  timestamp: number;
}
type AnalyticsHandler = (event: RepoDeckAnalyticsEvent) => void;
```

### Inline data mode

`data-url="inline"` reads from the matching
`<script type="application/json" data-for-repo="<owner>/<repo>">`
block in the document, or from the most recently provided
`RepoDeckAPI.provideInlineData(card)` value.

---

<a id="react"></a>

## `@repodeck/react`

```tsx
import { RepoDeck, RepoDeckList } from '@repodeck/react';

<RepoDeck
  owner={owner}
  repo={repo}
  preset="standard"
  showStats
  onLoad={(data) => …}
  onError={(err) => …}
  onModalOpen={() => …}
  onModalClose={() => …}
  ref={refObject /* React ref */}
/>

<RepoDeckList
  repos="me/a,me/b,me/c"
  sort="stars"
  sortOrder="desc"
/>
```

Full props tables live in
[`packages/react.md`](./packages/react.md).

### Ref forwarding

```tsx
const cardRef = useRef<HTMLElement>(null);
<RepoDeck owner="me" repo="a" ref={cardRef} />;
```

The component uses `React.forwardRef`; the `ref` prop is forwarded
to the underlying `<repo-deck>`. The HTML `ref` attribute (tag
pin) is **not** the same as React's `ref`; pass it via the
`ref:` key in your props (with a TypeScript escape hatch if
needed); see [`packages/react.md`](./packages/react.md) for the
details.
