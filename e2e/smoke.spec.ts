import { expect, test } from '@playwright/test';

test('homepage title contains Chocolate/Sucre', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Chocolate|Sucre/i);
});

test('GET /api/products returns 9 products', async ({ page }) => {
  const res = await page.request.get('/api/products');
  expect(res.ok()).toBeTruthy();
  const json = (await res.json()) as { products?: unknown[] };
  expect(Array.isArray(json.products)).toBeTruthy();
  expect(json.products).toHaveLength(9);
});
