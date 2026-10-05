import { defineConfig } from '@playwright/test';

/**
 * E2E against the production build (`pnpm build` first). Uses the installed Chrome when PW_CHANNEL=chrome,
 * else Playwright's own Chromium. Later phases add projects that run against the local backend (spec §13).
 */
export default defineConfig({
  testDir: 'e2e',
  testIgnore: 'backend/**', // real-backend tests have their own config: playwright.backend.config.ts
  outputDir: 'test-results',
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  expect: { timeout: 10_000 }, // the first test after the preview server starts loads every chunk cold
  use: {
    baseURL: 'http://localhost:4173',
    channel: process.env.PW_CHANNEL || undefined,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node_modules/.bin/vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
