/**
 * @repodeckhz/core — layout.ts
 *
 * Decides how screenshots are laid out.
 *  - 1 image  → `single` (cover)
 *  - 2+ images → `bento` (asymmetric grid, deterministic spans)
 *
 * Spans are deterministic (not random) so the layout never "jumps" between
 * re-renders. The first image is always the hero (because screenshots are
 * sorted alphabetically upstream, naming `01-capa.png` makes it the cover).
 */

import type {
  LayoutItem,
  Screenshot,
  ScreenshotLayout,
} from './types';

/**
 * Deterministic bento span map.
 *  - 2 images: hero spans 2 cols, second spans 1
 *  - 3 images: hero 2x2, others 1x1 stacked
 *  - 4+ images: 2x2 mosaic, first tile always hero
 */
export function assignBentoSpans(count: number): Array<{ colSpan: number; rowSpan: number; hero: boolean }> {
  if (count <= 0) return [];
  if (count === 1) return [{ colSpan: 2, rowSpan: 2, hero: true }];
  if (count === 2) {
    return [
      { colSpan: 2, rowSpan: 2, hero: true },
      { colSpan: 2, rowSpan: 2, hero: false },
    ];
  }
  if (count === 3) {
    return [
      { colSpan: 2, rowSpan: 2, hero: true },
      { colSpan: 2, rowSpan: 1, hero: false },
      { colSpan: 2, rowSpan: 1, hero: false },
    ];
  }
  // 4+ → 2x2 mosaic; first tile hero (2x2), rest 1x1
  const spans: Array<{ colSpan: number; rowSpan: number; hero: boolean }> = [
    { colSpan: 2, rowSpan: 2, hero: true },
  ];
  for (let i = 1; i < count; i++) {
    spans.push({ colSpan: 1, rowSpan: 1, hero: false });
  }
  return spans;
}

export function resolveScreenshotLayout(
  screenshots: Screenshot[],
  context: 'card' | 'modal',
): ScreenshotLayout {
  if (screenshots.length === 0) {
    return { mode: 'single', items: [], total: 0, hidden: 0 };
  }

  const total = screenshots.length;

  if (context === 'modal') {
    // Modal shows every screenshot, no overflow indicator.
    if (total === 1) {
      return {
        mode: 'single',
        items: [{ screenshot: screenshots[0], colSpan: 1, rowSpan: 1, hero: true }],
        total,
        hidden: 0,
      };
    }
    const spans = assignBentoSpans(total);
    return {
      mode: 'bento',
      items: screenshots.map((s, i) => ({
        screenshot: s,
        colSpan: spans[i].colSpan,
        rowSpan: spans[i].rowSpan,
        hero: spans[i].hero,
      })),
      total,
      hidden: 0,
    };
  }

  // Card context — single cover image; extras go to the modal (+N indicator).
  const hidden = total - 1;
  const items: LayoutItem[] = [
    { screenshot: screenshots[0], colSpan: 2, rowSpan: 2, hero: true },
  ];
  if (hidden > 0) items[0].overflow = hidden;
  return { mode: 'single', items, total, hidden };
}
