/**
 * @repodeck/core — errors.ts
 *
 * Single typed error used across the whole package so consumers can branch on
 * `error.code` instead of parsing message strings.
 *
 * The class is exported under two names — `RepoDeckError` is the canonical
 * name going forward; `repodeckError` is kept as an alias for the legacy
 * `repodeck` rebrand that still appears in some docs and modules. Both
 * resolve to the same class, so `instanceof` checks work either way.
 */

export type RepoDeckErrorCode =
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'NETWORK_ERROR'
  | 'INVALID_CONFIG';

/** Legacy alias used by modules still on the `repodeck` branding. */
export type repodeckErrorCode = RepoDeckErrorCode;

export class RepoDeckError extends Error {
  code: RepoDeckErrorCode;
  status?: number;
  field?: string;

  constructor(
    code: RepoDeckErrorCode,
    message: string,
    opts?: { status?: number; field?: string; cause?: unknown },
  ) {
    super(message);
    this.name = 'RepoDeckError';
    this.code = code;
    if (opts?.status !== undefined) this.status = opts.status;
    if (opts?.field !== undefined) this.field = opts.field;
    if (opts?.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      field: this.field,
    };
  }
}

// Back-compat alias — same class, just re-exported under the upstream `repodeck` name.
export const repodeckError = RepoDeckError;
