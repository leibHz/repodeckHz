import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

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
      // Side-effect imports that auto-register the custom element. The
      // `@repodeckhz/web` main and `@repodeckhz/web/auto` subpath both point
      // at the sibling built bundle.
      { find: '@repodeckhz/web/auto', replacement: REPODECK_DIST },
      { find: '@repodeckhz/web/', replacement: REPODECK_DIST },
      { find: '@repodeckhz/web', replacement: REPODECK_DIST },
    ],
  },
  esbuild: {
    target: 'es2020',
    jsx: 'automatic',
  },
});
