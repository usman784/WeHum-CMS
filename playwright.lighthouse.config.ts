import { defineConfig } from '@playwright/test';

/** Lighthouse budgets (spec §12) on the production build (`VITE_API_URL=http://localhost:3000 pnpm build` first). */
export default defineConfig({
  testDir: 'e2e/lighthouse',
  outputDir: 'test-results/lighthouse',
  reporter: 'list',
  workers: 1,
  webServer: {
    command: 'node_modules/.bin/vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
