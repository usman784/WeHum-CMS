import { startBackend, stopBackend } from './harness';

/** Fresh e2e database, then the real backend on :3000. Returns the teardown that stops it. */
export default async function globalSetup() {
  stopBackend(); // a leftover from an interrupted run
  await startBackend();
  return () => stopBackend();
}
