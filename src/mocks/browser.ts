import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/** Browser mock API for local work without a backend (`VITE_MOCKS=1 pnpm dev`). */
export const worker = setupWorker(...handlers);
