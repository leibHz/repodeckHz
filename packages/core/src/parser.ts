/**
 * @repodeck/core — parser.ts
 *
 * Transforms raw text from GitHub into display-ready data.
 *
 * Security: README content comes from third-party repos, so markdown→HTML is
 * followed by sanitization (isomorphic-dompurify) to neutralise XSS.
 *
 * Performance: `marked` and `isomorphic-dompurify` are lazy-loaded on first
 * `parseReadme` call — consumers that only use `parseResume` /
 * `resolveScreenshots` never pay the cost of loading these heavy deps.
 */

import { buildRawUrl } from './github-client';
import type { DirectoryEntry, ReadmeData, ResumeData, Screenshot } from './types';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

// Lazy-loaded heavy dependencies (marked + isomorphic-dompurify pull in jsdom).
// Only resolved when parseReadme() is actually called.
let _marked: typeof import('marked')['marked'] | null = null;
let _DOMPurify: typeof import('isomorphic-dompurify')['default'] | null = null;

async function loadMarked() {
  if (!_marked) {
    const mod = await import('marked');
    _marked = mod.marked;
  }
  return _marked;
}

async function loadDOMPurify() {
  if (!_DOMPurify) {
    const mod = await import('isomorphic-dompurify');
    _DOMPurify = mod.default;
  }
  installLinkHardeningHook();
  return _DOMPurify;
}

// Reverse-tabnabbing hardening. README links open in a new tab (target below),
// so every <a> must carry rel="noopener noreferrer" — otherwise a malicious
// repo could abuse window.opener to phish the embedding page. DOMPurify hooks
// are registered on the shared singleton, so guard with a flag to stay
// idempotent across calls.
let _linkHookInstalled = false;
function installLinkHardeningHook() {
  if (_linkHookInstalled || !_DOMPurify) return;
  _linkHookInstalled = true;
  _DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

const DEFAULT_RESUME_MAX = 280;

/**
 * Parses YAML-like frontmatter from the top of README.md (plan §16.18).
 * Supports: title, accent (hex color), order (number), description, tags.
 * Returns { metadata, content } where content is the markdown with frontmatter
 * stripped.
 */
export function parseReadmeFrontmatter(rawMarkdown: string): {
  metadata: Record<string, string | number>;
  content: string;
} {
  const m = String(rawMarkdown ?? '').match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { metadata: {}, content: rawMarkdown ?? '' };
  const yamlBlock = m[1];
  const content = (rawMarkdown ?? '').slice(m[0].length);
  const metadata: Record<string, string | number> = {};
  yamlBlock.split('\n').forEach((line) => {
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/);
    if (!kv) return;
    const key = kv[1].trim();
    const val = kv[2].trim().replace(/^["']|["']$/g, '');
    // Validate accent color (hex).
    if (key === 'accent' && !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(val)) return;
    // Parse order as number.
    if (key === 'order') {
      const n = Number(val);
      if (!isNaN(n)) metadata[key] = n;
      return;
    }
    // Only allow safe string keys (title, description, topics, tags).
    if (['title', 'accent', 'order', 'description', 'tags', 'topics', 'author'].includes(key)) {
      metadata[key] = val;
    }
  });
  return { metadata, content };
}

/**
 * Normalises RESUME.txt: collapses excessive whitespace, applies a configurable
 * char limit. Returns a `truncated` flag so the UI can show "…" / a "see more"
 * affordance that opens the modal.
 */
export function parseResume(
  rawText: string,
  options?: { maxChars?: number },
): ResumeData {
  const maxChars = options?.maxChars ?? DEFAULT_RESUME_MAX;
  const normalised = rawText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalised.length <= maxChars) {
    return { text: normalised, truncated: false };
  }
  // Cut on a word boundary when possible.
  let cut = normalised.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.6) cut = cut.slice(0, lastSpace);
  return { text: cut, truncated: true };
}

/**
 * Converts Markdown → sanitized HTML. No truncation (the modal shows the full
 * README with internal scroll — see plan §8).
 * Also extracts frontmatter (plan §16.18) so the web component can apply
 * per-project accent color + title overrides without extra config on the
 * embedder's side.
 *
 * Async because `marked` + `isomorphic-dompurify` are lazy-loaded on first
 * call — keeping the initial bundle light.
 */
export async function parseReadme(rawMarkdown: string): Promise<ReadmeData> {
  const { metadata, content } = parseReadmeFrontmatter(rawMarkdown ?? '');
  const marked = await loadMarked();
  const DOMPurify = await loadDOMPurify();
  marked.setOptions({ gfm: true, breaks: false });
  const dirtyHtml = marked.parse(content, { async: false }) as string;
  const html = DOMPurify.sanitize(dirtyHtml, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr', 'blockquote', 'pre', 'code',
      'ul', 'ol', 'li',
      'a', 'strong', 'em', 'del', 's', 'sup', 'sub',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'span', 'div', 'details', 'summary',
    ],
    ALLOWED_ATTR: [
      'href', 'title', 'alt', 'src', 'width', 'height',
      'colspan', 'rowspan', 'target', 'rel', 'align',
    ],
    ALLOW_DATA_ATTR: false,
  });
  return {
    html,
    raw: rawMarkdown ?? '',
    frontmatter: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

/**
 * Filters the screenshots/ listing to valid image extensions, sorts
 * alphabetically (so `01-`, `02-` prefixes give a stable order), and resolves
 * each to a raw.githubusercontent.com URL.
 */
export function resolveScreenshots(
  entries: DirectoryEntry[],
  owner: string,
  repo: string,
  branch: string,
): Screenshot[] {
  return entries
    .filter((e) => IMAGE_EXTENSIONS.some((ext) => e.name.toLowerCase().endsWith(ext)))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }))
    .map((e) => {
      const path = e.path;
      return {
        url: buildRawUrl(owner, repo, branch, path),
        filename: e.name,
        alt: e.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
      };
    });
}
