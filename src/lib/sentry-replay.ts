/**
 * Session Replay is about a quarter of the Sentry SDK. This file is only ever loaded with `import()` (see sentry.ts),
 * so the replay code lands in its own chunk and stays out of the initial load (spec §12: < 250 KB gzip).
 */
export { replayIntegration } from '@sentry/react';
