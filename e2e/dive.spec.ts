import { expect, test } from '@playwright/test';

// Dive: factory select must always reach the chamber (Sala Real). The corridor
// phase is retired: archipelago -> diving -> chamber, Escape skips the dive.
test('factory select always reaches the chamber (skip path)', async ({ page }) => {
  await page.goto('/');
  const entrar = page.getByRole('button', { name: /Entrar a la Isla/i });
  await expect(entrar).toBeVisible({ timeout: 15000 });
  await entrar.click();
  const skip = page.getByRole('button', { name: /Omitir transici/i });
  try {
    if (await skip.isVisible({ timeout: 3000 })) await skip.click();
  } catch {
    // No diving overlay with a skip button: chamber is reached directly.
  }
  await expect(page.getByText(/Sala Real/i).first()).toBeVisible({ timeout: 15000 });
});

test('timed dive reaches chamber without skipping', async ({ page }) => {
  await page.goto('/');
  const entrar = page.getByRole('button', { name: /Entrar a la Isla/i });
  await expect(entrar).toBeVisible({ timeout: 15000 });
  await entrar.click();
  await expect(page.getByText(/Sala Real/i).first()).toBeVisible({ timeout: 15000 });
});

test('reduced-motion still reaches chamber', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.goto('/');
    const entrar = page.getByRole('button', { name: /Entrar a la Isla/i });
    await expect(entrar).toBeVisible({ timeout: 15000 });
    await entrar.click();
    await expect(page.getByText(/Sala Real/i).first()).toBeVisible({ timeout: 15000 });
  } finally {
    await context.close();
  }
});
