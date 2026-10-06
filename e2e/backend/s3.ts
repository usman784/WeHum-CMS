import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { API, BACKEND_DIR, S3_ENDPOINT } from './harness';

/**
 * Browser uploads go straight to storage (spec §2.2). In production the bucket has CORS rules that allow the CMS origin
 * and expose the `ETag` header. The local MinIO has none, so the page's storage requests pass through here: the request
 * is made for real (against the real bucket), and only the CORS headers are added to the answer.
 *
 * `drop(partNumber, times)` makes the first `times` PUTs of that part fail like a lost connection.
 */
export type S3Control = { drop: (part: number, times: number) => void; puts: () => number[] };

export async function proxyS3(page: Page): Promise<S3Control> {
  const dropping = new Map<number, number>();
  const sent: number[] = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'ETag', 'access-control-allow-headers': '*' };
  await page.route(`${S3_ENDPOINT}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-methods': 'PUT,GET' } });
    const part = Number(new URL(req.url()).searchParams.get('partNumber') ?? 0);
    if (req.method() === 'PUT' && (dropping.get(part) ?? 0) > 0) {
      dropping.set(part, dropping.get(part)! - 1);
      return route.abort('connectionfailed');
    }
    const res = await route.fetch();
    if (req.method() === 'PUT') sent.push(part);
    return route.fulfill({ response: res, headers: { ...res.headers(), ...cors } });
  });
  return { drop: (part, times) => void dropping.set(part, times), puts: () => sent };
}

/** A real WAV file of a sine tone, made with the backend's own ffmpeg. `seconds` of 48 kHz mono 16-bit ≈ 96 KB per second. */
export function makeTone(name: string, seconds: number): string {
  const dir = resolve('test-results/fixtures');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, name);
  if (existsSync(file)) return file;
  const ffmpeg = execFileSync(process.execPath, ['-e', "console.log(require('ffmpeg-static'))"], {
    cwd: BACKEND_DIR,
    encoding: 'utf8',
  }).trim();
  execFileSync(ffmpeg, [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:sample_rate=48000:duration=${seconds}`,
    '-ac',
    '1',
    file,
  ]);
  return file;
}

/** The app side: what a member's phone would see in the catalog right now (a guest account, no CMS login). */
export async function appCatalog(request: import('@playwright/test').APIRequestContext) {
  const guest = await request.post(`${API}/v1/auth/guest`, {
    data: { installId: `e2e-${Math.random().toString(36).slice(2, 12)}`, platform: 'ios', appVersion: '1.0.0', timezone: 'UTC' },
  });
  const token = (await guest.json()).data.accessToken as string;
  const res = await request.get(`${API}/v1/catalog`, {
    headers: { Authorization: `Bearer ${token}`, 'x-platform': 'ios', 'x-app-version': '1.0.0' },
  });
  return (await res.json()).data as {
    sessions: { id: string; title: string; access: string; durationSec: number }[];
    themes: { id: string; name: string }[];
  };
}
