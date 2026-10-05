import { defineConfig } from '@playwright/test';

/**
 * E2E against the REAL backend (`pnpm e2e:backend`, after `pnpm build`). See e2e/backend/harness.ts for what it needs.
 * One worker and no parallelism: the tests share one backend and one database.
 */
export default defineConfig({
  testDir: 'e2e/backend',
  outputDir: 'test-results/backend',
  globalSetup: './e2e/backend/global-setup.ts',
  reporter: 'list',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
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
