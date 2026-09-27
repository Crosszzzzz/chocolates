import { expect, test } from '@playwright/test';

test('GET /api/health returns ok:true with products check', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  const json = (await res.json()) as {
    ok?: unknown;
    version?: unknown;
    time?: unknown;
    checks?: { products?: { ok?: unknown } };
  };
  expect(json.ok).toBe(true);
  expect(typeof json.version).toBe('string');
  expect(typeof json.time).toBe('string');
  expect(json.checks?.products?.ok).toBe(true);
});
