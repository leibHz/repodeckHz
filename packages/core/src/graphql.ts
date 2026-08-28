/**
 * @repodeck/core — graphql.ts
 *
 * Experimental GitHub GraphQL batch fetch (plan §16.6).
 *
 * One POST to `https://api.github.com/graphql` can resolve metadata + files
 * for several repos at once, where N REST calls would be needed otherwise.
 * For a 10-repo batch with resume + readme + screenshots + stats, REST costs
 * roughly 4 × 10 = 40 request-units; GraphQL collapses that to 1 query (plus
 * an auxiliary REST call per screenshots/ folder — the GraphQL Tree API can't
 * enumerate the contents of a tree in the same request as the parent repo
 * query without blowing past the complexity budget, so we keep that on REST
 * and treat it as best-effort).
 *
 * Rate limit math (2026):
 *   • GraphQL point cost is 1 point per request, NOT proportional to query
 *     complexity (GitHub's points-per-call model, active since 2025).
 *   • 5,000 points/hour with a token; ~1 h without (anonymous GraphQL is
 *     rejected entirely). For batches, we split repos into groups of
 *     `batchSize` (default 10) — each group is one request.
 *
 * Public surface:
 *   • `GraphQLClient`           — minimal client (POST + bearer + retry).
 *   • `fetchMultipleReposViaGraphQL(targets, options)` → Map<owner/repo, CardData>.
 *
 * The returned `CardData` is the same shape the REST path in `CardBuilder`
 * produces, so consumers don't need to branch on transport.
 */

import { RepoDeckError } from './errors';
import { dbgLog, isDebugEnabled } from './debug';
import { GitHubClient } from './github-client';
import { parseReadme, parseResume, resolveScreenshots } from './parser';
import type {
  BuildOptions,
  CardData,
  DirectoryEntry,
  FieldResult,
  ReadmeData,
  RepoStats,
  ResumeData,
  Screenshot,
} from './types';

const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';

// --- target shape ---------------------------------------------------------

export interface GraphQLBatchTarget {
  owner: string;
  repo: string;
  /** Branch / ref to read from; default `main`. */
  branch?: string;
  /** Config folder path; default `config-repodeck`. */
  configPath?: string;
  /** Optional per-target `include` mask; inherits options.include otherwise. */
  include?: BuildOptions['include'];
  /** Optional per-target resume locale (e.g. `pt`). */
  locale?: string;
}

export interface GraphQLBatchOptions {
  /** GitHub personal access token — required (anonymous GraphQL is rejected). */
  token: string;
  /** Max repos per GraphQL request (default 10). */
  batchSize?: number;
  /** Per-request timeout (default 30000 — GraphQL can take a while on big batches). */
  timeoutMs?: number;
  /** Retries on 5xx / network errors (default 2). */
  retries?: number;
  /** Per-batch default include mask; targets without `include` inherit this. */
  include?: BuildOptions['include'];
  /** Shared `GitHubClient` for the auxiliary REST screenshots/ call. */
  restClient?: GitHubClient;
  /** Resume char limit forwarded to parseResume. */
  resumeMaxChars?: number;
  /** Log batch plans, query sizes and per-repo errors (or REPODECK_DEBUG=1). */
  debug?: boolean;
}

const DEFAULT_INCLUDE: BuildOptions['include'] = {
  readme: true,
  resume: true,
  screenshots: true,
};

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_TIMEOUT_MS = 30_000;

// --- GraphQLClient --------------------------------------------------------

/**
 * Minimal WebSocket-without-the-WS — a POST-only client for the GraphQL
 * endpoint. Kept separate from `GitHubClient` because GraphQL has a
 * different endpoint, different rate-limit semantics and no 404-as-null
 * convention (errors come back inside the 200 body).
 */
export class GraphQLClient {
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly debug: boolean;

  constructor(opts: { token: string; timeoutMs?: number; retries?: number; debug?: boolean }) {
    if (!opts.token) {
      throw new RepoDeckError('UNAUTHORIZED', 'GraphQL requires a GitHub token.', {});
    }
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = opts.retries ?? 2;
    this.debug = isDebugEnabled(opts.debug);
  }

  /**
   * POSTs a GraphQL query. Returns the `data` field of the response (already
   * stripped of `errors`). Throws `RepoDeckError('NETWORK_ERROR', …)` on a
   * non-2xx response, or `RepoDeckError` carrying the GraphQL errors when
   * the response is 200 but carries `errors: [...]`.
   */
  async request<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    let body = JSON.stringify({ query });
    if (variables !== undefined) body = JSON.stringify({ query, variables });
    const started = Date.now();

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github+json',
            'User-Agent': 'repodeck-core',
          },
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);
        const ms = Date.now() - started;
        const rate = res.headers.get('x-ratelimit-remaining')
          ? `${res.headers.get('x-ratelimit-remaining')}/${res.headers.get('x-ratelimit-limit')}`
          : 'n/a';

        // 5xx — retry.
        if (res.status >= 500 && attempt < this.retries) {
          dbgLog(this.debug, 'graphql', `POST /graphql → ${res.status} (retry ${attempt + 1}/${this.retries}) ${ms}ms rl=${rate}`);
          await sleep(2 ** attempt * 250);
          continue;
        }
        dbgLog(this.debug, 'graphql', `POST /graphql → ${res.status} ${ms}ms rl=${rate} attempt=${attempt + 1}`);

        if (res.status === 401) {
          throw new RepoDeckError('UNAUTHORIZED', 'GitHub token is invalid or expired.', { status: 401 });
        }
        if (res.status === 403) {
          throw new RepoDeckError('RATE_LIMITED', 'GitHub GraphQL rate limit exceeded.', { status: 403 });
        }
        if (!res.ok) {
          throw new RepoDeckError('NETWORK_ERROR', `GraphQL HTTP ${res.status}`, { status: res.status });
        }

        const json = (await res.json()) as { data?: unknown; errors?: Array<{ message: string; path?: string[] }> };

        // GitHub returns 200 + body.errors when GraphQL fails (partial or full).
        // If `data` is present alongside `errors`, treat as a "partial" success
        // and pass through — callers handle per-alias errors from CardData.
        if (json.errors && json.errors.length > 0 && json.data === undefined) {
          const msg = json.errors.map((e) => e.message).join('; ');
          dbgLog(this.debug, 'graphql', `GraphQL errors: ${msg}`);
          throw new RepoDeckError('NETWORK_ERROR', `GraphQL errors: ${msg}`);
        }
        if (json.data === undefined) {
          throw new RepoDeckError('NETWORK_ERROR', 'GraphQL returned no data and no errors.');
        }
        return json.data as T;
      } catch (err) {
        clearTimeout(timer);
        // RepoDeckError (validate/auth) is never retried.
        if (err instanceof RepoDeckError) throw err;
        lastErr = err;
        if (attempt < this.retries) {
          await sleep(2 ** attempt * 250);
          continue;
        }
      }
    }
    throw new RepoDeckError('NETWORK_ERROR', `Network error posting to GraphQL endpoint`, { cause: lastErr });
  }
}

// --- query construction ---------------------------------------------------

/**
 * Identifiers in GraphQL aliases must match /^[A-Za-z_][A-Za-z0-9_]*$/ — we
 * construct `rN` aliases (N = 0-based batch index) and remember which alias
 * points at which target. Aliases are stable and unique within a batch.
 */
interface AliasPlan {
  alias: string;
  target: GraphQLBatchTarget;
}

function planAliases(batch: GraphQLBatchTarget[]): AliasPlan[] {
  return batch.map((target, i) => ({ alias: `r${i}`, target }));
}

/**
 * Builds a single GraphQL query string that fetches, per repo in the batch:
 *   • repo metadata (stars, forks, watchers, owner, description, topics, …)
 *   • a README.md text/blob via `object(expression:)`
 *   • a RESUME.txt blob via `object(expression:)`   (or localised RESUME.<l>.txt)
 *
 * Screenshots/ are intentionally NOT fetched here — enumerating a Tree
 * inside the same query pushes past the complexity limit for batches of 10.
 * We resolve those via the auxiliary REST path (`GitHubClient`) after the
 * GraphQL response comes back. Callers can disable screenshots by setting
 * `include.screenshots = false`.
 */
function buildQuery(plan: AliasPlan[]): string {
  const fragments = plan.map(({ alias, target }) => {
    const owner = JSON.stringify(target.owner);
    const name = JSON.stringify(target.repo);
    const branchVal = target.branch ?? 'main';
    const configPath = (target.configPath ?? 'config-repodeck').replace(/\/+$/, '');
    const readmePath = `${configPath}/README.md`;
    const resumeDefault = `${configPath}/RESUME.txt`;
    const resumeLocalized = target.locale ? `${configPath}/RESUME.${target.locale}.txt` : null;
    // GitHub expects a single "branch:path" expression string.
    const expr = (p: string) => JSON.stringify(`${branchVal}:${p}`);

    // Use object(expression: $branch) for the root Tree, then look up files
    // by path. Returns Blob.text via the GraphQL fragment.
    const fragments: string[] = [];

    fragments.push(`${alias}_meta: repository(owner: ${owner}, name: ${name}) {
      name
      description
      url
      homepageUrl
      primaryLanguage { name }
      repositoryTopics(first: 16) { nodes { topic { name } } }
      stargazerCount
      forkCount
      watchers { totalCount }
      issues(states: OPEN) { totalCount }
      defaultBranchRef { name }
      pushedAt
      owner { login avatarUrl }
    }`);

    fragments.push(`${alias}_readme: repository(owner: ${owner}, name: ${name}) {
      object(expression: ${expr(readmePath)}) {
        ... on Blob { text }
      }
    }`);

    if (resumeLocalized) {
      fragments.push(`${alias}_resume: repository(owner: ${owner}, name: ${name}) {
        object(expression: ${expr(resumeLocalized)}) {
          ... on Blob { text }
        }
      }`);
    } else {
      fragments.push(`${alias}_resume: repository(owner: ${owner}, name: ${name}) {
        object(expression: ${expr(resumeDefault)}) {
          ... on Blob { text }
        }
      }`);
    }

    return fragments.join('\n');
  });

  return `query repodeckBatch { ${fragments.join('\n')} }`;
}

// --- response shaping -----------------------------------------------------

interface GraphQLMeta {
  name: string;
  description: string | null;
  url: string;
  homepageUrl: string | null;
  primaryLanguage: { name: string } | null;
  repositoryTopics: { nodes: Array<{ topic: { name: string } }> } | null;
  stargazerCount: number;
  forkCount: number;
  watchers: { totalCount: number };
  issues: { totalCount: number };
  defaultBranchRef: { name: string } | null;
  pushedAt: string;
  owner: { login: string; avatarUrl: string };
}

interface GraphQLBlob {
  object: { text: string | null } | null;
}

interface GraphQLResponse {
  [alias: string]: GraphQLMeta | GraphQLBlob | null | undefined;
}

function metaToStats(meta: GraphQLMeta, fallbackOwner: string): RepoStats {
  return {
    stars: meta.stargazerCount ?? 0,
    forks: meta.forkCount ?? 0,
    watchers: meta.watchers?.totalCount ?? 0,
    openIssues: meta.issues?.totalCount ?? 0,
    defaultBranch: meta.defaultBranchRef?.name ?? 'main',
    pushedAt: meta.pushedAt ? Date.parse(meta.pushedAt) : 0,
    repoName: meta.name,
    repoDescription: meta.description,
    topics: Array.isArray(meta.repositoryTopics?.nodes)
      ? meta.repositoryTopics.nodes.map((n) => n?.topic?.name).filter((t): t is string => Boolean(t))
      : [],
    language: meta.primaryLanguage?.name ?? null,
    homepage: meta.homepageUrl || null,
    ownerLogin: meta.owner?.login ?? fallbackOwner,
    ownerAvatarUrl: meta.owner?.avatarUrl ?? '',
  };
}

// --- entry point ----------------------------------------------------------

/**
 * Fetches card data for multiple repos using a single GraphQL query per
 * batch (default 10 repos per request). Returns a Map keyed by `owner/repo`
 * with the same CardData shape the REST path produces.
 *
 *   const cards = await fetchMultipleReposViaGraphQL(
 *     [{ owner: 'facebook', repo: 'react' }, { owner: 'vercel', repo: 'next.js' }],
 *     { token: process.env.GITHUB_TOKEN },
 *   );
 *   cards.get('facebook/react'); // → CardData
 *
 * Partial errors:
 *   Each repo resolves to either data or a per-field RepoDeckError, mirroring
 *   `CardBuilder`. A repo whose `repository` query returns null (repo deleted
 *   or inaccessible) produces a card with `stats`, `readme`, `resume` all
 *   carrying `error: RepoDeckError('NOT_FOUND')`.
 *
 * Screenshots: per the closed decision above, screenshots/ are fetched via
 * an auxiliary REST call (one per repo) after the GraphQL response lands.
 * This keeps the GraphQL query complexity within limits while only adding
 * one request per repo (12 REST requests for a 12-repo batch still beats
 * 4 × 12 = 48 for pure REST).
 */
export async function fetchMultipleReposViaGraphQL(
  targets: GraphQLBatchTarget[],
  options: GraphQLBatchOptions,
): Promise<Map<string, CardData>> {
  if (!Array.isArray(targets) || targets.length === 0) {
    return new Map();
  }

  if (!options.token) {
    throw new RepoDeckError('UNAUTHORIZED', 'GraphQL batch requires a GitHub token.', {});
  }

  const batchSize = Math.max(1, Math.min(options.batchSize ?? DEFAULT_BATCH_SIZE, 50));
  const defaultInclude = options.include ?? DEFAULT_INCLUDE;
  const debug = isDebugEnabled(options.debug);
  const restClient = options.restClient ?? new GitHubClient({
    token: options.token,
    timeoutMs: 12_000,
    retries: options.retries ?? 0,
    debug,
  });

  const results = new Map<string, CardData>();
  const batchCount = Math.ceil(targets.length / batchSize);
  dbgLog(debug, 'graphql', `${targets.length} target(s), batchSize=${batchSize} → ${batchCount} request(s)`);

  // Slice into batches — each batch is one GraphQL request.
  for (let i = 0; i < targets.length; i += batchSize) {
    const slice = targets.slice(i, i + batchSize);
    await runBatch(slice, options, defaultInclude, restClient, results, debug);
  }

  return results;
}

async function runBatch(
  batch: GraphQLBatchTarget[],
  options: GraphQLBatchOptions,
  defaultInclude: BuildOptions['include'],
  restClient: GitHubClient,
  results: Map<string, CardData>,
  debug: boolean,
): Promise<void> {
  const plan = planAliases(batch);
  const query = buildQuery(plan);
  dbgLog(debug, 'graphql', `request for ${plan.map((p) => `${p.alias}=${p.target.owner}/${p.target.repo}`).join(', ')} (query ${query.length} chars)`);

  const client = new GraphQLClient({
    token: options.token,
    timeoutMs: options.timeoutMs,
    retries: options.retries,
    debug,
  });

  let responseData: GraphQLResponse;
  try {
    responseData = await client.request<GraphQLResponse>(query);
  } catch (err) {
    // Whole batch failed — surface per-repo as NOT_FOUND/NETWORK_ERROR.
    // Narrow `err: unknown` from the catch into typed locals for code/message.
    const isUnauthorized =
      err instanceof RepoDeckError && err.code === 'UNAUTHORIZED';
    const code: 'UNAUTHORIZED' | 'NETWORK_ERROR' = isUnauthorized ? 'UNAUTHORIZED' : 'NETWORK_ERROR';
    const message = err instanceof Error ? err.message : 'GraphQL request failed.';
    dbgLog(debug, 'graphql', `batch failed (${code}): ${message}`);
    for (const { target } of plan) {
      const key = `${target.owner}/${target.repo}`;
      const branch = target.branch ?? 'main';
      const configPath = target.configPath ?? 'config-repodeck';
      const errInstance = new RepoDeckError(code, message);
      results.set(key, {
        meta: { owner: target.owner, repo: target.repo, url: `https://github.com/${target.owner}/${target.repo}`, branch, configPath, fetchedAt: Date.now() },
        resume: { error: errInstance } as FieldResult<ResumeData>,
        readme: { error: errInstance } as FieldResult<ReadmeData>,
        screenshots: { error: errInstance } as FieldResult<Screenshot[]>,
        stats: { error: errInstance } as FieldResult<RepoStats>,
      });
    }
    return;
  }

  // Resolve per-alias into CardData via async (parseReadme + auxiliary fetches).
  const cardPromises = plan.map(async ({ alias, target }) => {
    const key = `${target.owner}/${target.repo}`;
    const branch = target.branch ?? 'main';
    const configPath = target.configPath ?? 'config-repodeck';
    const include = { ...defaultInclude, ...(target.include ?? {}) };

    const meta = responseData[`${alias}_meta`] as GraphQLMeta | null;
    const readmeBlob = responseData[`${alias}_readme`] as GraphQLBlob | null;
    const resumeBlob = responseData[`${alias}_resume`] as GraphQLBlob | null;

    const card: CardData = {
      meta: { owner: target.owner, repo: target.repo, url: `https://github.com/${target.owner}/${target.repo}`, branch, configPath, fetchedAt: Date.now() },
      resume: null, readme: null, screenshots: null, stats: null,
    };

    // ---- stats ----
    if (include.stats) {
      if (meta) {
        card.stats = metaToStats(meta, target.owner);
      } else {
        card.stats = { error: new RepoDeckError('NOT_FOUND', `Repository ${target.owner}/${target.repo} not accessible.`, { field: 'stats' }) } as FieldResult<RepoStats>;
      }
    } else if (meta) {
      // If caller didn't ask for stats, still include them if available —
      // GraphQL already paid for them. (Cheap side-benefit.)
      card.stats = metaToStats(meta, target.owner);
    }

    // ---- readme ----
    if (include.readme) {
      const raw = readmeBlob?.object?.text;
      if (raw !== null && raw !== undefined) {
        try {
          card.readme = await parseReadme(raw);
        } catch (err) {
          card.readme = { error: new RepoDeckError('NETWORK_ERROR', `Could not parse README: ${String(err)}`, { field: 'readme' }) } as FieldResult<ReadmeData>;
        }
      } else {
        card.readme = { error: new RepoDeckError('NOT_FOUND', 'README.md not found in config folder.', { field: 'readme' }) } as FieldResult<ReadmeData>;
      }
    }

    // ---- resume ----
    if (include.resume) {
      const raw = resumeBlob?.object?.text;
      if (raw !== null && raw !== undefined) {
        const parsed = parseResume(raw, { maxChars: options.resumeMaxChars });
        card.resume = { ...parsed, locale: target.locale };
      } else {
        card.resume = { error: new RepoDeckError('NOT_FOUND', 'RESUME.txt not found in config folder.', { field: 'resume' }) } as FieldResult<ResumeData>;
      }
    }

    // ---- screenshots (auxiliary REST) ----
    if (include.screenshots) {
      try {
        const screenshotsPath = `${configPath.replace(/^\/+|\/+$/g, '')}/screenshots`;
        const entries: DirectoryEntry[] = await restClient.fetchDirectoryListing(target.owner, target.repo, screenshotsPath, branch);
        card.screenshots = resolveScreenshots(entries, target.owner, target.repo, branch);
      } catch (err) {
        const e = err instanceof RepoDeckError ? err : new RepoDeckError('NETWORK_ERROR', String(err), { field: 'screenshots', cause: err });
        card.screenshots = { error: e } as FieldResult<Screenshot[]>;
      }
    }

    return { key, card };
  });

  const settled = await Promise.allSettled(cardPromises);
  for (const r of settled) {
    if (r.status === 'fulfilled') results.set(r.value.key, r.value.card);
  }
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
