import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** The MSW worker in `public/` is for local work only: keep it out of the production build. */
const dropMockWorker = (): Plugin => ({
  name: 'drop-mock-worker',
  apply: 'build',
  closeBundle: () => rmSync(resolve(import.meta.dirname, 'dist/mockServiceWorker.js'), { force: true }),
});

export default defineConfig({
  plugins: [react(), dropMockWorker()],
  build: {
    sourcemap: true, // uploaded to Sentry in CI, then deleted
    // No manualChunks: Recharts and dnd-kit are only imported by lazy() feature pages, so Rollup already splits them
    // out of the initial load. Naming them by hand moved shared React code into the "charts" chunk.
  },
  test: {
    environment: './src/test/env.ts', // jsdom + Node's AbortController (see the file)
    environmentOptions: { jsdom: { url: 'http://localhost:5173' } },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    env: {
      VITE_ENV: 'test',
      VITE_API_URL: 'http://api.test',
      VITE_SOCKET_URL: 'http://api.test',
      VITE_SENTRY_DSN: '',
    },
  },
});
