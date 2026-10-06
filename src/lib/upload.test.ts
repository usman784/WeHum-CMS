import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, S3 } from '../mocks/content';
import { fail, url } from '../mocks/handlers';
import { server } from '../mocks/server';
import { auth } from './api';
import { hashBlob } from './checksum-core';
import { PARALLEL_PARTS, retryDelay, Upload, UploadCancelled, type UploadSnapshot } from './upload';

const MB = 1024 * 1024;
/** A file of `mb` megabytes (parts are 10 MB, so 25 MB = 3 parts). */
const file = (mb: number, name = 'calm.wav', type = 'audio/wav') => new File([new Uint8Array(mb * MB)], name, { type });

function start(f: File, opts: { checksum?: (f: File) => Promise<string | undefined> } = {}) {
  const states: UploadSnapshot[] = [];
  const u = new Upload(f, 'audio', { ...opts, onChange: (s) => states.push(s) });
  const seen = () => states.map((s) => s.status).filter((s, i, a) => s !== a[i - 1]);
  return { u, states, seen };
}
const until = (u: Upload, status: UploadSnapshot['status']) => vi.waitFor(() => expect(u.state.status).toBe(status), { timeout: 4000 });

beforeEach(() => {
  auth.set('tok-1');
  retryDelay.ms = () => 5; // no real waiting between retries
});
afterEach(() => {
  retryDelay.ms = (n) => 1000 * 2 ** (n - 1);
});

describe('Upload', () => {
  it('sends every part to S3, then asks the API to assemble the file', async () => {
    const puts: string[] = [];
    let completed: unknown;
    server.use(
      http.put(`${S3}/:id/:part`, ({ params }) => {
        puts.push(String(params.part));
        return new HttpResponse(null, { status: 200, headers: { etag: `"e${String(params.part)}"` } });
      }),
      http.post(url('/v1/admin/media/uploads/:id/complete'), async ({ request, params }) => {
        completed = await request.json();
        return HttpResponse.json({ data: { id: params.id, status: 'processing', jobId: 'job-1' } }, { status: 202 });
      }),
    );
    const { u, seen } = start(file(25));
    const done = await u.done;
    expect(done).toMatchObject({ status: 'processing', jobId: 'job-1' });
    expect(puts.sort()).toEqual(['1', '2', '3']);
    expect(completed).toEqual({ parts: expect.arrayContaining([{ partNumber: 1, etag: '"e1"' }, { partNumber: 2, etag: '"e2"' }, { partNumber: 3, etag: '"e3"' }]) }); // prettier-ignore
    expect(seen()).toEqual(['uploading', 'completing', 'done']);
    expect(u.state.progress).toBe(1);
    expect(u.state.mediaId).toBe(done.id);
  });

  it('tells the API the kind, type, size and name, plus the checksum when there is one', async () => {
    let body: unknown;
    server.use(
      http.post(url('/v1/admin/media/uploads'), async ({ request }) => {
        body = await request.json();
        return fail(413, 'PAYLOAD_TOO_LARGE', 'audio files can be at most 500 MB');
      }),
    );
    const { u } = start(file(1, 'Rain.mp3', 'audio/mpeg'), { checksum: async () => 'abc123' });
    await expect(u.done).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(body).toEqual({ kind: 'audio', mime: 'audio/mpeg', bytes: MB, name: 'Rain.mp3', checksum: 'abc123' });
    expect(u.state).toMatchObject({ status: 'failed', error: 'audio files can be at most 500 MB' });
  });

  it('a failing checksum does not stop the upload', async () => {
    const { u } = start(file(1), {
      checksum: async () => {
        throw new Error('no wasm');
      },
    });
    await expect(u.done).resolves.toMatchObject({ status: 'processing' });
  });

  it('reports the duplicate the API found', async () => {
    const { u } = start(file(1), { checksum: async () => 'dup-of-something' });
    await u.done;
    expect(u.state.duplicateOf).toMatchObject({ id: db.media[0]!.id });
  });

  it(`never sends more than ${PARALLEL_PARTS} parts at the same time`, async () => {
    let active = 0;
    let peak = 0;
    server.use(
      http.put(`${S3}/:id/:part`, async ({ params }) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 15));
        active -= 1;
        return new HttpResponse(null, { status: 200, headers: { etag: `"e${String(params.part)}"` } });
      }),
    );
    const { u } = start(file(95)); // 10 parts
    await u.done;
    expect(peak).toBe(PARALLEL_PARTS);
  });

  it('a part that fails is sent again by itself; the others are not repeated', async () => {
    const tries = new Map<string, number>();
    server.use(
      http.put(`${S3}/:id/:part`, ({ params }) => {
        const p = String(params.part);
        tries.set(p, (tries.get(p) ?? 0) + 1);
        if (p === '2' && tries.get(p)! < 3)
          return p === '2' && tries.get(p) === 1 ? HttpResponse.error() : new HttpResponse(null, { status: 503 });
        return new HttpResponse(null, { status: 200, headers: { etag: `"e${p}"` } });
      }),
    );
    const { u } = start(file(25));
    await u.done;
    expect(Object.fromEntries(tries)).toEqual({ '1': 1, '2': 3, '3': 1 }); // network error, then 503, then fine
  });

  it('an expired part URL (403) gets a fresh one from the API and goes on', async () => {
    const asked: unknown[] = [];
    const used: string[] = [];
    server.use(
      http.put(`${S3}/:id/:part`, ({ request, params }) => {
        used.push(new URL(request.url).search);
        return request.url.includes('fresh=1')
          ? new HttpResponse(null, { status: 200, headers: { etag: `"e${String(params.part)}"` } })
          : new HttpResponse(null, { status: 403 });
      }),
      http.post(url('/v1/admin/media/uploads/:id/parts'), async ({ request, params }) => {
        const b = (await request.json()) as { partNumbers: number[] };
        asked.push(b);
        return HttpResponse.json({
          data: { parts: b.partNumbers.map((n) => ({ partNumber: n, url: `${S3}/${String(params.id)}/${n}?fresh=1` })) },
        });
      }),
    );
    const { u } = start(file(5));
    await u.done;
    expect(asked).toEqual([{ partNumbers: [1] }]);
    expect(used).toEqual(['', '?fresh=1']);
  });

  it('network gone: after 5 tries it pauses itself, keeps what arrived, and resume() sends only the rest', async () => {
    let online = true;
    const sent: string[] = [];
    server.use(
      http.put(`${S3}/:id/:part`, ({ params }) => {
        const p = String(params.part);
        if (!online && p !== '1') return HttpResponse.error();
        sent.push(p);
        return new HttpResponse(null, { status: 200, headers: { etag: `"e${p}"` } });
      }),
    );
    online = false;
    const { u } = start(file(25));
    await until(u, 'paused');
    expect(u.state.pausedBy).toBe('network');
    expect(sent).toEqual(['1']); // part 1 made it
    expect(u.state.progress).toBeCloseTo(10 / 25, 1);

    online = true;
    u.resume();
    await u.done;
    expect(sent.sort()).toEqual(['1', '2', '3']); // part 1 was not sent twice
    expect(u.state.status).toBe('done');
  });

  it('pause() stops sending and resume() finishes; nothing is lost in between', async () => {
    const sent: string[] = [];
    let release: (() => void) | null = null;
    server.use(
      http.put(`${S3}/:id/:part`, async ({ params }) => {
        if (String(params.part) !== '1' && !release) await new Promise<void>((r) => (release = r)); // hold the others until resumed
        sent.push(String(params.part));
        return new HttpResponse(null, { status: 200, headers: { etag: `"e${String(params.part)}"` } });
      }),
    );
    const { u, seen } = start(file(25));
    await vi.waitFor(() => expect(sent).toContain('1'));
    u.pause();
    expect(u.state).toMatchObject({ status: 'paused', pausedBy: 'user' });
    release = () => {}; // from now on parts go straight through
    u.resume();
    await u.done;
    expect([...new Set(sent)].sort()).toEqual(['1', '2', '3']);
    expect(seen()).toEqual(['uploading', 'paused', 'uploading', 'completing', 'done']);
  });

  it('cancel() stops, tells the API to drop the upload, and rejects with UploadCancelled', async () => {
    let deleted: string | null = null;
    server.use(
      http.put(`${S3}/:id/:part`, async () => {
        await new Promise((r) => setTimeout(r, 200));
        return new HttpResponse(null, { status: 200, headers: { etag: '"e"' } });
      }),
      http.delete(url('/v1/admin/media/uploads/:id'), ({ params }) => {
        deleted = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { u } = start(file(25));
    await until(u, 'uploading');
    const id = u.state.mediaId;
    u.cancel();
    await expect(u.done).rejects.toBeInstanceOf(UploadCancelled);
    await vi.waitFor(() => expect(deleted).toBe(id));
    expect(u.state.status).toBe('cancelled');
    u.resume(); // no effect after cancel
    expect(u.state.status).toBe('cancelled');
  });

  it('S3 refusing a part for a real reason (400) fails the upload with a clear message, without retrying', async () => {
    let tries = 0;
    server.use(
      http.put(`${S3}/:id/:part`, () => {
        tries += 1;
        return new HttpResponse(null, { status: 400 });
      }),
    );
    const { u } = start(file(5));
    await expect(u.done).rejects.toThrow('The storage refused part 1 (400).');
    expect(tries).toBe(1);
  });

  it('a 200 without a readable ETag points at the bucket CORS settings', async () => {
    server.use(http.put(`${S3}/:id/:part`, () => new HttpResponse(null, { status: 200 })));
    const { u } = start(file(5));
    await expect(u.done).rejects.toThrow(/ETag.*CORS/);
  });

  it('the API refusing to assemble the file is reported; a lost connection at that moment can be resumed', async () => {
    let answer: 'refuse' | 'offline' | 'ok' = 'refuse';
    server.use(
      http.post(url('/v1/admin/media/uploads/:id/complete'), ({ params }) => {
        if (answer === 'refuse') return fail(422, 'INVALID_STATE', 'The uploaded file is incomplete. Upload it again.');
        if (answer === 'offline') return HttpResponse.error();
        return HttpResponse.json({ data: { id: params.id, status: 'processing', jobId: 'j' } }, { status: 202 });
      }),
    );
    const a = start(file(5)).u;
    await expect(a.done).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(a.state.error).toBe('The uploaded file is incomplete. Upload it again.');

    answer = 'offline';
    const b = start(file(5)).u;
    await until(b, 'paused');
    answer = 'ok';
    b.resume();
    await expect(b.done).resolves.toMatchObject({ status: 'processing' });
  });
});

describe('checksum', () => {
  it('SHA-256 of a file, read in slices, matches the known digest', async () => {
    expect(await hashBlob(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await hashBlob(new Blob([]))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
