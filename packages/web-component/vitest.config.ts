import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    // happy-dom provides a browser-shaped global (customElements,
    // attachShadow, IntersectionObserver) without needing a real browser.
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    sequence: { shuffle: false },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  },
  esbuild: {
    target: 'es2020',
  },
});
