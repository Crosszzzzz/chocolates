// M15 API safety net (adapted stack, dependency-free — no SDK in api/).
//
// PATTERN (use from any api/*.ts catch path):
//   import { reportApiError } from './_report';
//   try {
//     ...handler work...
//   } catch (err) {
//     reportApiError('products', err, { method: req.method });
//     res.status(500).json({ error_es: '...' });
//   }
//
// BEHAVIOR:
// - Always writes one structured JSON line to console.error (Vercel log drains pick it up).
// - When process.env.SENTRY_DSN is set, best-effort POSTs the event to the Sentry store
//   endpoint (envelope-free store API, same one browsers use). Fire-and-forget.
// - NEVER throws: monitoring must never turn a 500 into a crashed function.
//   Safe to call when SENTRY_DSN is unset (log line only).
//
// ENV: SENTRY_DSN (server-only, NO VITE_ prefix — never expose to the browser).
//      Browser counterpart: src/lib/monitoring.ts (uses VITE_SENTRY_DSN).
// ROLLBACK: delete this file; replace each call site with a plain console.error.

export type ApiErrorExtra = Record<string, string | number | boolean | null | undefined>;

type VercelRequestLike = {
  method?: string;
};

/** Parse "https://<key>@<host>/<projectId>" into a Sentry store URL. '' when malformed. Pure. */
export function buildSentryStoreUrl(dsn: string): string {
  const m = /^https?:\/\/([^@/ \t]+)@([^/ \t]+)\/(\d+)\/?$/.exec(dsn.trim());
  if (!m) return '';
  const [, key, host, project] = m;
  return `https://${host}/api/${project}/store/?sentry_key=${encodeURIComponent(key as string)}&sentry_version=7`;
}

function toErrorMessage(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message !== '' ? err.message : String(err), stack: err.stack };
  if (typeof err === 'string') return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: 'Unknown error' };
  }
}

/**
 * Best-effort API error report. Structured log always; Sentry POST only when
 * SENTRY_DSN is configured. Never throws.
 */
export function reportApiError(route: string, err: unknown, extra?: ApiErrorExtra, req?: VercelRequestLike): void {
  try {
    const { message, stack } = toErrorMessage(err);
    const time = new Date().toISOString();
    // Structured log line — the primary signal when no Sentry DSN is configured.
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'api',
        route,
        method: req?.method ?? 'unknown',
        message,
        ...(stack !== undefined ? { stack } : {}),
        ...(extra !== undefined ? { extra } : {}),
        time,
      }),
    );
    const dsn = typeof process.env['SENTRY_DSN'] === 'string' ? (process.env['SENTRY_DSN'] as string).trim() : '';
    if (dsn === '') return;
    const storeUrl = buildSentryStoreUrl(dsn);
    if (storeUrl === '') return;
    const body = JSON.stringify({
      level: 'error',
      logger: 'm15-api',
      message: `[${route}] ${message}`,
      timestamp: Date.now() / 1000,
      extra: { route, method: req?.method ?? 'unknown', ...(stack !== undefined ? { stack } : {}), ...extra },
    });
    void fetch(storeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {
      /* swallow: reporting failure is not a handler failure */
    });
  } catch {
    /* swallow: reporting failure is not a handler failure */
  }
}
