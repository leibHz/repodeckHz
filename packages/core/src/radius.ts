/**
 * @repodeckhz/core — radius.ts
 *
 * Translates the `radius` attribute (preset name OR raw CSS value) into the
 * three tokens used internally. Each token can be individually overridden via
 * CSS custom properties on the host.
 */

import type { RadiusPresetName, RadiusTokens } from './types';

const PRESET_VALUES: Record<RadiusPresetName, RadiusTokens> = {
  sharp: { card: '2px', button: '2px', modal: '2px' },
  soft: { card: '12px', button: '8px', modal: '16px' },
  round: { card: '22px', button: '999px', modal: '24px' },
};

function isPresetName(v: string): v is RadiusPresetName {
  return v === 'sharp' || v === 'soft' || v === 'round';
}

/** True if the string looks like a usable CSS length. */
function looksLikeCssLength(v: string): boolean {
  return /^-?\d*\.?\d+(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt|pc|in|cm|mm)?$/.test(v.trim());
}

export function resolveRadiusTokens(radiusAttr: string): RadiusTokens {
  const trimmed = (radiusAttr ?? '').trim();
  if (trimmed === '') return PRESET_VALUES.soft;
  if (isPresetName(trimmed)) return PRESET_VALUES[trimmed];
  if (looksLikeCssLength(trimmed)) {
    return { card: trimmed, button: trimmed, modal: trimmed };
  }
  // Unknown value → fall back to soft silently rather than crashing the card.
  return PRESET_VALUES.soft;
}
