/**
 * @repodeckhz/core — github-client.ts
 *
 * All communication with the GitHub REST API. Encapsulated in a `GitHubClient`
 * class so consumers can configure token/retry/timeout once and inject the
 * instance wherever needed (dependency injection).
 *
 * 404 → returns null (so a missing field doesn't break the whole card);
 * any other failure throws repodeckError.
 */

import { repodeckError } from './errors';
import { dbgLog, isDebugEnabled } from './debug';
import type { DirectoryEntry, RateLimitInfo, RepoStats } from './types';

const API_BASE = 'https://api.github.com';

export interface GitHubClientOptions {
  /** GitHub personal access token — bumps rate limit from 60 to 5000 req/h. */
  token?: string;
  /** Per-request timeout in ms (default 12000). */
  timeoutMs?: number;
  /** Retries on 5xx/network errors (default 2). Never retries 404/401/403. */
  retries?: number;
  /** Log every request (method, path, status, duration, rate-limit headers). */
  debug?: boolean;
}

/**
 * Encapsulates all GitHub REST API access. Stateless aside from config —
 * safe to share a single instance across calls.
 */
export class GitHubClient {
  private readonly token?: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly debug: boolean;

  constructor(options: GitHubClientOptions = {}) {
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 12000;
    this.retries = options.retries ?? 2;
    this.debug = isDebugEnabled(options.debug);
  }

  /** Creates a client from `FetchOptions` (backward-compatible with the old API). */
  static from(options: { token?: string; timeoutMs?: number; retries?: number; debug?: boolean } = {}): GitHubClient {
    return new GitHubClient(options);
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'repodeck-core',
    };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  /** Retry wrapper — only retries on network errors / 5xx, never on 404/401/403. */
  private async fetchWithRetry(url: string): Promise<Response> {
    const path = urlPath(url);
    const started = Date.now();
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(url, { headers: this.headers(), signal: controller.signal });
        clearTimeout(timer);
        const ms = Date.now() - started;
        const rate = res.headers.get('x-ratelimit-remaining')
          ? `${res.headers.get('x-ratelimit-remaining')}/${res.headers.get('x-ratelimit-limit')}`
          : 'n/a';
        if (res.status >= 500 && attempt < this.retries) {
          dbgLog(this.debug, 'http', `${path} → ${res.status} (retry ${attempt + 1}/${this.retries}) ${ms}ms rl=${rate}`);
          await sleep(2 ** attempt * 250);
          continue;
        }
        dbgLog(this.debug, 'http', `${path} → ${res.status} ${ms}ms rl=${rate} attempt=${attempt + 1}`);
        return res;
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        const ms = Date.now() - started;
        dbgLog(this.debug, 'http', `${path} → network error after ${ms}ms (retry ${attempt + 1}/${this.retries})`);
        if (attempt < this.retries) {
          await sleep(2 ** attempt * 250);
          continue;
        }
      }
    }
    throw new repodeckError('NETWORK_ERROR', `Network error fetching ${url}`, { cause: lastErr });
  }

  private static decodeBase64(b64: string): string {
    const clean = b64.replace(/\n/g, '');
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(clean, 'base64').toString('utf-8');
    }
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /** Fetches a single file's content. 404 → null (not an error). */
  async fetchFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string | null> {
    const url = `${API_BASE}/repos/${enc(owner)}/${enc(repo)}/contents/${enc(path)}?ref=${enc(ref ?? 'main')}`;
    const res = await this.fetchWithRetry(url);
    if (res.status === 404) return null;
    this.assertOk(res, path);
    const data = (await res.json()) as { content?: string; encoding?: string };
    if (data.encoding === 'base64' && typeof data.content === 'string') {
      return GitHubClient.decodeBase64(data.content);
    }
    return typeof data.content === 'string' ? data.content : null;
  }

  /** Lists files in a directory. 404 → empty array. */
  async fetchDirectoryListing(owner: string, repo: string, path: string, ref?: string): Promise<DirectoryEntry[]> {
    const url = `${API_BASE}/repos/${enc(owner)}/${enc(repo)}/contents/${enc(path)}?ref=${enc(ref ?? 'main')}`;
    const res = await this.fetchWithRetry(url);
    if (res.status === 404) return [];
    this.assertOk(res, path);
    const data = (await res.json()) as Array<{ name: string; path: string; download_url: string | null; size: number; type: string }>;
    return data.filter((e) => e.type === 'file').map((e) => ({ name: e.name, path: e.path, download_url: e.download_url, size: e.size }));
  }

  /** Fetches repo metadata and statistics in a single API call. */
  async fetchRepoStats(owner: string, repo: string): Promise<RepoStats> {
    const url = `${API_BASE}/repos/${enc(owner)}/${enc(repo)}`;
    const res = await this.fetchWithRetry(url);
    if (res.status === 404) {
      throw new repodeckError('NOT_FOUND', `Repository ${owner}/${repo} not found.`, { status: 404 });
    }
    this.assertOk(res, 'repo stats');
    const data = (await res.json()) as {
      name: string;
      description: string | null;
      topics?: string[];
      language: string | null;
      homepage: string | null;
      stargazers_count: number;
      forks_count: number;
      watchers_count: number;
      open_issues_count: number;
      default_branch: string;
      pushed_at: string;
      owner: { login: string; avatar_url: string };
    };
    return {
      stars:         data.stargazers_count  ?? 0,
      forks:         data.forks_count       ?? 0,
      watchers:      data.watchers_count    ?? 0,
      openIssues:    data.open_issues_count ?? 0,
      defaultBranch: data.default_branch    ?? 'main',
      pushedAt:      data.pushed_at ? Date.parse(data.pushed_at) : 0,
      // Metadata — replaces manual frontmatter fields
      repoName:        data.name,
      repoDescription: data.description ?? null,
      topics:          Array.isArray(data.topics) ? data.topics : [],
      language:        data.language ?? null,
      homepage:        data.homepage || null,
      ownerLogin:      data.owner?.login ?? owner,
      ownerAvatarUrl:  data.owner?.avatar_url ?? '',
    };
  }

  /** Checks the current rate-limit budget. */
  async checkRateLimit(): Promise<RateLimitInfo> {
    const res = await this.fetchWithRetry(`${API_BASE}/rate_limit`);
    if (!res.ok) {
      throw new repodeckError('NETWORK_ERROR', `rate_limit endpoint returned ${res.status}`, { status: res.status });
    }
    const data = (await res.json()) as { resources: { core: { remaining: number; limit: number; reset: number } } };
    return { remaining: data.resources.core.remaining, limit: data.resources.core.limit, resetAt: data.resources.core.reset * 1000 };
  }

  private assertOk(res: Response, context: string): void {
    if (res.status === 401) {
      throw new repodeckError('UNAUTHORIZED', 'GitHub token is invalid or expired.', { status: 401 });
    }
    if (res.status === 403) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        throw new repodeckError('RATE_LIMITED', 'GitHub API rate limit exceeded.', { status: 403 });
      }
      throw new repodeckError('UNAUTHORIZED', 'GitHub API returned 403 Forbidden.', { status: 403 });
    }
    if (!res.ok) {
      throw new repodeckError('NETWORK_ERROR', `GitHub API ${res.status} for ${context}`, { status: res.status });
    }
  }
}

/** Builds a raw.githubusercontent.com URL (efficient for <img src>). */
export function buildRawUrl(owner: string, repo: string, branch: string, path: string): string {
  return `https://raw.githubusercontent.com/${enc(owner)}/${enc(repo)}/${enc(branch)}/${path.split('/').map(enc).join('/')}`;
}

// --- backward-compatible function exports (delegate to a default client) ---

export async function fetchFileContent(owner: string, repo: string, path: string, options: { token?: string; branch?: string; timeoutMs?: number; retries?: number } = {}): Promise<string | null> {
  return GitHubClient.from(options).fetchFileContent(owner, repo, path, options.branch);
}
export async function fetchDirectoryListing(owner: string, repo: string, path: string, options: { token?: string; branch?: string; timeoutMs?: number; retries?: number } = {}): Promise<DirectoryEntry[]> {
  return GitHubClient.from(options).fetchDirectoryListing(owner, repo, path, options.branch);
}
export async function fetchRepoStats(owner: string, repo: string, options: { token?: string; timeoutMs?: number; retries?: number } = {}): Promise<RepoStats> {
  return GitHubClient.from(options).fetchRepoStats(owner, repo);
}
export async function checkRateLimit(options: { token?: string; timeoutMs?: number; retries?: number } = {}): Promise<RateLimitInfo> {
  return GitHubClient.from(options).checkRateLimit();
}

function enc(s: string): string { return encodeURIComponent(s); }
function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

/** Path-only form of a URL (query strings and tokens never end up in logs). */
function urlPath(url: string): string {
  try { return new URL(url).pathname; } catch { return url; }
}
