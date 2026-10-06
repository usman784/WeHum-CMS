import { http, HttpResponse } from 'msw';
import type { Challenge } from '../features/challenges/api';
import type { Media } from '../features/media/api';
import type { Program } from '../features/programs/api';
import type { Session, SessionDetail } from '../features/sessions/api';
import type { SoundBlock } from '../features/sounds/api';
import type { Teacher } from '../features/teachers/api';
import type { Theme } from '../features/themes/api';

/**
 * In-memory content API for tests and for `VITE_MOCKS=1 pnpm dev`. It follows the real rules that the screens
 * depend on: versions and `If-Match` → 409 with the current row, drafts only deletable, nothing publishes without
 * media, a theme in use needs `reassignTo`. `resetContent()` puts the seed data back.
 */
const API = import.meta.env.VITE_API_URL as string;
const u = (path: string) => `${API}/v1/admin${path}`;
export const S3 = 'http://s3.test';

const ok = <T>(data: T, meta?: object, init?: ResponseInit) => HttpResponse.json(meta ? { data, meta } : { data }, init);
const fail = (status: number, code: string, message: string, details?: unknown) =>
  HttpResponse.json({ error: { code, message, details, traceId: 'trace-mock-1' } }, { status });
const notFound = (what: string) => fail(404, 'NOT_FOUND', `${what} not found`);

let n = 0;
/** uuid-shaped ids, stable inside one test run. */
export const mockId = (prefix = 'a') => `${prefix}0000000-0000-7000-8000-${String((n += 1)).padStart(12, '0')}`;
const now = () => new Date().toISOString();

type Versioned = { id: string; version: number };
/** `If-Match: "v3"` against the row: a stale version answers 409 with the current row (spec §6.1). */
function conflict<T extends Versioned>(request: Request, row: T) {
  const m = /v?(\d+)/.exec(request.headers.get('if-match') ?? '');
  return m && Number(m[1]) !== row.version ? fail(409, 'CONFLICT_VERSION', 'Someone else changed this meanwhile', { current: row }) : null;
}

export const db = {
  themes: [] as Theme[],
  teachers: [] as Teacher[],
  sessions: [] as Session[],
  media: [] as Media[],
  blocks: [] as SoundBlock[],
  programs: [] as Program[],
  challenges: [] as Challenge[],
  /** Open uploads: media id → { parts expected, parts received }. */
  uploads: new Map<string, { partCount: number; received: Set<number> }>(),
  /** Feature flags of the `main` settings. */
  flags: { challenges: false },
};

const theme = (name: string, subtitle: string, iconKey: string, order: number): Theme => ({
  id: mockId('b'), slug: name.toLowerCase().replace(/\s+/g, '-'), name, subtitle, description: `${name}: ${subtitle.toLowerCase()}.`,
  iconKey, order, visible: true, version: 1, updatedAt: now(), sessionCount: 0, minDurationSec: null, maxDurationSec: null,
}); // prettier-ignore

const readyMedia = (kind: Media['kind'], name: string, durationSec: number | null, lufs: number | null = -16.1): Media => ({
  id: mockId('c'), kind, name, mime: kind === 'image' ? 'image/webp' : 'audio/mp4', bytes: 14 * 1024 * 1024, status: 'ready', error: null, durationSec,
  loudnessLufs: kind === 'image' ? null : lufs, width: kind === 'image' ? 1200 : null, height: kind === 'image' ? 1200 : null, blurhash: null,
  createdAt: now(), previewUrl: `https://cdn.test/${kind}/${encodeURIComponent(name)}`,
  job: { id: mockId('d'), status: 'done', progress: 100, result: { durationSec: durationSec ?? undefined, lufs, loudnessWarning: null, loop: { seamless: true, diffDb: 0.4 } }, error: null },
}); // prettier-ignore

function session(p: Partial<Session> & { title: string }): Session {
  return {
    id: mockId('e'), slug: p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: null, type: 'audio', access: 'premium', themeId: null, teacherId: null,
    tags: [], durationSec: 900, mediaId: null, youtubeId: null, coverMediaId: null, coverUrl: null, cover: null, downloadable: true, isSos: false, sosFeeling: null,
    sosSubtitle: null, status: 'draft', publishAt: null, plays: 0, completions: 0, version: 1, createdAt: now(), updatedAt: now(), updatedBy: null, ...p,
  }; // prettier-ignore
}

/** Counts shown on theme and teacher cards come from the meditations, like in the real API. */
function withCounts() {
  const live = db.sessions.filter((s) => s.status !== 'archived');
  return {
    themes: db.themes
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((t) => {
        const mine = live.filter((s) => s.themeId === t.id);
        return {
          ...t,
          sessionCount: mine.length,
          minDurationSec: mine.length ? Math.min(...mine.map((s) => s.durationSec)) : null,
          maxDurationSec: mine.length ? Math.max(...mine.map((s) => s.durationSec)) : null,
        };
      }),
    teachers: db.teachers
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({ ...t, sessionCount: live.filter((s) => s.teacherId === t.id).length })),
  };
}

const programView = (p: Program): Program => ({
  ...p,
  days: p.days.map((d) => {
    const s = db.sessions.find((x) => x.id === d.sessionId);
    return {
      ...d,
      session: s ? { id: s.id, title: s.title, durationSec: s.durationSec, status: s.status, type: s.type, themeId: s.themeId } : null,
    };
  }),
});

export function resetContent() {
  n = 0;
  db.uploads.clear();
  db.flags.challenges = false;
  db.themes = [
    theme('Transcendent', 'Go beyond thought', 'sun', 0),
    theme('Loving Kindness', 'Warmth for yourself and others', 'heart', 1),
    theme('Breathing', 'Calm through the breath', 'wind', 2),
    theme('Sleep', 'Let the day go', 'moon', 3),
  ];
  db.teachers = [
    {
      id: mockId('f'), name: 'Raphael Reiter', role: 'Head of Practice', specialty: 'Somatic breathwork', bio: 'Raphael has taught meditation for over ten years.',
      quote: 'Meditation without the incense.', photoMediaId: null, photoUrl: null, youtubeUrl: 'https://youtube.com/raphaelreiter',
      instagramUrl: 'https://instagram.com/raphael.meditates', websiteUrl: null, visible: true, canLeadGroup: true, version: 1, updatedAt: now(), sessionCount: 0,
    },
  ]; // prettier-ignore
  const [transcendent, kindness, breathing, sleep] = db.themes as [Theme, Theme, Theme, Theme];
  const raphael = db.teachers[0]!.id;
  const audio = readyMedia('audio', 'steady_under_pressure_final.wav', 900);
  const cover = readyMedia('image', 'ocean.jpg', null);
  db.media = [
    audio,
    cover,
    readyMedia('audio', 'arrival.wav', 120),
    readyMedia('audio', 'closing_words.wav', 118, -12.4),
    readyMedia('audio', 'rain_on_cedar.wav', 150),
  ];
  const withCover = { coverMediaId: cover.id, cover: { url: cover.previewUrl!, blurhash: null } };
  db.sessions = [
    session({ title: 'Steady Under Pressure', themeId: breathing.id, teacherId: raphael, mediaId: audio.id, ...withCover, status: 'live', publishAt: '2026-09-21T05:00:00.000Z', plays: 4120, tags: ['work stress', 'morning'] }),
    session({ title: 'Unconditional Love & Healing', type: 'youtube', access: 'free', youtubeId: 'Qm7r2XyK8aE', themeId: kindness.id, teacherId: raphael, durationSec: 2400, coverUrl: 'https://i.ytimg.com/vi/Qm7r2XyK8aE/hqdefault.jpg', cover: { url: 'https://i.ytimg.com/vi/Qm7r2XyK8aE/hqdefault.jpg', blurhash: null }, status: 'live', publishAt: '2026-09-18T05:00:00.000Z', plays: 3880, downloadable: false }),
    session({ title: 'Deep Delta Sleep Descent', themeId: sleep.id, teacherId: raphael, mediaId: audio.id, ...withCover, durationSec: 2700, status: 'live', publishAt: '2026-09-12T05:00:00.000Z', plays: 2960 }),
    session({ title: 'Panic', themeId: breathing.id, mediaId: audio.id, ...withCover, durationSec: 240, status: 'live', publishAt: '2026-08-30T05:00:00.000Z', plays: 1410, isSos: true, sosFeeling: 'Panic', sosSubtitle: 'Grounding in four minutes' }),
    session({ title: 'Vagus Nerve Reset', themeId: breathing.id, teacherId: raphael, mediaId: audio.id, ...withCover, status: 'scheduled', publishAt: '2030-10-09T05:00:00.000Z' }),
    session({ title: 'Open Awareness & Silence', themeId: transcendent.id, mediaId: audio.id, durationSec: 1080 }),
    session({ title: 'Anxiety', themeId: breathing.id, durationSec: 360, isSos: true, sosFeeling: 'Anxiety' }),
  ]; // prettier-ignore
  const block = (kind: SoundBlock['kind'], name: string, mediaIndex: number, order: number, p: Partial<SoundBlock> = {}): SoundBlock => {
    const m = db.media[mediaIndex]!;
    return { id: mockId('1'), kind, name, mediaId: m.id, durationSec: m.durationSec ?? 0, loopable: false, loudnessLufs: m.loudnessLufs?.toFixed(2) ?? null, access: 'premium', order, visible: true, version: 1, ...p }; // prettier-ignore
  };
  db.blocks = [
    block('opening', 'Arrival', 2, 0),
    block('opening', 'Body Settle', 2, 1),
    block('closing', 'Closing Words', 3, 0),
    block('sound', 'Rain on Cedar', 4, 0, { loopable: true }),
  ];
  db.programs = [
    {
      id: mockId('2'), slug: '7-day-autonomic-reset', title: '7-Day Autonomic Reset', description: 'A progressive nervous system down-regulation program.',
      access: 'premium', unlockRule: 'next_day_0700', status: 'live', version: 3, updatedAt: now(),
      days: [db.sessions[0]!, db.sessions[2]!].map((s, i) => ({ day: i + 1, sessionId: s.id, title: null, session: null })), kpis: { started: 1240, completed: 384 },
    },
    {
      id: mockId('2'), slug: '14-day-sleep-repair', title: '14-Day Sleep Repair', description: null, access: 'premium', unlockRule: 'immediate', status: 'draft',
      version: 1, updatedAt: now(), days: [], kpis: { started: 0, completed: 0 },
    },
  ]; // prettier-ignore
  db.challenges = [
    { id: mockId('3'), name: '7 days of calm', days: 7, counts: 'any', minMinutes: 3, membersOnly: true, showOnYou: true, startsAt: null, status: 'live', version: 2, createdAt: now(), participants: 1904, finished: 1180 },
    { id: mockId('3'), name: 'Sleep week', days: 7, counts: 'sleep', minMinutes: 3, membersOnly: true, showOnYou: true, startsAt: null, status: 'draft', version: 1, createdAt: now(), participants: 0, finished: 0 },
  ]; // prettier-ignore
}
resetContent();

type Json = Record<string, unknown>;
const body = async (request: Request) => ((await request.json().catch(() => ({}))) ?? {}) as Json;
const coverOf = (b: { coverMediaId: string | null; coverUrl: string | null }) => {
  const m = b.coverMediaId ? db.media.find((x) => x.id === b.coverMediaId) : null;
  const url = m?.previewUrl ?? b.coverUrl;
  return url ? { url, blurhash: null } : null;
};

/** Finish an upload's processing at once (tests call this instead of waiting for a worker). */
export function finishProcessing(mediaId: string, patch: Partial<Media> = {}) {
  const m = db.media.find((x) => x.id === mediaId);
  if (!m) return;
  Object.assign(m, {
    status: 'ready', durationSec: m.kind === 'image' ? null : 600, loudnessLufs: m.kind === 'image' ? null : -16.2, previewUrl: `https://cdn.test/${m.kind}/${m.id}`,
    width: m.kind === 'image' ? 1200 : null, height: m.kind === 'image' ? 1200 : null,
    job: { id: m.job?.id ?? mockId('d'), status: 'done', progress: 100, error: null, result: { durationSec: 600, lufs: -16.2, loudnessWarning: null, loop: { seamless: true, diffDb: 0.3 } } },
    ...patch,
  }); // prettier-ignore
}

export const contentHandlers = [
  // ───────────── themes
  http.get(u('/themes'), () => ok(withCounts().themes)),
  http.post(u('/themes'), async ({ request }) => {
    const b = await body(request);
    if (!String(b.name ?? '').trim())
      return fail(400, 'VALIDATION_FAILED', 'Invalid input', { fields: [{ path: 'name', message: 'Required' }] });
    const row = { ...theme(String(b.name), '', 'infinity', db.themes.length), ...b, id: mockId('b') } as Theme;
    db.themes.push(row);
    return ok(row, undefined, { status: 201 });
  }),
  http.put(u('/themes/order'), async ({ request }) => {
    const { ids } = (await body(request)) as { ids: string[] };
    if (ids.length !== db.themes.length) return fail(400, 'VALIDATION_FAILED', 'Send every theme id exactly once');
    db.themes.forEach((t) => (t.order = ids.indexOf(t.id)));
    return ok(withCounts().themes);
  }),
  http.patch(u('/themes/:id'), async ({ request, params }) => {
    const row = db.themes.find((t) => t.id === params.id);
    if (!row) return notFound('Theme');
    const stale = conflict(request, row);
    if (stale) return stale;
    Object.assign(row, await body(request), { version: row.version + 1, updatedAt: now() });
    return ok(row);
  }),
  http.delete(u('/themes/:id'), ({ request, params }) => {
    const row = db.themes.find((t) => t.id === params.id);
    if (!row) return notFound('Theme');
    const used = db.sessions.filter((s) => s.themeId === row.id);
    const to = new URL(request.url).searchParams.get('reassignTo');
    if (used.length && !to)
      return fail(409, 'IN_USE', `${used.length} meditations use this theme. Choose a theme to move them to.`, { sessions: used.length });
    used.forEach((s) => (s.themeId = to));
    db.themes = db.themes.filter((t) => t.id !== row.id);
    return new HttpResponse(null, { status: 204 });
  }),

  // ───────────── teachers
  http.get(u('/teachers'), () => ok(withCounts().teachers)),
  http.post(u('/teachers'), async ({ request }) => {
    const row = { ...db.teachers[0]!, ...(await body(request)), id: mockId('f'), version: 1, updatedAt: now(), sessionCount: 0 } as Teacher;
    db.teachers.push(row);
    return ok(row, undefined, { status: 201 });
  }),
  http.patch(u('/teachers/:id'), async ({ request, params }) => {
    const row = db.teachers.find((t) => t.id === params.id);
    if (!row) return notFound('Teacher');
    const stale = conflict(request, row);
    if (stale) return stale;
    Object.assign(row, await body(request), { version: row.version + 1, updatedAt: now() });
    return ok(row);
  }),

  // ───────────── sessions
  http.get(u('/sessions'), ({ request }) => {
    const q = new URL(request.url).searchParams;
    const tab = q.get('tab');
    const status = { published: 'live', drafts: 'draft', scheduled: 'scheduled', archived: 'archived' }[tab ?? ''];
    const text = q.get('q')?.toLowerCase();
    const all = db.sessions.filter(
      (s) =>
        (!status || s.status === status) &&
        (!q.get('access') || s.access === q.get('access')) &&
        (!q.get('sos') || s.isSos === (q.get('sos') === 'true')) &&
        (!q.get('theme') || s.themeId === q.get('theme')) &&
        (!q.get('teacher') || s.teacherId === q.get('teacher')) &&
        (!q.get('type') || s.type === q.get('type')) &&
        (!text || s.title.toLowerCase().includes(text) || s.tags.includes(text)),
    );
    const limit = Number(q.get('limit') ?? 30);
    const from = Number(q.get('cursor') ?? 0);
    const page = all.slice(from, from + limit);
    return ok(page, { nextCursor: from + limit < all.length ? String(from + limit) : null, total: all.length });
  }),
  http.post(u('/sessions'), async ({ request }) => {
    const b = await body(request);
    if (!String(b.title ?? '').trim())
      return fail(400, 'VALIDATION_FAILED', 'Invalid input', { fields: [{ path: 'title', message: 'Required' }] });
    const row = session({ ...(b as Partial<Session>), title: String(b.title) });
    row.cover = coverOf(row);
    if (!b.durationSec) row.durationSec = db.media.find((m) => m.id === row.mediaId)?.durationSec ?? 0;
    db.sessions.unshift(row);
    return ok(row, undefined, { status: 201 });
  }),
  http.post(u('/sessions/bulk'), async ({ request }) => {
    const { action, ids } = (await body(request)) as { action: 'publish' | 'archive'; ids: string[] };
    const results = ids.map((id) => {
      const s = db.sessions.find((x) => x.id === id)!;
      if (action === 'publish' && s.type !== 'youtube' && !s.mediaId)
        return { id, ok: false, error: { code: 'MEDIA_NOT_READY', message: 'Upload the audio or video first' } };
      s.status = action === 'publish' ? 'live' : 'archived';
      s.version += 1;
      return { id, ok: true };
    });
    return ok({ results, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
  }),
  http.get(u('/sessions/:id'), ({ params }) => {
    const s = db.sessions.find((x) => x.id === params.id);
    if (!s) return fail(404, 'NOT_FOUND', 'Meditation not found');
    const programs = db.programs.flatMap((p) =>
      p.days.filter((d) => d.sessionId === s.id).map((d) => ({ id: p.id, title: p.title, day: d.day })),
    );
    return ok({ ...s, usage: { motdDates: [], programs, dedications: 128 } } satisfies SessionDetail);
  }),
  http.patch(u('/sessions/:id'), async ({ request, params }) => {
    const row = db.sessions.find((s) => s.id === params.id);
    if (!row) return fail(404, 'NOT_FOUND', 'Meditation not found');
    const stale = conflict(request, row);
    if (stale) return stale;
    Object.assign(row, await body(request), { version: row.version + 1, updatedAt: now() });
    row.cover = coverOf(row);
    return ok(row);
  }),
  http.post(u('/sessions/:id/:verb'), async ({ request, params }) => {
    const row = db.sessions.find((s) => s.id === params.id);
    if (!row) return fail(404, 'NOT_FOUND', 'Meditation not found');
    const verb = params.verb as 'publish' | 'schedule' | 'archive' | 'duplicate';
    if (verb === 'duplicate') {
      const copy = session({
        ...row,
        id: undefined,
        title: `${row.title} (copy)`,
        status: 'draft',
        publishAt: null,
        plays: 0,
        isSos: false,
        version: 1,
      } as Partial<Session> & { title: string });
      db.sessions.unshift(copy);
      return ok(copy, undefined, { status: 201 });
    }
    const stale = conflict(request, row);
    if (stale) return stale;
    if (verb !== 'archive') {
      if (row.type === 'youtube' ? !row.youtubeId : !row.mediaId) return fail(422, 'MEDIA_NOT_READY', 'Upload the audio or video first');
      if (row.type !== 'youtube' && db.media.find((m) => m.id === row.mediaId)?.status !== 'ready')
        return fail(422, 'MEDIA_NOT_READY', 'This file is still being processed');
    }
    if (verb === 'publish') Object.assign(row, { status: 'live', publishAt: now() });
    if (verb === 'schedule') Object.assign(row, { status: 'scheduled', publishAt: String((await body(request)).publishAt) });
    if (verb === 'archive') Object.assign(row, { status: 'archived', isSos: false });
    row.version += 1;
    row.updatedAt = now();
    return ok(row);
  }),
  http.delete(u('/sessions/:id'), ({ params }) => {
    const row = db.sessions.find((s) => s.id === params.id);
    if (!row) return fail(404, 'NOT_FOUND', 'Meditation not found');
    if (row.status !== 'draft') return fail(422, 'INVALID_STATE', 'Only drafts can be deleted. Archive published meditations instead.');
    db.sessions = db.sessions.filter((s) => s.id !== row.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(u('/youtube/resolve'), async ({ request }) => {
    const url = String((await body(request)).url ?? '');
    const id = /(?:v=|youtu\.be\/)([\w-]{11})/.exec(url)?.[1];
    if (!id)
      return fail(400, 'VALIDATION_FAILED', 'That does not look like a YouTube link', {
        fields: [{ path: 'url', message: 'Not a YouTube link' }],
      });
    if (id.startsWith('private')) return fail(422, 'YOUTUBE_UNAVAILABLE', 'This video is private, removed or cannot be embedded');
    return ok({
      youtubeId: id,
      title: 'Guided Meditation for Unconditional Love & Healing',
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      durationSec: 2400,
    });
  }),

  // ───────────── media (uploads go to the fake S3 below)
  http.post(u('/media/uploads'), async ({ request }) => {
    const b = (await body(request)) as { kind: Media['kind']; mime: string; bytes: number; name: string; checksum?: string };
    const partSize = 10 * 1024 * 1024;
    const partCount = Math.max(1, Math.ceil(b.bytes / partSize));
    const id = mockId('c');
    db.media.push({
      id, kind: b.kind, name: b.name, mime: b.mime, bytes: b.bytes, status: 'uploading', error: null, durationSec: null, loudnessLufs: null, width: null, height: null,
      blurhash: null, createdAt: now(), previewUrl: null, job: null,
    }); // prettier-ignore
    db.uploads.set(id, { partCount, received: new Set() });
    const duplicate = b.checksum?.startsWith('dup') ? { id: db.media[0]!.id, name: db.media[0]!.name } : null;
    return ok(
      {
        id,
        uploadId: `up-${id}`,
        partSize,
        parts: Array.from({ length: partCount }, (_, i) => ({ partNumber: i + 1, url: `${S3}/${id}/${i + 1}` })),
        expiresAt: now(),
        duplicateOf: duplicate,
      },
      undefined,
      { status: 201 },
    );
  }),
  http.post(u('/media/uploads/:id/parts'), async ({ request, params }) => {
    const { partNumbers } = (await body(request)) as { partNumbers: number[] };
    return ok({
      id: params.id,
      parts: partNumbers.map((n) => ({ partNumber: n, url: `${S3}/${String(params.id)}/${n}?fresh=1` })),
      expiresAt: now(),
    });
  }),
  http.post(u('/media/uploads/:id/complete'), async ({ request, params }) => {
    const id = String(params.id);
    const up = db.uploads.get(id);
    const m = db.media.find((x) => x.id === id);
    if (!up || !m) return fail(404, 'NOT_FOUND', 'Upload not found');
    const { parts } = (await body(request)) as { parts: { partNumber: number; etag: string }[] };
    if (parts.length !== up.partCount) return fail(400, 'VALIDATION_FAILED', `Expected ${up.partCount} parts`);
    db.uploads.delete(id);
    m.status = 'processing';
    m.job = { id: mockId('d'), status: 'queued', progress: 0, result: null, error: null };
    return ok({ id, status: 'processing', jobId: m.job.id }, undefined, { status: 202 });
  }),
  http.delete(u('/media/uploads/:id'), ({ params }) => {
    db.uploads.delete(String(params.id));
    db.media = db.media.filter((m) => m.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(u('/media/:id'), ({ params }) => {
    const m = db.media.find((x) => x.id === params.id);
    return m ? ok(m) : fail(404, 'NOT_FOUND', 'Media not found');
  }),
  http.put(`${S3}/:id/:part`, ({ params }) => {
    db.uploads.get(String(params.id))?.received.add(Number(params.part));
    return new HttpResponse(null, { status: 200, headers: { etag: `"etag-${String(params.part)}"` } });
  }),

  // ───────────── sound blocks
  http.get(u('/sound-blocks'), () => ok(db.blocks.slice().sort((a, b) => a.kind.localeCompare(b.kind) || a.order - b.order))),
  http.post(u('/sound-blocks'), async ({ request }) => {
    const b = (await body(request)) as Partial<SoundBlock> & { mediaId: string; kind: SoundBlock['kind']; name: string };
    const m = db.media.find((x) => x.id === b.mediaId);
    if (m?.status !== 'ready') return fail(422, 'MEDIA_NOT_READY', 'This file is still being processed');
    const row: SoundBlock = {
      id: mockId('1'), kind: b.kind, name: b.name, mediaId: m.id, durationSec: m.durationSec ?? 0, loopable: !!b.loopable, loudnessLufs: m.loudnessLufs?.toFixed(2) ?? null,
      access: b.access ?? 'premium', order: db.blocks.filter((x) => x.kind === b.kind).length, visible: b.visible ?? true, version: 1,
    }; // prettier-ignore
    db.blocks.push(row);
    return ok(row, undefined, { status: 201 });
  }),
  http.put(u('/sound-blocks/order'), async ({ request }) => {
    const { ids } = (await body(request)) as { ids: string[] };
    ids.forEach((id, i) => {
      const b = db.blocks.find((x) => x.id === id);
      if (b) b.order = i;
    });
    return ok(db.blocks.slice().sort((a, b) => a.kind.localeCompare(b.kind) || a.order - b.order));
  }),
  http.patch(u('/sound-blocks/:id'), async ({ request, params }) => {
    const row = db.blocks.find((b) => b.id === params.id);
    if (!row) return notFound('Sound block');
    const stale = conflict(request, row);
    if (stale) return stale;
    Object.assign(row, await body(request), { version: row.version + 1 });
    return ok(row);
  }),

  // ───────────── programs
  http.get(u('/programs'), () => ok(db.programs.map(programView).sort((a, b) => a.title.localeCompare(b.title)))),
  http.post(u('/programs'), async ({ request }) => {
    const b = await body(request);
    const row: Program = {
      id: mockId('2'), slug: String(b.title).toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: String(b.title), description: null, access: 'premium',
      unlockRule: 'next_day_0700', status: 'draft', version: 1, updatedAt: now(), days: [], kpis: { started: 0, completed: 0 },
    }; // prettier-ignore
    db.programs.push(row);
    return ok(row, undefined, { status: 201 });
  }),
  http.patch(u('/programs/:id'), async ({ request, params }) => {
    const row = db.programs.find((p) => p.id === params.id);
    if (!row) return notFound('Program');
    const stale = conflict(request, row);
    if (stale) return stale;
    const b = await body(request);
    if (b.status === 'live' && !row.days.length) return fail(422, 'INVALID_STATE', 'Add at least one day before publishing the program');
    Object.assign(row, b, { version: row.version + 1, updatedAt: now() });
    return ok(programView(row));
  }),
  http.put(u('/programs/:id/days'), async ({ request, params }) => {
    const row = db.programs.find((p) => p.id === params.id);
    if (!row) return notFound('Program');
    const stale = conflict(request, row);
    if (stale) return stale;
    const { days } = (await body(request)) as { days: { day: number; sessionId: string; title: string | null }[] };
    if (!days.every((d, i) => d.day === i + 1)) return fail(400, 'VALIDATION_FAILED', 'Days must be numbered 1…n without gaps');
    row.days = days.map((d) => ({ ...d, title: d.title ?? null, session: null }));
    row.version += 1;
    return ok(programView(row));
  }),

  // ───────────── challenges + the feature flag
  http.get(u('/challenges'), () => ok(db.challenges)),
  http.post(u('/challenges'), async ({ request }) => {
    const row = {
      ...db.challenges[0]!,
      ...(await body(request)),
      id: mockId('3'),
      status: 'draft',
      version: 1,
      createdAt: now(),
      participants: 0,
      finished: 0,
    } as Challenge;
    db.challenges.unshift(row);
    return ok(row, undefined, { status: 201 });
  }),
  http.patch(u('/challenges/:id'), async ({ request, params }) => {
    const row = db.challenges.find((c) => c.id === params.id);
    if (!row) return notFound('Challenge');
    const stale = conflict(request, row);
    if (stale) return stale;
    Object.assign(row, await body(request), { version: row.version + 1 });
    return ok(row);
  }),
];
