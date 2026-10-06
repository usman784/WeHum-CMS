import { hashBlob } from './checksum-core';

/** Runs off the main thread so the page stays responsive while a large file is hashed (spec §12). */
self.onmessage = async (e: MessageEvent<Blob>) => {
  try {
    self.postMessage({ hex: await hashBlob(e.data) });
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : 'hash failed' });
  }
};
