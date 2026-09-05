/**
 * @repodeckhz/core — cache.ts
 *
 * In-memory cache (Map) with TTL. Encapsulated in a `Cache` class so consumers
 * can create isolated instances or share a singleton. The interface is
 * designed to be swapped for a localStorage or Redis adapter without touching
 * the rest of the core.
 */

export interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number; // epoch ms
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * TTL-based in-memory cache. Create one instance and share it, or create
 * separate instances for different TTLs/scopes.
 */
export class Cache {
  private store = new Map<string, CacheEntry>();

  constructor(private defaultTtlMs: number = DEFAULT_TTL_MS) {}

  get<T = unknown>(key: string): T | undefined {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set<T = unknown>(key: string, value: T, ttlMs: number = this.defaultTtlMs): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Returns the cached entry including its expiry (for introspection). */
  getEntry<T = unknown>(key: string): CacheEntry<T> | undefined {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  delete(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  get size(): number { return this.store.size; }

  /** Builds a deterministic cache key from card request parameters. */
  static buildKey(parts: { owner: string; repo: string; branch: string; configPath: string; include: string }): string {
    return `rc:${parts.owner}/${parts.repo}@${parts.branch}:${parts.configPath}:${parts.include}`;
  }
}

/** Shared singleton cache (backward-compatible with the old API). */
const sharedCache = new Cache();

export function getCached<T = unknown>(key: string): CacheEntry<T> | undefined {
  return sharedCache.getEntry<T>(key);
}
export function setCached<T = unknown>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  sharedCache.set(key, value, ttlMs);
}
export function clearCache(key?: string): void {
  if (key) sharedCache.delete(key);
  else sharedCache.clear();
}
export function buildCacheKey(parts: { owner: string; repo: string; branch: string; configPath: string; include: string }): string {
  return Cache.buildKey(parts);
}
