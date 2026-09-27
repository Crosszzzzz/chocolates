import { expect, test } from '@playwright/test';

// M2 dive: factory select must always reach the corridor. Written tolerant:
// the new code shows a skippable timed diving overlay, the pre-dive code goes
// direct — both satisfy "corridor always reachable".
test('factory select always reaches the corridor (skip path)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Ruta del Chocolate de Sucre/i)).toBeVisible({ timeout: 15000 });
  const entrar = page.getByRole('button', { name: /Entrar a la Isla/i });
  await expect(entrar).toBeVisible({ timeout: 15000 });
  await entrar.click();
  const skip = page.getByRole('button', { name: /Omitir transici/i });
  try {
    if (await skip.isVisible({ timeout: 3000 })) await skip.click();
  } catch {
    // No diving overlay (pre-dive build): corridor is reached directly.
  }
  await expect(page.getByText(/Pasillo Hist/i).first()).toBeVisible({ timeout: 15000 });
});

test('timed dive reaches corridor without skipping', async ({ page }) => {
  await page.goto('/');
  const entrar = page.getByRole('button', { name: /Entrar a la Isla/i });
  await expect(entrar).toBeVisible({ timeout: 15000 });
  await entrar.click();
  await expect(page.getByText(/Pasillo Hist/i).first()).toBeVisible({ timeout: 15000 });
});

test('reduced-motion still reaches corridor', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.goto('/');
    const entrar = page.getByRole('button', { name: /Entrar a la Isla/i });
    await expect(entrar).toBeVisible({ timeout: 15000 });
    await entrar.click();
    await expect(page.getByText(/Pasillo Hist/i).first()).toBeVisible({ timeout: 15000 });
  } finally {
    await context.close();
  }
});
