// M15 observability (adapted stack): tiny dependency-free error reporter.
// No Sentry DSN exists yet → everything degrades to no-op without env vars
// (console.error in dev, silent in prod). A monitoring failure never breaks the app.
// Decision: @sentry/react NOT installed — package.json has no Sentry dep and adding an
// SDK for an unconfigured DSN adds bundle weight + install risk for zero benefit.
// This fetch-based reporter covers the need; swap reportError() internals for the real
// SDK later without touching callers. Env: VITE_SENTRY_DSN (browser only).
// Server side equivalent: api/_report.ts (uses server-only SENTRY_DSN).
// Rollback: delete this file + monitoring.test.ts; remove initMonitoring() in App.tsx.

export type ErrorContext = Record<string, string | number | boolean | null | undefined>;

let initialized = false;

export function getSentryDsn(): string {
  try {
    const v = import.meta.env?.VITE_SENTRY_DSN;
    return typeof v === 'string' ? v.trim() : '';
  } catch {
    return '';
  }
}

export function isMonitoringEnabled(): boolean {
  return getSentryDsn() !== '';
}

/** Parse "https://<key>@<host>/<projectId>" into a Sentry store URL. '' when malformed. Pure. */
export function buildSentryStoreUrl(dsn: string): string {
  const m = /^https?:\/\/([^@/\s]+)@([^/\s]+)\/(\d+)\/?$/.exec(dsn.trim());
  if (!m) return '';
  const [, key, host, project] = m;
  return `https://${host}/api/${project}/store/?sentry_key=${encodeURIComponent(key)}&sentry_version=7`;
}

function toMessage(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message !== '' ? err.message : String(err), stack: err.stack };
  if (typeof err === 'string') return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: 'Unknown error' };
  }
}

function isDev(): boolean {
  try {
    return import.meta.env?.DEV === true;
  } catch {
    return false;
  }
}

/**
 * Best-effort error report. Sends to Sentry when VITE_SENTRY_DSN is set,
 * else console.error in dev / silent in prod. Never throws — safe in any catch path.
 */
export function reportError(err: unknown, context?: ErrorContext): void {
  try {
    const dsn = getSentryDsn();
    const { message, stack } = toMessage(err);
    if (dsn === '') {
      if (isDev()) console.error('[monitoring:noop]', message, context ?? '');
      return;
    }
    const storeUrl = buildSentryStoreUrl(dsn);
    if (storeUrl === '') return;
    const body = JSON.stringify({
      level: 'error',
      logger: 'm15-monitoring',
      message,
      timestamp: Date.now() / 1000,
      extra: { ...(stack !== undefined ? { stack } : {}), ...context },
    });
    // Fire-and-forget: monitoring must never break the app or delay handlers.
    void fetch(storeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {
      /* swallow: reporting failure is not an app failure */
    });
  } catch {
    /* swallow: reporting failure is not an app failure */
  }
}

/**
 * Attach window error/unhandledrejection handlers exactly once.
 * Safe in non-browser envs (SSR/tests without window). Never throws.
 * Call once from App.tsx at startup.
 */
export function initMonitoring(): void {
  try {
    if (initialized) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    initialized = true;
    window.addEventListener('error', (e) => {
      const err = e instanceof ErrorEvent ? (e.error ?? e.message) : e;
      reportError(err, { route: 'window.onerror' });
    });
    window.addEventListener('unhandledrejection', (e) => {
      const reason = e instanceof PromiseRejectionEvent ? e.reason : e;
      reportError(reason, { route: 'unhandledrejection' });
    });
  } catch {
    /* swallow */
  }
}

/** Test-only reset for the once-guard (not used in app code). */
export function __resetMonitoringForTests(): void {
  initialized = false;
}
