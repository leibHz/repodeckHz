/**
 * tsup config for the `repodeck` CLI binary.
 *
 * Used by `tsup --config cli.tsup.config.cjs`. Bundles
 * src/cli/repodeck-cli.ts as the entry point and produces ESM + CJS so it
 * works under both Node ESM (`npx`) and `node ./repodeck-cli.cjs`.
 *
 * `marked` and `isomorphic-dompurify` stay external: they pull in jsdom
 * (~10 MB unminified) and are lazy-loaded by @repodeck/core anyway. They are
 * declared as runtime dependencies in package.json, so they resolve from
 * node_modules at runtime.
 *
 * NOTE: This build is run AFTER the main web-component build, so we do NOT
 * use clean:true here — it would wipe the repodeck.js / repodeck.cjs output.
 */

module.exports = {
  entry: { 'repodeck-cli': 'src/cli/repodeck-cli.ts' },
  format: ['esm', 'cjs'],
  dts: false,
  splitting: false,
  sourcemap: false,
  clean: false,
  outDir: 'dist',
  external: ['marked', 'isomorphic-dompurify'],
  // Inject shebang on the first line of every emitted js bundle — required
  // because tsup itself doesn't add one. esbuild's `banner` is prepended.
  esbuildOptions(options) {
    options.banner = { js: "#!/usr/bin/env node" };
  },
  onSuccess: async () => {
    // After build, mark the bundles as executable (npm does this for bin
    // entries in packages it installs; we do it for local dev convenience).
    const fs = require('node:fs');
    for (const f of ['dist/repodeck-cli.js', 'dist/repodeck-cli.cjs']) {
      if (fs.existsSync(f)) {
        try { fs.chmodSync(f, 0o755); } catch (_) { /* ignore */ }
      }
    }
  },
};
