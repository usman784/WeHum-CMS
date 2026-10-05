import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true, // uploaded to Sentry in CI, then deleted
    rollupOptions: { output: { manualChunks: { charts: ['recharts'], dnd: ['@dnd-kit/core', '@dnd-kit/sortable'] } } },
  },
});
