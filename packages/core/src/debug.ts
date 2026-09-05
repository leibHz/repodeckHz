/**
 * @repodeckhz/core — debug.ts
 *
 * Minimal opt-in debug logging. Enabled per-call via `debug: true` in the
 * options object, or globally via the `REPODECK_DEBUG=1` environment variable.
 * Lines are prefixed `[repodeck:scope]` so consumers can filter them.
 */

export function isDebugEnabled(flag?: boolean): boolean {
  if (flag) return true;
  const env = process.env.REPODECK_DEBUG;
  return env === '1' || env === 'true' || env === 'TRUE' || env === 'yes';
}

export function dbgLog(enabled: boolean, scope: string, ...args: unknown[]): void {
  if (!enabled) return;
  // eslint-disable-next-line no-console
  console.log(`[repodeck:${scope}]`, ...args);
}
