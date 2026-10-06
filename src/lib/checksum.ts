/**
 * SHA-256 of a file for the duplicate warning. Hashing runs in a Web Worker. It is best effort:
 * if it fails for any reason the upload simply goes on without a checksum.
 */
export async function fileChecksum(file: File): Promise<string | undefined> {
  if (typeof Worker === 'undefined') {
    // No workers (tests, very old browsers): hash on this thread.
    const { hashBlob } = await import('./checksum-core');
    return hashBlob(file);
  }
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./checksum.worker.ts', import.meta.url), { type: 'module' });
    const finish = (hex?: string) => {
      worker.terminate();
      resolve(hex);
    };
    worker.onmessage = (e: MessageEvent<{ hex?: string }>) => finish(e.data.hex);
    worker.onerror = () => finish();
    worker.postMessage(file);
  });
}
