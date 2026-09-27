import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    env: {
      VITE_WHATSAPP_NUMBER: '59167624420',
    },
  },
});
