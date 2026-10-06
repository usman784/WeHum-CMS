import { api, ApiError } from './api';

/**
 * Direct-to-S3 multipart upload (spec §2.2, §10): the API hands out presigned part URLs, the browser sends the
 * parts itself (4 at a time), failed parts retry on their own, and the upload can pause, resume and cancel.
 * Nothing here knows about React; `hooks/useUpload.ts` wraps it.
 */
export type UploadKind = 'audio' | 'video' | 'image';

type Part = { partNumber: number; url: string };
export type StartedUpload = {
  id: string;
  uploadId: string;
  partSize: number;
  parts: Part[];
  expiresAt: string;
  /** The same file (by checksum) is already in the library. The upload still goes on; the UI warns. */
  duplicateOf: { id: string; name: string | null } | null;
};
export type CompletedUpload = { id: string; status: 'processing'; jobId: string };

export type UploadStatus = 'hashing' | 'uploading' | 'paused' | 'completing' | 'done' | 'cancelled' | 'failed';
export type UploadSnapshot = {
  status: UploadStatus;
  /** 0–1 of the file bytes that reached S3. */
  progress: number;
  /** Why it is paused: the admin asked, or the network kept failing. */
  pausedBy?: 'user' | 'network';
  mediaId?: string;
  duplicateOf?: StartedUpload['duplicateOf'];
  error?: string;
};

export class UploadCancelled extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadCancelled';
  }
}

export const PARALLEL_PARTS = 4;
const MAX_TRIES = 5;
/** Wait before try n (1-based) of the same part: 1 s, 2 s, 4 s, 8 s. Tests shorten it. */
export const retryDelay = { ms: (attempt: number) => 1000 * 2 ** (attempt - 1) };

type PutResult = { ok: true; etag: string } | { ok: false; status: number };

/** PUT one part with XMLHttpRequest, because `fetch` cannot report upload progress. */
function putPart(url: string, body: Blob, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<PutResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader('etag');
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve({ ok: true, etag });
      // 2xx without a readable ETag means the bucket's CORS rules do not expose it: retrying cannot help.
      else if (xhr.status >= 200 && xhr.status < 300)
        reject(new Error('The storage did not return a part receipt (ETag). Check the bucket CORS settings.'));
      else resolve({ ok: false, status: xhr.status });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0 });
    // Reject from the signal itself and not only from `onabort`: the promise must settle even if the browser
    // never fires the event for a request that was already finishing.
    const stop = () => {
      xhr.abort();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) return stop();
    signal.addEventListener('abort', stop, { once: true });
    xhr.send(body);
  });
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

const isAbort = (e: unknown) => (e as Error | undefined)?.name === 'AbortError';

export type UploadOptions = {
  onChange?: (s: UploadSnapshot) => void;
  /** SHA-256 hex of the file, for the duplicate warning. Optional: an upload without it works the same. */
  checksum?: (file: File) => Promise<string | undefined>;
};

export class Upload {
  private snapshot: UploadSnapshot = { status: 'hashing', progress: 0 };
  private started: StartedUpload | null = null;
  private urls = new Map<number, string>();
  private pending: number[] = [];
  private etags = new Map<number, string>();
  private loaded = new Map<number, number>();
  private run = new AbortController();
  private pumping: Promise<void> = Promise.resolve();
  private settle!: { resolve: (c: CompletedUpload) => void; reject: (e: unknown) => void };
  /** Resolves when processing has been queued. Rejects with `UploadCancelled` or the error that stopped it. */
  readonly done: Promise<CompletedUpload>;

  constructor(
    readonly file: File,
    readonly kind: UploadKind,
    private readonly opts: UploadOptions = {},
  ) {
    this.done = new Promise((resolve, reject) => {
      this.settle = { resolve, reject };
    });
    this.done.catch(() => {}); // callers may only watch `onChange`
    void this.begin();
  }

  get state(): UploadSnapshot {
    return this.snapshot;
  }

  private set(patch: Partial<UploadSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.opts.onChange?.(this.snapshot);
  }

  private fail(e: unknown) {
    if (this.snapshot.status === 'cancelled') return;
    this.set({ status: 'failed', error: e instanceof Error ? e.message : 'The upload failed.' });
    this.settle.reject(e);
  }

  private async begin() {
    try {
      const checksum = await this.opts.checksum?.(this.file).catch(() => undefined);
      if (this.snapshot.status === 'cancelled') return;
      const { data } = await api<StartedUpload>('/v1/admin/media/uploads', {
        method: 'POST',
        body: {
          kind: this.kind,
          mime: this.file.type || 'application/octet-stream',
          bytes: this.file.size,
          name: this.file.name,
          ...(checksum && { checksum }),
        },
      });
      if (this.snapshot.status === ('cancelled' as UploadStatus)) return void this.abandon(data.id);
      this.started = data;
      data.parts.forEach((p) => this.urls.set(p.partNumber, p.url));
      this.pending = data.parts.map((p) => p.partNumber);
      this.set({ status: 'uploading', mediaId: data.id, duplicateOf: data.duplicateOf });
      this.pumping = this.pump();
      await this.pumping;
    } catch (e) {
      this.fail(e);
    }
  }

  private report() {
    let sum = 0;
    this.loaded.forEach((n) => (sum += n));
    this.set({ progress: this.file.size ? Math.min(1, sum / this.file.size) : 1 });
  }

  /** New URLs for parts whose signature expired (the first ones live one hour). */
  private async presignAgain(partNumbers: number[]) {
    const { data } = await api<{ parts: Part[] }>(`/v1/admin/media/uploads/${this.started!.id}/parts`, {
      method: 'POST',
      body: { partNumbers },
    });
    data.parts.forEach((p) => this.urls.set(p.partNumber, p.url));
  }

  private async sendPart(n: number, signal: AbortSignal) {
    const { partSize } = this.started!;
    const body = this.file.slice((n - 1) * partSize, n * partSize);
    for (let attempt = 1; ; attempt++) {
      const r = await putPart(this.urls.get(n)!, body, (l) => (this.loaded.set(n, l), this.report()), signal);
      if (r.ok) {
        this.etags.set(n, r.etag);
        this.loaded.set(n, body.size);
        this.report();
        return;
      }
      this.loaded.set(n, 0);
      this.report();
      if (r.status === 403)
        await this.presignAgain([n]); // expired signature
      else if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429)
        throw new Error(`The storage refused part ${n} (${r.status}).`);
      if (attempt >= MAX_TRIES) throw new NetworkStall();
      await sleep(retryDelay.ms(attempt), signal);
    }
  }

  /** Send the pending parts, four at a time, then ask the API to assemble the file. */
  private async pump() {
    const signal = this.run.signal;
    const worker = async () => {
      for (;;) {
        const n = this.pending.shift();
        if (n === undefined) return;
        try {
          await this.sendPart(n, signal);
        } catch (e) {
          this.pending.unshift(n); // not sent: it goes back in the queue for the next resume
          this.loaded.set(n, 0);
          if (!isAbort(e)) this.run.abort(); // one part gave up: stop the others too, their parts return to the queue
          throw e;
        }
      }
    };
    // Wait for every worker to stop before deciding anything, so the queue is complete when resume() reads it.
    const results = await Promise.allSettled(Array.from({ length: Math.min(PARALLEL_PARTS, this.pending.length) }, worker));
    const errors = results.flatMap((r) => (r.status === 'rejected' ? [r.reason as unknown] : []));
    if (errors.length) {
      if (this.snapshot.status === 'cancelled') return;
      this.report();
      const cause = errors.find((e) => !isAbort(e));
      if (cause instanceof NetworkStall) return this.set({ status: 'paused', pausedBy: 'network' });
      if (!cause) return; // only aborts: pause() already set the state
      return this.fail(cause);
    }
    this.set({ status: 'completing', progress: 1 });
    try {
      const parts = [...this.etags].map(([partNumber, etag]) => ({ partNumber, etag }));
      const { data } = await api<CompletedUpload>(`/v1/admin/media/uploads/${this.started!.id}/complete`, {
        method: 'POST',
        body: { parts },
      });
      this.set({ status: 'done' });
      this.settle.resolve(data);
    } catch (e) {
      // The parts are all in S3. A network failure here can be retried with resume(); anything else is final.
      if (e instanceof ApiError && e.code === 'NETWORK') this.set({ status: 'paused', pausedBy: 'network' });
      else this.fail(e);
    }
  }

  /** Stop sending. Parts that already arrived are kept. */
  pause() {
    if (this.snapshot.status !== 'uploading') return;
    this.set({ status: 'paused', pausedBy: 'user' });
    this.run.abort();
  }

  /** Continue after pause() or after the network gave up. Only the missing parts are sent. */
  resume() {
    if (this.snapshot.status !== 'paused' || !this.started) return;
    this.set({ status: 'uploading', pausedBy: undefined });
    // The previous round may still be winding down (aborted requests returning their parts to the queue).
    this.pumping = this.pumping.then(() => {
      if (this.snapshot.status !== 'uploading') return;
      this.run = new AbortController();
      return this.pump();
    });
  }

  private async abandon(id: string) {
    await api(`/v1/admin/media/uploads/${id}`, { method: 'DELETE' }).catch(() => {}); // S3 drops unfinished uploads after 24 h anyway
  }

  /** Stop for good and remove what was uploaded. */
  cancel() {
    if (['done', 'cancelled', 'failed'].includes(this.snapshot.status)) return;
    const wasCompleting = this.snapshot.status === 'completing';
    this.set({ status: 'cancelled' });
    this.run.abort();
    if (this.started && !wasCompleting) void this.abandon(this.started.id);
    this.settle.reject(new UploadCancelled());
  }
}

/** A part failed five times in a row: treat it as "the connection is gone" and wait for the admin (or `online`). */
class NetworkStall extends Error {}
