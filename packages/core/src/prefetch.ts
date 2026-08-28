/**
 * @repodeck/core — prefetch.ts
 *
 * Build-time / batch fetching. Takes a list of
 * `{ owner, repo, branch?, configPath?, include? }` and resolves them all
 * concurrently (bounded by a small worker pool) so a static site can ship
 * the resulting `CardData` to visitors without any runtime GitHub calls.
 *
 * Per the closed plan decision documented in §3.3 / §15, each repo's per-
 * field errors are preserved: a missing RESUME.txt on one card doesn't
 * stop the rest of the batch.
 */

import { Cache } from './cache';
import { dbgLog, isDebugEnabled } from './debug';
import { GitHubClient } from './github-client';
import { CardBuilder } from './builder';
import type { BuildOptions, CardData } from './types';

export interface PrefetchTarget {
  owner: string;
  repo: string;
  branch?: string;
  configPath?: string;
  /** `include` mask — defaults to { readme, resume, screenshots: true } for each. */
  include?: BuildOptions['include'];
}

export interface PrefetchOptions {
  /** Concurrency ceiling; default 4 (≈16 request-units per minute, comfortable even anonymous). */
  concurrency?: number;
  /** Per-card Token (or pass per-target): the global one is used when the target doesn't override. */
  token?: string;
  /** Optional shared cache so two prefetch calls don't refetch the same repo. */
  cache?: Cache;
  /** Optional list of fields to include by default; targets without a per-target `include` inherit this. */
  include?: BuildOptions['include'];
  /** Per-card `timeoutMs` (forwarded to GitHubClient). */
  timeoutMs?: number;
  /** Per-card `retries` (forwarded to GitHubClient). */
  retries?: number;
  /** Log batch progress and per-repo errors (or REPODECK_DEBUG=1). */
  debug?: boolean;
}

const DEFAULT_INCLUDE: BuildOptions['include'] = {
  readme: true,
  resume: true,
  screenshots: true,
};

/**
 * Resolves many repos in parallel and returns a map keyed by `owner/repo`.
 *
 *   const cards = await prefetchCardData(
 *     [{ owner: 'me', repo: 'a' }, { owner: 'me', repo: 'b' }],
 *     { token: process.env.GITHUB_TOKEN, concurrency: 4 },
 *   );
 *   cards.get('me/a'); // → CardData
 */
export async function prefetchCardData(
  targets: PrefetchTarget[],
  options: PrefetchOptions = {},
): Promise<Map<string, CardData>> {
  if (!Array.isArray(targets) || targets.length === 0) {
    return new Map();
  }

  const concurrency = clamp(options.concurrency ?? 4, 1, 16);
  const debug = isDebugEnabled(options.debug);
  // Per-card options.share a single client for connection reuse; the
  // client itself is stateless aside from config.
  const client = new GitHubClient({
    token: options.token,
    timeoutMs: options.timeoutMs,
    retries: options.retries,
    debug,
  });
  const cache = options.cache;
  const defaultInclude = options.include ?? DEFAULT_INCLUDE;

  const results = new Map<string, CardData>();
  const errors = new Map<string, unknown>();

  dbgLog(debug, 'prefetch', `${targets.length} target(s), concurrency=${concurrency}`);

  // Process targets through a bounded-concurrency worker pool. The pool
  // keeps at most `concurrency` workers alive; when a worker completes,
  // it's replaced with a fresh one until the queue empties.
  const queue = targets.slice();

  async function startNextWorker(): Promise<void> {
    const target = queue.shift();
    if (!target) return;
    const key = `${target.owner}/${target.repo}`;
    try {
      const card = await buildOne(target, client, cache, defaultInclude);
      results.set(key, card);
    } catch (err) {
      // CardBuilder itself never throws for missing files (per-field
      // errors). The only leaks are fatal-validation throws, which we
      // surface via the `errors` map so callers can `try` again or
      // remove the bad target.
      errors.set(key, err);
      dbgLog(debug, 'prefetch', `${key} fatal error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Bootstrap the pool: kick off `concurrency` workers up front. Each
  // worker re-enqueues by calling `startNextWorker` again via the chain
  // — so as soon as one finishes, the next queued target starts.
  const workers: Array<Promise<void>> = [];
  for (let i = 0; i < concurrency; i++) {
    const chain = (async () => {
      while (queue.length > 0) {
        await startNextWorker();
      }
    })();
    workers.push(chain);
  }
  await Promise.allSettled(workers);

  if (errors.size > 0) {
    attachErrors(results, errors);
  }

  return results;
}

/**
 * Public surface returned by `prefetchCardData`. Always a `Map<owner/repo,
 * CardData>`, additionally decorated with the `errors` getter when at
 * least one target threw a fatal error during the batch run.
 *
 *   const result = await prefetchCardData([...]);
 *   for (const [key, card] of result) console.log(key, card.meta.url);
 *   if (result.errors) {
 *     for (const [key, err] of result.errors) console.warn(key, err);
 *   }
 */
export interface PrefetchResult extends Map<string, CardData> {
  /** Map of `owner/repo` → fatal error. Empty on a fully successful run. */
  readonly errors?: ReadonlyMap<string, unknown>;
}

function attachErrors(map: Map<string, CardData>, errors: Map<string, unknown>): void {
  Object.defineProperty(map, 'errors', {
    value: errors,
    enumerable: false,
    writable: false,
    configurable: false,
  });
}

// -- internal helpers ------------------------------------------------------

async function buildOne(
  target: PrefetchTarget,
  client: GitHubClient,
  cache: Cache | undefined,
  defaultInclude: BuildOptions['include'],
): Promise<CardData> {
  const include = { ...defaultInclude, ...(target.include ?? {}) };
  const builder = new CardBuilder(client, cache);
  return builder.build(target.owner, target.repo, {
    include,
    branch: target.branch,
    configPath: target.configPath,
  });
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}
