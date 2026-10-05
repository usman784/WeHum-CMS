import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { App } from './app/App';
import { Providers } from './app/providers';
import { env } from './lib/env';
import { initSentry } from './lib/sentry';
import { initTheme } from './lib/theme';

async function start() {
  initTheme();
  initSentry();
  // Local work without a backend: `VITE_MOCKS=1 pnpm dev`. The worker is never part of a production build.
  if (import.meta.env.DEV && env.mocks) {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Providers>
        <App />
      </Providers>
    </StrictMode>,
  );
}

void start();
