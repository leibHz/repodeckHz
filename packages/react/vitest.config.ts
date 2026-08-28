import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const REPOCARD_DIST = fileURLToPath(
  new URL('../web-component/dist/repocard.js', import.meta.url),
);
const REPODECK_DIST = fileURLToPath(
  new URL('../web-component/dist/repodeck.js', import.meta.url),
);

export default defineConfig({
  test: {
    globals: false,
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    sequence: { shuffle: false },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    alias: [
      // Side-effect imports that auto-register the custom element. Both
      // `repocard/auto` (legacy) and `repodeck/auto` (canonical) point at the
      // matching built bundle in the sibling web-component package.
      { find: 'repocard/repodeck/', replacement: REPODECK_DIST },
      { find: 'repocard/repodeck/auto', replacement: REPODECK_DIST },
      { find: 'repocard/repodeck',      replacement: REPODECK_DIST },
      { find: 'repocard/auto', replacement: REPOCARD_DIST },
      { find: 'repocard/',      replacement: REPOCARD_DIST },
      { find: 'repodeck/auto', replacement: REPODECK_DIST },
      { find: 'repodeck',      replacement: REPODECK_DIST },
    ],
  },
  esbuild: {
    target: 'es2020',
    jsx: 'automatic',
  },
});
