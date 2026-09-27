import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetMonitoringForTests,
  buildSentryStoreUrl,
  initMonitoring,
  isMonitoringEnabled,
  reportError,
} from './monitoring';

const DSN = 'https://publickey123@o0.ingest.sentry.io/123456';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  __resetMonitoringForTests();
});

describe('buildSentryStoreUrl', () => {
  it('builds the store URL from a DSN', () => {
    expect(buildSentryStoreUrl(DSN)).toBe(
      'https://o0.ingest.sentry.io/api/123456/store/?sentry_key=publickey123&sentry_version=7',
    );
  });

  it('returns empty for malformed DSN', () => {
    expect(buildSentryStoreUrl('')).toBe('');
    expect(buildSentryStoreUrl('not-a-dsn')).toBe('');
    expect(buildSentryStoreUrl('https://nokeyhost/')).toBe('');
  });
});

describe('isMonitoringEnabled', () => {
  it('reflects DSN presence', () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    expect(isMonitoringEnabled()).toBe(false);
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    expect(isMonitoringEnabled()).toBe(true);
  });
});

describe('reportError', () => {
  it('is a silent no-op without DSN (no fetch)', () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('must not be called'));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_SENTRY_DSN', '');
    expect(() => reportError(new Error('boom'))).not.toThrow();
    expect(() => reportError('plain string')).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to the Sentry store when DSN is set', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    reportError(new Error('boom'), { route: 'test' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/123456/store/');
    expect(init?.method).toBe('POST');
    expect(String(init?.body ?? '')).toContain('boom');
    expect(String(init?.body ?? '')).toContain('test');
  });

  it('never throws when fetch rejects (monitoring cannot break the app)', () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    expect(() => reportError('string failure')).not.toThrow();
    expect(() => reportError({ weird: ['object'] })).not.toThrow();
  });
});

describe('initMonitoring', () => {
  it('attaches once and forwards window errors to Sentry', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    initMonitoring();
    initMonitoring(); // idempotent: second call is a no-op
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('window boom'), message: 'window boom' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never throws without DSN', () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    expect(() => initMonitoring()).not.toThrow();
  });
});
