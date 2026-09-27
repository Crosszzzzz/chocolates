import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60 * 1000,
  reporter: [['list']],
  use: {
    baseURL: 'https://chocolates-zeta.vercel.app',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
