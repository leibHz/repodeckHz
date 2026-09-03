/**
 * @repodeck/core — builder.ts
 *
 * The orchestrator. `CardBuilder` takes a `GitHubClient` (dependency injection)
 * and an optional `Cache`, then builds a `CardData` object by firing only the
 * fetches the caller asked for — in parallel, with per-field error isolation.
 *
 * Per-field error model (closed decision — plan §3.3 / §15):
 *   If RESUME.txt is missing but README.md exists, the card still builds with
 *   `resume` carrying a repodeckError. Never "all-or-nothing".
 */

import { repodeckError } from './errors';
import { GitHubClient } from './github-client';
import { Cache } from './cache';
import { dbgLog, isDebugEnabled } from './debug';
import { parseReadme, parseResume, resolveScreenshots } from './parser';
import type {
  BuildOptions,
  CardData,
  FieldResult,
  ReadmeData,
  RepoStats,
  ResumeData,
  Screenshot,
} from './types';

// --- validation -----------------------------------------------------------

export function validateConfig(owner: unknown, repo: unknown, options?: BuildOptions): void {
  if (typeof owner !== 'string' || !owner.trim()) {
    throw new repodeckError('INVALID_CONFIG', '`owner` is required.');
  }
  if (typeof repo !== 'string' || !repo.trim()) {
    throw new repodeckError('INVALID_CONFIG', '`repo` is required.');
  }
  const cp = options?.configPath;
  if (cp !== undefined && (typeof cp !== 'string' || cp.includes('..'))) {
    throw new repodeckError('INVALID_CONFIG', '`configPath` must be a safe string.');
  }
}

function joinPath(configPath: string, file: string): string {
  return `${configPath.replace(/^\/+|\/+$/g, '')}/${file}`;
}

// --- CardBuilder class ----------------------------------------------------

type FieldKey = 'resume' | 'readme' | 'screenshots' | 'stats';

/**
 * Orchestrates card data assembly. Inject a `GitHubClient` (and optionally a
 * `Cache`) so the builder is fully decoupled from I/O — easy to test with
 * mocks.
 */
export class CardBuilder {
  constructor(
    private readonly client: GitHubClient = new GitHubClient(),
    private readonly cache?: Cache,
  ) {}

  async build(owner: string, repo: string, options: BuildOptions = {}): Promise<CardData> {
    validateConfig(owner, repo, options);

    const debug = isDebugEnabled(options.debug);
    const started = Date.now();
    const branch = options.branch ?? 'main';
    const configPath = options.configPath ?? 'config-repodeck';
    const include = options.include ?? { readme: true, resume: true, screenshots: true };

    // Check cache first.
    const cacheKey = Cache.buildKey({ owner, repo, branch, configPath, include: includeKey(include) });
    if (this.cache) {
      const cached = this.cache.get<CardData>(cacheKey);
      if (cached) {
        dbgLog(debug, 'builder', `${owner}/${repo} cache HIT`);
        return cached;
      }
    }

    dbgLog(debug, 'builder', `${owner}/${repo} build start branch=${branch} configPath=${configPath} include=${includeKey(include)}`);

    const tasks: Array<Promise<{ key: FieldKey; data: FieldResult<unknown> | null }>> = [];
    if (include.resume) tasks.push(this.fetchResume(owner, repo, branch, configPath, options));
    if (include.readme) tasks.push(this.fetchReadme(owner, repo, branch, configPath));
    if (include.screenshots) tasks.push(this.fetchScreenshots(owner, repo, branch, configPath));
    if (include.stats) tasks.push(this.fetchStats(owner, repo));

    const results = await Promise.allSettled(tasks);

    const card: CardData = {
      meta: { owner, repo, url: `https://github.com/${owner}/${repo}`, branch, configPath, fetchedAt: Date.now() },
      resume: null, readme: null, screenshots: null, stats: null,
    };

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { key, data } = r.value;
      if (data === null) continue;
      (card as Record<FieldKey, unknown>)[key] = data;
    }

    dbgLog(debug, 'builder', `${owner}/${repo} done in ${Date.now() - started}ms resume=${ok(card.resume)} readme=${ok(card.readme)} screenshots=${ok(card.screenshots)} stats=${ok(card.stats)}`);
    if (this.cache) this.cache.set(cacheKey, card);
    return card;
  }

  // --- per-field fetchers (each isolates errors) --------------------------

  private async fetchResume(owner: string, repo: string, branch: string, configPath: string, options: BuildOptions): Promise<{ key: FieldKey; data: FieldResult<ResumeData> | null }> {
    const debug = isDebugEnabled(options.debug);
    return this.safeFetch('resume', async () => {
      let raw: string | null = null;
      let usedLocale: string | undefined;
      if (options.locale) {
        raw = await this.client.fetchFileContent(owner, repo, joinPath(configPath, `RESUME.${options.locale}.txt`), branch);
        if (raw !== null) usedLocale = options.locale;
        else dbgLog(debug, 'builder', `${owner}/${repo} RESUME.${options.locale}.txt missing → falling back to RESUME.txt`);
      }
      if (raw === null) {
        raw = await this.client.fetchFileContent(owner, repo, joinPath(configPath, 'RESUME.txt'), branch);
      }
      if (raw === null) throw new repodeckError('NOT_FOUND', 'RESUME.txt not found in config folder.', { field: 'resume' });
      return { ...parseResume(raw, { maxChars: options.resumeMaxChars }), locale: usedLocale };
    });
  }

  private async fetchReadme(owner: string, repo: string, branch: string, configPath: string): Promise<{ key: FieldKey; data: FieldResult<ReadmeData> | null }> {
    return this.safeFetch('readme', async () => {
      const raw = await this.client.fetchFileContent(owner, repo, joinPath(configPath, 'README.md'), branch);
      if (raw === null) throw new repodeckError('NOT_FOUND', 'README.md not found in config folder.', { field: 'readme' });
      return await parseReadme(raw);
    });
  }

  private async fetchScreenshots(owner: string, repo: string, branch: string, configPath: string): Promise<{ key: FieldKey; data: FieldResult<Screenshot[]> | null }> {
    return this.safeFetch('screenshots', async () => {
      const entries = await this.client.fetchDirectoryListing(owner, repo, joinPath(configPath, 'screenshots'), branch);
      return resolveScreenshots(entries, owner, repo, branch);
    });
  }

  private async fetchStats(owner: string, repo: string): Promise<{ key: FieldKey; data: FieldResult<RepoStats> | null }> {
    return this.safeFetch('stats', async () => {
      return await this.client.fetchRepoStats(owner, repo);
    });
  }

  /** Wraps a fetcher in try/catch, converting errors to per-field repodeckError. */
  private async safeFetch<T>(key: FieldKey, fn: () => Promise<T>): Promise<{ key: FieldKey; data: FieldResult<T> | null }> {
    try {
      return { key, data: await fn() };
    } catch (err) {
      const e = err instanceof repodeckError ? err : new repodeckError('NETWORK_ERROR', String(err), { field: key, cause: err });
      return { key, data: { error: e } as FieldResult<T> };
    }
  }
}

/** Human-readable field status for debug logs. */
function ok(v: unknown): string {
  if (v === null || v === undefined) return 'missing';
  if (typeof v === 'object' && (v as { code?: string }).code) return `ERR:${(v as { code: string }).code}`;
  return 'ok';
}

function includeKey(include: { readme?: boolean; resume?: boolean; screenshots?: boolean; stats?: boolean }): string {
  return `${Number(!!include.readme)}${Number(!!include.resume)}${Number(!!include.screenshots)}${Number(!!include.stats)}`;
}

// --- backward-compatible facade -------------------------------------------

/**
 * Builds card data for a GitHub repo. Creates a one-shot `CardBuilder` with a
 * default `GitHubClient`. For repeated calls, create a `CardBuilder` once and
 * reuse it (enables connection reuse + caching).
 */
export async function buildCardData(owner: string, repo: string, options: BuildOptions = {}): Promise<CardData> {
  const client = GitHubClient.from({ token: options.token, timeoutMs: options.timeoutMs, retries: options.retries });
  const builder = new CardBuilder(client);
  return builder.build(owner, repo, options);
}
