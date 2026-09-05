/**
 * @repodeckhz/core — types.ts
 *
 * Shared data shapes used by every module of the core and by the API contract.
 */

import type { RepoDeckError } from './errors';

export interface FetchOptions {
  /** GitHub personal access token (optional — bumps rate limit). */
  token?: string;
  /** Branch / tag / commit to read from. */
  branch?: string;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** Number of retries for transient network errors (never retries 404/401). */
  retries?: number;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  download_url: string | null;
  size: number;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: number; // epoch ms
}

export interface ResumeData {
  text: string;
  truncated: boolean;
  /** Which locale file was used (plan §16.19). Undefined = default RESUME.txt. */
  locale?: string;
}

export interface ReadmeData {
  html: string;
  raw: string;
  /** Optional frontmatter parsed from the top of README.md (plan §16.18).
   * Supports: title, accent (hex color), order (number), description, tags. */
  frontmatter?: Record<string, string | number>;
}

export interface Screenshot {
  url: string;
  filename: string;
  alt: string;
}

export interface CardMeta {
  owner: string;
  repo: string;
  url: string;
  branch: string;
  configPath: string;
  fetchedAt: number;
}

/** A field either resolved to data or carries a per-field RepoDeckError. */
export type FieldResult<T> = T | { error: RepoDeckError };

export interface CardData {
  meta: CardMeta;
  resume: FieldResult<ResumeData> | null;
  readme: FieldResult<ReadmeData> | null;
  screenshots: FieldResult<Screenshot[]> | null;
  /** Optional repo stats (stars, forks, watchers) — only fetched when
   * `include.stats` is true (typically via the `show-stats` attribute). */
  stats?: FieldResult<RepoStats> | null;
}

export interface RepoStats {
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  defaultBranch: string;
  pushedAt: number; // epoch ms
  // Repo metadata — pulled from the same API call, eliminates the need to
  // duplicate these in config-repodeck frontmatter.
  /** Repo name (e.g. "my-project"). */
  repoName: string;
  /** GitHub description field. */
  repoDescription: string | null;
  /** Repository topics (tags). */
  topics: string[];
  /** Primary language (e.g. "TypeScript"). */
  language: string | null;
  /** Homepage URL set in the repo settings. */
  homepage: string | null;
  /** Owner login. */
  ownerLogin: string;
  /** Owner avatar URL. */
  ownerAvatarUrl: string;
}

export interface BuildOptions {
  include?: {
    readme?: boolean;
    resume?: boolean;
    screenshots?: boolean;
    stats?: boolean;
  };
  branch?: string;
  configPath?: string;
  token?: string;
  /** Per-request timeout in ms (default 12000). */
  timeoutMs?: number;
  /** Retries on 5xx/network errors (default 2). */
  retries?: number;
  /** Resume char limit (default 280). */
  resumeMaxChars?: number;
  /** Locale for localized RESUME detection (plan §16.19). Tries
   * `RESUME.<locale>.txt` before falling back to `RESUME.txt`. */
  locale?: string;
  /** Log per-field fetches, cache hits and errors (or REPODECK_DEBUG=1). */
  debug?: boolean;
}

export interface PresetDefinition {
  /** Which fields to fetch from GitHub. */
  include: {
    readme: boolean;
    resume: boolean;
    screenshots: boolean;
  };
  /** Whether the card shows a README preview line. */
  readmePreview: boolean;
  /** Max chars of the README preview on the card. */
  readmePreviewChars?: number;
  /** Show repo title (always true, kept for completeness). */
  showTitle: boolean;
}

export interface ResolvedConfig extends PresetDefinition {
  name: string;
}

export type RadiusPresetName = 'sharp' | 'soft' | 'round';

export interface RadiusTokens {
  card: string;
  button: string;
  modal: string;
}

export type ScreenshotLayoutMode = 'single' | 'bento';

export interface LayoutItem {
  screenshot: Screenshot;
  /** grid-column span */
  colSpan: number;
  /** grid-row span */
  rowSpan: number;
  /** whether this is the "hero" tile */
  hero: boolean;
  /** "+N" overlay count, only set on the last visible tile when overflowing */
  overflow?: number;
}

export interface ScreenshotLayout {
  mode: ScreenshotLayoutMode;
  items: LayoutItem[];
  total: number;
  hidden: number;
}
