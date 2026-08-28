import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Force vitest to use this package's tsconfig regardless of anytsconfig
  // higher up in the tree (e.g. the monorepo root tsconfig). Without this,
  // vitest picks up the root config which doesn't declare `.ts` as an
  // importable extension and the test files fail to resolve siblings
  // like `import { Foo } from '../foo'`.
  esbuild: {
    target: 'es2020',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    sequence: { shuffle: false },
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 8000,
    hookTimeout: 8000,
  },
});
