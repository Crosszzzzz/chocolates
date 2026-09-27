import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60 * 1000,
  reporter: [['list']],
  use: {
    // PLAYWRIGHT_BASE_URL override enables local verification (dev/preview)
    // without editing this file; default stays the live site for CI.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://chocolates-zeta.vercel.app',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
