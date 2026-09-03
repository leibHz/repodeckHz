# Build-time data

Instead of letting each visitor's browser hit the GitHub API at
runtime, **fetch all your card data once when your site is built**
(or in a Node process) and ship the result as static HTML/JS. This is
the "Pinterest-style static embed" flow: nobody pays for repeated
fetches, the page is instant, and your rate-limit budget becomes
basically infinite.

There are two halves to making this work:

1. **`prefetchCardData()`** in `@repodeck/core` fetches many repos
   in parallel and returns a serialisable map.
2. **`data-url="inline"`** in the `<repo-deck>` web component:
   consumes a `<script type="application/json">` block and skips
   its own fetch entirely.

## `prefetchCardData(targets, options?)`

```ts
import { prefetchCardData } from '@repodeck/core';

const cards = await prefetchCardData(
  [
    { owner: 'me', repo: 'project-a' },
    { owner: 'me', repo: 'project-b' },
    { owner: 'me', repo: 'project-c', branch: 'master' }, // non-default branch
  ],
  {
    concurrency: 4,           // fetch up to 4 repos in parallel
    include: { readme: true, resume: true, screenshots: true },
    token: process.env.GITHUB_TOKEN,
  },
);

// → Map<string /* `${owner}/${repo}` */, CardData>
const a = cards.get('me/project-a');
console.log(a?.meta, a?.resume, a?.readme, a?.screenshots);
```

Each target accepts optional `branch`, `configPath` and `include`
overrides on top of the batch-level defaults:

The result is a `Map` keyed by `owner/repo`. It's harmless to
serialise to JSON and re-hydrate later. That's exactly what we want
when handing it to the web component. For pages with 12+ cards and a
GitHub token, see [Batch fetching with GraphQL](./batch-fetching.md)
for a transport that collapses the build cost even further.

### Concurrency

GitHub's unauthenticated rate limit is 60 req/h. A single repo is
about 3-4 requests (readme + resume + screenshots dir + (optional)
stats). Concurrency 4 means we chew ~16 request-units per minute
max, comfortable even for anonymous use. With a token, push it
to 8-12.

The function tracks the request budget using a sliding-window guard
and refuses to start a new request that would push the projected
count over the limit.

### Per-field errors

Same contract as `buildCardData`: missing files become per-field
errors, not fatal exits. So if `project-c` doesn't have a `RESUME.txt`
yet, your pre-baked page still embeds.

### Token

Pass `token: process.env.GITHUB_TOKEN` if you're running in CI or
in a server you control. The function never logs the token.

## Feeding it to `<repo-deck>` with `data-url="inline"`

After you have the data, render an HTML page that pairs each
`<repo-deck>` with a `<script>` block containing its `CardData`:

```html
<script type="application/json" data-for-repo="me/project-a">{"meta":{…},"resume":{…},"readme":{…},"screenshots":[…]}</script>
<repo-deck owner="me" repo="project-a" data-url="inline"></repo-deck>

<script type="application/json" data-for-repo="me/project-b">{…}</script>
<repo-deck owner="me" repo="project-b" data-url="inline"></repo-deck>
```

When the web component is mounted with `data-url="inline"`, it looks
up the immediately preceding JSON block and uses its data verbatim,
without making any network call.

### SSR alternatives

If you'd rather pass the data as a JS object instead of a `<script>`
tag, set it programmatically after import:

```js
import { RepoDeckAPI } from 'repodeck';

RepoDeckAPI.provideInlineData({ /* CardData */ });

// any subsequent <repo-deck data-url="inline"> reads from that
```

## End-to-end example: Astro

```astro
---
import { prefetchCardData } from '@repodeck/core';

const data = await prefetchCardData(
  [
    { owner: 'me', repo: 'rewrite-md' },
    { owner: 'me', repo: 'pixel-perfect' },
    { owner: 'me', repo: 'tiny-cli' },
  ],
  {
    include: { readme: true, resume: true, screenshots: true },
    token: import.meta.env.GITHUB_TOKEN,
  },
);
---
<html>
<body>
  <script src="/repodeck.js" type="module"></script>
  {[...data.entries()].map(([key, card]) => (
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

Visitors see fully rendered cards on first paint, zero GitHub calls.

## End-to-end example: Next.js static export

```tsx
// app/page.tsx
import { prefetchCardData } from '@repodeck/core';

export const dynamic = 'force-static';

export default async function Page() {
  const data = await prefetchCardData(
    [
      { owner: 'me', repo: 'a' },
      { owner: 'me', repo: 'b' },
    ],
    { token: process.env.GITHUB_TOKEN },
  );

  return (
    <>
      {[...data.entries()].flatMap(([key, card]) => [
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

## Why this matters

A typical portfolio page with 12 cards in `direct` mode makes
~50+ GitHub requests per visitor. With `prefetchCardData` +
`inline`, the visitor's browser makes **zero** requests:

| Mode               | Requests per visitor | Page is interactive in…         |
|--------------------|----------------------|----------------------------------|
| `direct` (no token) | 50×                  | 300-800ms (network round-trips per card) |
| `direct` (with token) | 50×               | 200-600ms                        |
| Proxy endpoint     | 50× to your server   | depends on backend               |
| **`inline` (prefetch)** | **0**            | **instant** (no fetch, just parse a `<script>`) |

For static sites this is the difference between "feels snappy"
and "shows a loading skeleton for half a second". For high-traffic
sites it's the difference between **rate-limited at 60 visitors/hour**
and serving unlimited visitors from a CDN.

## Next

- [Batch fetching with GraphQL](./batch-fetching.md) for the
  GraphQL transport: collapses 20 cards into 1 GraphQL request (token
  required).
- [`@repodeck/core` reference](./packages/core.md) for the full
  `prefetchCardData` signature and options.
- [`repodeck` reference](./packages/web-component.md) for the
  `data-url="inline"` contract.
