# @repodeckhz/core

> Framework-free core for **repodeck**: fetch, parse, and build GitHub repo card data. Zero DOM, zero dependencies.

This is the headless heart of the repodeck package. It talks to the GitHub REST API, parses the response, and returns a normalized `CardData` object. No UI, no framework: use it in Node, Deno, Bun, the browser, or any server-side template engine.

## Install

```bash
npm install @repodeckhz/core
# or
bun add @repodeckhz/core
```

## Quick start

```ts
import { buildCardData } from '@repodeckhz/core';

const card = await buildCardData('repodeck', 'taskflow', {
  include: { readme: true, resume: true, screenshots: true },
  branch: 'main',
  configPath: 'config-repodeck',
});

// card.resume  → { text, truncated } | { error: RepoDeckError }
// card.readme  → { html, raw, frontmatter? } | { error: RepoDeckError }
// card.screenshots → Screenshot[] | { error: RepoDeckError }
```

The target repo must contain a `config-repodeck/` folder (configurable
via `options.configPath`):

```
config-repodeck/
├── README.md          # expanded content (shown in the modal)
├── RESUME.txt         # short plain-text summary (shown on the card)
└── screenshots/       # project images, sorted alphabetically
    ├── 01-home.png
    └── 02-dashboard.png
```

## Public API

### `buildCardData(owner, repo, options?) → Promise<CardData>`

The orchestrator. Fires only the fetches you asked for (via `options.include`) in parallel, and assembles a single `CardData` object.

**Per-field error model** (closed decision, never all-or-nothing): if `RESUME.txt` is missing but `README.md` exists, the card still builds; `resume` carries its own `RepoDeckError`. You always know exactly which file failed.

```ts
interface CardData {
  meta: { owner, repo, url, branch, configPath, fetchedAt };
  resume:   FieldResult<ResumeData> | null;
  readme:   FieldResult<ReadmeData> | null;
  screenshots: FieldResult<Screenshot[]> | null;
  stats?:   FieldResult<RepoStats> | null;
}
```

`FieldResult<T>` is either `T` or `{ error: RepoDeckError }`.

### `FetchOptions`

```ts
interface FetchOptions {
  token?: string;       // GitHub PAT - bumps rate limit from 60 to 5000 req/h
  branch?: string;      // default "main"
  timeoutMs?: number;   // per-request timeout
  retries?: number;     // retries on 5xx/network (never on 404/401)
}
```

### `BuildOptions`

```ts
interface BuildOptions extends FetchOptions {
  include?: {
    readme?: boolean;
    resume?: boolean;
    screenshots?: boolean;
    stats?: boolean;       // fetches /repos/{owner}/{repo} for stars/forks
  };
  configPath?: string;     // default "config-repodeck"
  resumeMaxChars?: number; // default 280
  locale?: string;         // tries RESUME.<locale>.txt before RESUME.txt
  debug?: boolean;         // verbose [repodeck:…] console logs (or REPODECK_DEBUG=1 env)
}
```

### GitHub client functions

```ts
fetchFileContent(owner, repo, path, options?)   // 404 → null (not an error)
fetchDirectoryListing(owner, repo, path, options?) // 404 → []
fetchRepoStats(owner, repo, options?)             // stars, forks, watchers
checkRateLimit(options?)                          // { remaining, limit, resetAt }
buildRawUrl(owner, repo, branch, path)            // raw.githubusercontent.com URL
```

### Parsers

```ts
parseResume(rawText, { maxChars? })     // → { text, truncated, locale? }
parseReadme(rawMarkdown)                // → { html, raw, frontmatter? } (sanitized)
parseReadmeFrontmatter(rawMarkdown)     // → { metadata, content }
resolveScreenshots(entries, owner, repo, branch) // → Screenshot[]
```

### Presets

```ts
import { defaultPresets, registerPreset, getPreset, mergePresetWithUserConfig } from '@repodeckhz/core';

defaultPresets.minimal    // title + 1 cover
defaultPresets.standard   // title + resume + screenshot cover
defaultPresets.detailed   // everything + README preview line

registerPreset('my-preset', { include: {...}, readmePreview: true, ... });
```

### Layout & radius helpers

```ts
resolveScreenshotLayout(screenshots, context, options?) // → { mode, items, total, hidden }
assignBentoSpans(count)                                 // deterministic bento spans
resolveRadiusTokens('soft')                             // → { card, button, modal }
```

### `RepoDeckError`

```ts
class RepoDeckError extends Error {
  code: 'NOT_FOUND' | 'RATE_LIMITED' | 'UNAUTHORIZED' | 'NETWORK_ERROR' | 'INVALID_CONFIG';
  status?: number;
  field?: string;
  toJSON(): { name, code, message, status, field };
}
```

Also exported as `repodeckError` for backwards compatibility (same class).

## Frontmatter (README.md)

Add YAML-like frontmatter to the top of `README.md` for per-project customization:

```markdown
---
title: My Project
accent: "#0891b2"
order: 2
tags: library, charts
---
# My Project
...
```

Supported fields: `title`, `accent` (hex color), `order` (number), `description`, `tags`, `author`.

## Localized RESUME

Pass `locale: 'pt'` and the builder tries `RESUME.pt.txt` before `RESUME.txt`, returning `{ text, truncated, locale: 'pt' }`.

## Caching

In-memory singleton cache (Map) with TTL (5 min default):

```ts
import { getCached, setCached, clearCache, buildCacheKey } from '@repodeckhz/core';
```

## License

MIT
