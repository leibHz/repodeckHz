# Batch fetching with GraphQL

`prefetchCardData()` already collapses N repos into roughly N×3 REST
requests via a bounded worker pool. **`fetchMultipleReposViaGraphQL()`**
goes one step further: one GraphQL POST resolves metadata, README and
RESUME for up to N repos in a single HTTP request, with screenshots
falling back to a single auxiliary REST call per repo.

This is the recommended path when you're pre-baking a page with **12+
cards** and have a GitHub token available. For smaller pages or
anonymous builds, REST `prefetchCardData` is still cheaper (GraphQL
rejects anonymous requests entirely).

## Why a second transport?

A 20-card portfolio in REST mode costs ~60 requests during build. The
same build in GraphQL mode costs *one* GraphQL request plus **20**
auxiliary REST requests for screenshots/ listing, 21 requests instead
of 60. With the 5,000-points/hour GitHub token budget, GraphQL stays
well clear of the rate limit even for nightly rebuilds on the same
token.

| Mode                | Requests to build 20 cards | Token required? |
|---------------------|----------------------------|-----------------|
| REST `prefetchCardData` | ~60                    | optional        |
| **GraphQL (this)**      | **21** (1 GraphQL + 20 REST) | **yes**     |

## Rate limit math

GitHub's GraphQL point model (2025+): **1 point per request**, not
proportional to query complexity. So a single batch query for 10 repos
is 1 point against your hourly budget, same as fetching a single
`__typename` query. With `batchSize: 10` and a 5,000 point/h budget you
could in principle run ~500 batch builds/hour before hitting the limit;
in practice the auxiliary REST calls dominate the cost.

Anonymous GraphQL is **rejected**: `fetchMultipleReposViaGraphQL` will
throw `RepoDeckError('UNAUTHORIZED')` if you forget the token.

## Signature

```ts
import { fetchMultipleReposViaGraphQL } from '@repodeckhz/core';

const cards = await fetchMultipleReposViaGraphQL(
  [
    { owner: 'me', repo: 'project-a' },
    { owner: 'me', repo: 'project-b' },
    { owner: 'me', repo: 'project-c' },
  ],
  {
    token: process.env.GITHUB_TOKEN, // required
    batchSize: 10,                   // repos per GraphQL request (default 10)
    include: { readme: true, resume: true, screenshots: true, stats: true },
    locale: 'pt',                    // default locale (per-target overrides)
  },
);

// Map<'owner/repo', CardData> - same shape the REST path produces.
const a = cards.get('me/project-a');
console.log(a?.meta, a?.resume, a?.readme, a?.screenshots, a?.stats);
```

### Targets

Each target mirrors `PrefetchTarget` plus an optional `locale`:

```ts
interface GraphQLBatchTarget {
  owner: string;
  repo: string;
  branch?: string;          // default 'main'
  configPath?: string;       // default 'config-repodeck'
  include?: BuildOptions['include'];  // per-repo override of options.include
  locale?: string;           // try RESUME.<locale>.txt before RESUME.txt
}
```

### Options

| Option          | Type                          | Default       | Notes |
|-----------------|-------------------------------|---------------|-------|
| `token`         | `string`                      | required      | Throws `UNAUTHORIZED` if missing. |
| `batchSize`     | `number`                      | `10`          | Repos per GraphQL request. Clamped to `[1, 50]`. |
| `include`       | `BuildOptions['include']`     | `{ readme, resume, screenshots: true }` | Per-field mask inherited by targets without their own. |
| `timeoutMs`     | `number`                      | `30_000`      | GraphQL queries can take a while on big batches. |
| `retries`       | `number`                      | `2`           | Retries on 5xx and network errors (never on 401/403). |
| `resumeMaxChars`| `number`                      | `280`         | Forwarded to `parseResume`. |
| `restClient`    | `GitHubClient`                | (built from `token`) | Inject your own client if you want shared connection reuse / cache. |

### Result shape

A `Map<string, CardData>` keyed by `owner/repo`. Each card has the
**same shape** the REST path in `CardBuilder` produces, so the web
component and the rest of your toolchain don't need to branch on
transport. Per-field errors are preserved as `RepoDeckError` instances,
identical to `prefetchCardData`:

```ts
const card = cards.get('me/missing-project');
if (card && 'error' in (card.readme ?? {})) {
  console.warn('readme missing:', (card.readme as { error: RepoDeckError }).error.code);
}
```

## What goes into the GraphQL query

Per repo, the query projects three aliased sub-selection groups:

1. **`<alias>_meta`** - repo metadata (`stargazerCount`, `forkCount`,
   `forkCount`, `watchers.totalCount`, `issues.totalCount`,
   `defaultBranchRef.name`, `pushedAt`, `owner.login`, `owner.avatarUrl`,
   `description`, `homepageUrl`, `primaryLanguage.name`, `repositoryTopics`).
2. **`<alias>_readme`** - `object(expression: "<branch>:<path>/README.md")`
   via the `Blob.text` fragment.
3. **`<alias>_resume`** - `object(expression: "<branch>:<path>/RESUME.txt")`
   (or `RESUME.<locale>.txt` if a locale is set).

Aliases are `r0`, `r1`, … `rN`, allowing stable mapping back to input
targets. Screenshots/ are deliberately **not** in the GraphQL query:
enumerating a `Tree` inside the same request blows past the complexity
budget for batches of 10. Instead, screenshots are resolved via one
auxiliary REST call per repo (`GitHubClient.fetchDirectoryListing`),
which keeps the GraphQL query complexity within limits and only adds
one request per repo.

## Error isolation

`fetchMultipleReposViaGraphQL` follows the same per-field error model
as `CardBuilder`:

- If the **whole batch request** fails (HTTP 500 after retries, network
  error, GraphQL `errors` with no `data`), every repo in the batch gets
  a card with all four fields carrying a `RepoDeckError` (`NETWORK_ERROR`
  or `UNAUTHORIZED`). The batch call itself never throws.
- If a single repo is **inaccessible or deleted**, its `<alias>_meta`
  comes back as `null`, and that card's `stats`, `readme`, `resume`, and
  `screenshots` fields each carry a per-field `NOT_FOUND` error, but
  the rest of the batch is unaffected.
- If a repo's README is missing but RESUME exists, only `readme` carries
  a per-field error; the card still ships with resume + stats.

## End-to-end example: Astro (GraphQL mode)

```astro
---
import { fetchMultipleReposViaGraphQL } from '@repodeckhz/core';

const cards = await fetchMultipleReposViaGraphQL(
  [
    { owner: 'me', repo: 'rewrite-md' },
    { owner: 'me', repo: 'pixel-perfect' },
    { owner: 'me', repo: 'tiny-cli' },
    { owner: 'vercel', repo: 'next.js' },
    { owner: 'facebook', repo: 'react' },
  ],
  {
    token: import.meta.env.GITHUB_TOKEN,
    batchSize: 10,
    include: { readme: true, resume: true, screenshots: true, stats: true },
  },
);
---
<html>
<body>
  <script src="/repodeck.js" type="module"></script>
  {[...cards.entries()].map(([key, card]) => (
    <>
      <script type="application/json" data-for-repo={key}
              set:html={JSON.stringify(card)} />
      <repo-deck
        owner={card.meta.owner}
        repo={card.meta.repo}
        data-url="inline"
        preset="standard"
      />
    </>
  ))}
</body>
</html>
```

## End-to-end example: Next.js static export

```tsx
// app/page.tsx
import { fetchMultipleReposViaGraphQL } from '@repodeckhz/core';

export const dynamic = 'force-static';

export default async function Page() {
  const cards = await fetchMultipleReposViaGraphQL(
    [
      { owner: 'me', repo: 'a' },
      { owner: 'me', repo: 'b' },
      { owner: 'me', repo: 'c' },
    ],
    { token: process.env.GITHUB_TOKEN },
  );

  return (
    <>
      {[...cards.entries()].flatMap(([key, card]) => [
        <script
          key={`d-${key}`}
          type="application/json"
          data-for-repo={key}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(card) }}
        />,
        <repo-deck
          key={`c-${key}`}
          owner={card.meta.owner}
          repo={card.meta.repo}
          data-url="inline"
        />,
      ])}
    </>
  );
}
```

## When to pick GraphQL vs REST `prefetchCardData`

| Use case | Recommended |
|----------|-------------|
| Anonymous build (no token) | `prefetchCardData` (GraphQL rejects anonymous) |
| Small page (1-5 cards) | `prefetchCardData`, the GraphQL setup overhead isn't worth it |
| Big page (10+ cards), token available | `fetchMultipleReposViaGraphQL` |
| CI build with strict rate-limit budget | `fetchMultipleReposViaGraphQL` |
| You only need stats (no screenshots) | `fetchMultipleReposViaGraphQL`, pure GraphQL, no REST auxiliary calls |

## Next

- [`@repodeckhz/core` reference](./packages/core.md) for the full
  `fetchMultipleReposViaGraphQL` and `prefetchCardData` signatures.
- [Build-time data](./build-time.md) for the REST prefetch path and the
  `<repo-deck data-url="inline">` contract that consumes both.
