import { createSHA256 } from 'hash-wasm';

const CHUNK = 8 * 1024 * 1024;

/** `Blob.arrayBuffer()` where it exists, FileReader otherwise (older browsers and the test environment). */
const read = (blob: Blob): Promise<ArrayBuffer> =>
  typeof blob.arrayBuffer === 'function'
    ? blob.arrayBuffer()
    : new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as ArrayBuffer);
        r.onerror = () => reject(r.error ?? new Error('Could not read the file'));
        r.readAsArrayBuffer(blob);
      });

/** SHA-256 hex of a file, read in 8 MB slices so a 2 GB video never sits in memory at once. */
export async function hashBlob(blob: Blob): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  for (let at = 0; at < blob.size; at += CHUNK) {
    hasher.update(new Uint8Array(await read(blob.slice(at, at + CHUNK))));
  }
  return hasher.digest('hex');
}
