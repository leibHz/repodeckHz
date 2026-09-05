/**
 * @repodeckhz/core — presets.ts
 *
 * Presets define "what shows on the compact card" vs "what is available in the
 * modal". Consumers can register their own preset without forking.
 */

import { repodeckError } from './errors';
import type { PresetDefinition, ResolvedConfig } from './types';

export const defaultPresets: Record<string, PresetDefinition> = {
  /** title + 1 screenshot cover */
  minimal: {
    include: { readme: false, resume: false, screenshots: true },
    readmePreview: false,
    showTitle: true,
  },
  /** title + resume + screenshot cover */
  standard: {
    include: { readme: true, resume: true, screenshots: true },
    readmePreview: false,
    showTitle: true,
  },
  /** title + resume + screenshots + README preview line */
  detailed: {
    include: { readme: true, resume: true, screenshots: true },
    readmePreview: true,
    readmePreviewChars: 140,
    showTitle: true,
  },
};

const registry = new Map<string, PresetDefinition>(Object.entries(defaultPresets));

export function registerPreset(name: string, definition: PresetDefinition): void {
  registry.set(name, definition);
}

export function getPreset(name: string): PresetDefinition {
  const def = registry.get(name);
  if (!def) {
    throw new repodeckError(
      'INVALID_CONFIG',
      `Unknown preset "${name}". Available: ${[...registry.keys()].join(', ')}`,
    );
  }
  return def;
}

export function listPresets(): string[] {
  return [...registry.keys()];
}

export function mergePresetWithUserConfig(
  preset: PresetDefinition,
  overrides: Partial<PresetDefinition>,
  name = 'custom',
): ResolvedConfig {
  return {
    name,
    ...preset,
    ...overrides,
    include: { ...preset.include, ...(overrides.include ?? {}) },
  };
}
