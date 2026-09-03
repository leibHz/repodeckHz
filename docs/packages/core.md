# `@repodeck/core`

Headless data layer. **No DOM, no UI**, just logic for fetching,
parsing and assembling the typed `CardData` shape from a GitHub
repository. This is the package you'd import on a server (Next.js
API route, Astro page, Cloudflare Worker, plain Node script).

## Install

```sh
npm install @repodeck/core
```

## What's in the box

- A `GitHubClient` class with token/timeout/retry configuration.
- A `Cache` class with TTL.
- A `CardBuilder` class that ties them together and assembles a
  `CardData` with per-field error isolation.
- Pure-function parsers (`parseResume`, `parseReadme`,
  `parseReadmeFrontmatter`, `resolveScreenshots`).
- `defaultPresets` plus a registry (`registerPreset`,
  `mergePresetWithUserConfig`).
- `assignBentoSpans` / `resolveScreenshotLayout` for layout
  computation.
- `resolveRadiusTokens` for radius preset resolution.
- A typed error class `RepoDeckError`.
- `buildCardData(...)`, the one-stop facade that returns a
  `CardData`.
- `prefetchCardData(...)`, the REST batch (see
  [Build-time data](../build-time.md)).
- `fetchMultipleReposViaGraphQL(...)`, the GraphQL batch that collapses
  12+ cards into one GraphQL request (see
  [Batch fetching with GraphQL](../batch-fetching.md)).

## High-level example

```ts
import { buildCardData, RepoDeckError } from '@repodeck/core';

const card = await buildCardData('you', 'your-repo', {
  include: { readme: true, resume: true, screenshots: true, stats: true },
  token: process.env.GITHUB_TOKEN,
});

if (card.readme && 'html' in card.readme) {
  console.log(card.readme.html); // sanitised HTML
}
if (card.resume && 'text' in card.resume) {
  console.log(card.resume.text); // plain text, truncated
}
if (card.screenshots && Array.isArray(card.screenshots)) {
  card.screenshots.forEach((s) => console.log(s.url));
}
```

## Classes vs. facades

Every engine is also exposed as a class so you can compose it
exactly how you want:

```ts
import { GitHubClient, Cache, CardBuilder, RepoDeckError } from '@repodeck/core';

const client = new GitHubClient({ token: process.env.GITHUB_TOKEN, timeoutMs: 8000 });
const cache = new Cache(5 * 60 * 1000); // 5-minute TTL
const builder = new CardBuilder(client, cache);

try {
  const card = await builder.build(owner, repo, { include: { readme: true, resume: true } });
  // ...
} catch (err) {
  if (err instanceof RepoDeckError) {
    switch (err.code) {
      case 'NOT_FOUND':       /* repo missing or 404 */ break;
      case 'RATE_LIMITED':    /* GitHub 403 with x-ratelimit-remaining: 0 */ break;
      case 'UNAUTHORIZED':    /* 401 or 403 without rate-limit signal */ break;
      case 'NETWORK_ERROR':   /* 5xx, timeout, transport error */ break;
      case 'INVALID_CONFIG':  /* owner/repo missing, configPath malformed */ break;
    }
  }
}
```

`buildCardData(...)` is a thin wrapper that calls
`new CardBuilder(GitHubClient.from(opts))` for one-shot use; the
class API is for repeated calls or when you want to inject a
custom cache.

## Per-field errors

Per the closed plan decision documented in the project brief,
**missing files do not crash the card**. They are reported as
errors on a single field:

```ts
{
  meta: { owner, repo, … },
  resume: { error: { code: 'NOT_FOUND', message: '…', field: 'resume' } },
  readme: { html: '…', raw: '…', frontmatter: {…} },   // OK
  screenshots: [],                                       // OK, empty folder
  stats: { stars: 12, forks: 3, … },                     // OK
}
```

Use `'error' in field` (TypeScript narrowing) to check.

## Lazy-loaded heavy deps

`marked` + `isomorphic-dompurify` are imported **on first use** so
consumers that only call `parseResume` / `resolveScreenshots` /
`buildRawUrl` never load them. `parseReadme` is async to support
that lazy path:

```ts
import { parseReadme } from '@repodeck/core';
const readme = await parseReadme(rawMarkdownText);
console.log(readme.html); // sanitised HTML
```

## Next

- [Build-time data](../build-time.md): `prefetchCardData` for static
  site generation (REST transport, anonymous-friendly).
- [Batch fetching with GraphQL](../batch-fetching.md):
  `fetchMultipleReposViaGraphQL`, cheaper for big pages with a token.
- [API reference](../api-reference.md): full list of exports.
