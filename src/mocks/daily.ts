import { http, HttpResponse } from 'msw';
import type { ConfigDoc } from '../features/config/useConfigForm';
import type { DailyMessage, MessageBody } from '../features/daily/api';
import type { Group, GroupValue } from '../features/group/api';
import type { Sos, SosTile, SosValue } from '../features/sos/api';
import type { Length, MotdDay, TodayRules } from '../features/today/api';
import { todayUtc } from '../lib/tz';
import { db } from './content';

/**
 * In-memory API of the daily experience (Today screen, daily messages, SoS, group meditation) for tests and
 * `VITE_MOCKS=1 pnpm dev`. Same rules as the backend: past days are locked, `If-Match` against the version (version 0
 * means "create only"), a whole-document save for settings. `resetDaily()` puts the seed data back (relative to today).
 */
const API = import.meta.env.VITE_API_URL as string;
const u = (path: string) => `${API}/v1/admin${path}`;
const ok = <T>(data: T, init?: ResponseInit) => HttpResponse.json({ data }, init);
const fail = (status: number, code: string, message: string, details?: unknown) =>
  HttpResponse.json({ error: { code, message, details, traceId: 'trace-mock-1' } }, { status });
const body = async (request: Request) => ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
const now = () => new Date().toISOString();
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const ifMatch = (request: Request) => {
  const m = /v?(\d+)/.exec(request.headers.get('if-match') ?? '');
  return m ? Number(m[1]) : null;
};
const stale = (request: Request, row: { version: number }) => {
  const v = ifMatch(request);
  return v !== null && v !== row.version ? fail(409, 'CONFLICT_VERSION', 'Someone else changed this meanwhile', { current: row }) : null;
};

type MotdRow = {
  date: string;
  sessionId: string;
  groupStartUtc: string | null;
  groupLengthMin: Length | null;
  variants: Partial<Record<Length, string>>;
  version: number;
};

export const daily = {
  messages: [] as DailyMessage[],
  motd: [] as MotdRow[],
  rules: null as unknown as ConfigDoc<TodayRules>,
  group: null as unknown as ConfigDoc<GroupValue>,
  history: [] as Group['history'],
  sos: null as unknown as ConfigDoc<SosValue>,
  /** Session ids that are SoS tiles, in order. */
  tiles: [] as string[],
};

const message = (date: string, p: Partial<DailyMessage> & { title: string }): DailyMessage => ({
  type: 'audio', text: null, mediaId: null, imageMediaId: null, durationSec: 240, themeTag: null, status: 'draft', version: 1, updatedAt: now(), date, ...p,
}); // prettier-ignore

export function resetDaily() {
  const sessions = db.sessions;
  const ready = db.media.filter((m) => m.kind === 'audio' && m.status === 'ready');
  const pick = (i: number) => sessions[i % sessions.length]!.id;
  daily.messages = [
    message(day(-2), { title: 'Steadiness Under Modern Work Urgency', status: 'live', mediaId: ready[0]?.id ?? null, themeTag: 'Work' }),
    message(day(-1), { title: 'Quiet Power: Settling the Inner Rush', status: 'live', mediaId: ready[0]?.id ?? null, themeTag: 'Attention' }),
    message(day(0), { title: 'Releasing Cognitive Friction Before Work', status: 'live', mediaId: ready[0]?.id ?? null, themeTag: 'Attention' }),
    message(day(1), { title: 'Dissolving Defensiveness', status: 'scheduled', type: 'text', text: 'Notice what you protect.', themeTag: 'Rest' }),
    message(day(2), { title: 'End-of-Week Grounding', status: 'draft', mediaId: ready[1]?.id ?? null, themeTag: 'Pacing' }),
  ]; // prettier-ignore
  const full = (i: number): MotdRow['variants'] => ({
    10: ready[i % ready.length]!.id,
    30: ready[(i + 1) % ready.length]!.id,
    45: ready[(i + 2) % ready.length]!.id,
  });
  daily.motd = [
    { date: day(-1), sessionId: pick(0), groupStartUtc: null, groupLengthMin: null, variants: full(0), version: 1 },
    { date: day(0), sessionId: pick(1), groupStartUtc: null, groupLengthMin: null, variants: full(1), version: 1 },
    { date: day(1), sessionId: pick(2), groupStartUtc: null, groupLengthMin: null, variants: { 10: ready[0]!.id, 30: ready[1]!.id }, version: 1 }, // 45 missing
    { date: day(2), sessionId: pick(0), groupStartUtc: null, groupLengthMin: null, variants: full(2), version: 1 },
  ]; // prettier-ignore
  daily.rules = {
    key: 'today', version: 1, updatedAt: now(),
    value: { emptyRoomThreshold: 10, freeHomePick: 'random', showDailyMessage: false, sections: { progress: true, liveCounter: true, worldMap: true } },
  }; // prettier-ignore
  daily.group = {
    key: 'group',
    version: 1,
    updatedAt: now(),
    value: { startUtc: '16:00', lengthMin: 30, lobbyOpenMin: 15, reminderMin: 10 },
  };
  daily.history = [
    { date: day(-1), title: sessions[0]!.title, groupJoined: 486, soloCount: 1940, practicedToday: 2426 },
    { date: day(-2), title: sessions[2]!.title, groupJoined: 402, soloCount: 1610, practicedToday: 2012 },
    { date: day(-3), title: sessions[1]!.title, groupJoined: 377, soloCount: 1522, practicedToday: 1899 },
  ]; // prettier-ignore
  daily.sos = {
    key: 'sos', version: 1, updatedAt: now(),
    value: {
      title: 'How can I help?', subtitle: 'Short sessions for hard moments.',
      help: { title: 'Need more help?', body: 'You can contact us and book a personal session with Raphael.', bookingUrl: 'https://wehum.app/book', contactEmail: 'support@wehum.app' },
    },
  }; // prettier-ignore
  daily.tiles = db.sessions.filter((s) => s.isSos).map((s) => s.id);
}

const tileOf = (id: string, i: number): SosTile => {
  const s = db.sessions.find((x) => x.id === id)!;
  return {
    sessionId: s.id,
    title: s.title,
    feeling: s.sosFeeling ?? s.title,
    subtitle: s.sosSubtitle,
    durationSec: s.durationSec,
    status: s.status,
    order: i,
  };
};
const sosView = (): Sos => ({ ...daily.sos, tiles: daily.tiles.map(tileOf) });

const motdDay = (date: string): MotdDay => {
  const row = daily.motd.find((r) => r.date === date);
  if (!row) return { date, sessionId: null, variants: null, complete: false };
  const s = db.sessions.find((x) => x.id === row.sessionId)!;
  const variant = (len: Length) => {
    const id = row.variants[len];
    const m = id ? db.media.find((x) => x.id === id) : null;
    return m ? { mediaId: m.id, status: m.status, durationSec: m.durationSec } : null;
  };
  const variants = { 10: variant(10), 30: variant(30), 45: variant(45) };
  return {
    date, sessionId: row.sessionId, sessionTitle: s.title, sessionStatus: s.status, groupStartUtc: row.groupStartUtc, groupLengthMin: row.groupLengthMin,
    variants, complete: Object.values(variants).every((v) => v?.status === 'ready'), practicedToday: 0, version: row.version,
  }; // prettier-ignore
};
const past = (date: string) => date < todayUtc();
const locked = () => fail(422, 'INVALID_STATE', 'Past days can no longer be changed');

export const dailyHandlers = [
  // ───────────── daily messages
  http.get(u('/daily-messages'), ({ request }) => {
    const q = new URL(request.url).searchParams;
    const [from, to] = [q.get('from') ?? '0000-01-01', q.get('to') ?? '9999-12-31'];
    return ok(daily.messages.filter((m) => m.date >= from && m.date <= to).sort((a, b) => a.date.localeCompare(b.date)));
  }),
  http.put(u('/daily-messages/:date'), async ({ request, params }) => {
    const date = String(params.date);
    const b = (await body(request)) as unknown as MessageBody;
    const cur = daily.messages.find((m) => m.date === date);
    if (cur) {
      const v = ifMatch(request);
      if (v !== null && v !== cur.version) return fail(409, 'CONFLICT_VERSION', 'Someone else changed this meanwhile', { current: cur });
    }
    if (b.status === 'live' || b.status === 'scheduled') {
      if (b.type === 'text' && !b.text?.trim())
        return fail(400, 'VALIDATION_FAILED', 'A text message needs text', { fields: [{ path: 'text', message: 'Required' }] });
      if (b.type !== 'text' && !b.mediaId)
        return fail(400, 'VALIDATION_FAILED', 'Add the audio or video first', { fields: [{ path: 'mediaId', message: 'Required' }] });
    }
    const row: DailyMessage = { ...b, date, version: cur ? cur.version + 1 : 1, updatedAt: now() };
    daily.messages = [...daily.messages.filter((m) => m.date !== date), row];
    return ok(row);
  }),
  http.delete(u('/daily-messages/:date'), ({ params }) => {
    const had = daily.messages.some((m) => m.date === params.date);
    daily.messages = daily.messages.filter((m) => m.date !== params.date);
    return had ? new HttpResponse(null, { status: 204 }) : fail(404, 'NOT_FOUND', 'No message for this day');
  }),

  // ───────────── Today screen
  http.get(u('/motd'), ({ request }) => {
    const q = new URL(request.url).searchParams;
    const out: MotdDay[] = [];
    for (let d = q.get('from')!; d <= q.get('to')!; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10))
      out.push(motdDay(d));
    return ok(out);
  }),
  http.post(u('/motd/swap'), async ({ request }) => {
    const { a, b } = (await body(request)) as { a: string; b: string };
    if (past(a) || past(b)) return locked();
    const [ra, rb] = [daily.motd.find((r) => r.date === a), daily.motd.find((r) => r.date === b)];
    if (!ra || !rb) return fail(404, 'NOT_FOUND', 'Both days need a meditation to be swapped');
    const carry = ({ sessionId, groupStartUtc, groupLengthMin, variants }: MotdRow) => ({
      sessionId,
      groupStartUtc,
      groupLengthMin,
      variants,
    });
    const [ca, cb] = [carry(ra), carry(rb)];
    Object.assign(ra, cb, { version: ra.version + 1 });
    Object.assign(rb, ca, { version: rb.version + 1 });
    return ok([motdDay(a), motdDay(b)]);
  }),
  http.put(u('/motd/:date/variants/:len'), async ({ request, params }) => {
    const date = String(params.date);
    if (past(date)) return locked();
    const row = daily.motd.find((r) => r.date === date);
    if (!row) return fail(422, 'INVALID_STATE', 'Pick the meditation for this day first');
    const { mediaId } = (await body(request)) as { mediaId: string };
    if (db.media.find((m) => m.id === mediaId)?.status !== 'ready')
      return fail(409, 'MEDIA_NOT_READY', 'The file is still being processed');
    row.variants[Number(params.len) as Length] = mediaId;
    row.version += 1;
    return ok({ version: row.version });
  }),
  http.put(u('/motd/:date'), async ({ request, params }) => {
    const date = String(params.date);
    if (past(date)) return locked();
    const b = (await body(request)) as { sessionId: string; groupStartUtc?: string | null; groupLengthMin?: Length | null };
    const s = db.sessions.find((x) => x.id === b.sessionId);
    if (!s) return fail(404, 'NOT_FOUND', 'Meditation not found');
    if (s.status !== 'live' || s.isSos || s.type === 'youtube')
      return fail(422, 'INVALID_STATE', 'The meditation of the day must be a published, premium meditation');
    const cur = daily.motd.find((r) => r.date === date);
    if (cur) {
      const c = stale(request, cur);
      if (c) return c;
      Object.assign(cur, {
        sessionId: b.sessionId,
        groupStartUtc: b.groupStartUtc ?? null,
        groupLengthMin: b.groupLengthMin ?? null,
        version: cur.version + 1,
      });
      return ok({ version: cur.version });
    }
    daily.motd.push({
      date,
      sessionId: b.sessionId,
      groupStartUtc: b.groupStartUtc ?? null,
      groupLengthMin: b.groupLengthMin ?? null,
      variants: {},
      version: 1,
    });
    return ok({ version: 1 });
  }),
  http.get(u('/config/today'), () => ok(daily.rules)),
  http.put(u('/config/today'), async ({ request }) => {
    const c = stale(request, daily.rules);
    if (c) return c;
    daily.rules = {
      ...daily.rules,
      value: (await body(request)) as unknown as TodayRules,
      version: daily.rules.version + 1,
      updatedAt: now(),
    };
    return ok(daily.rules);
  }),

  // ───────────── group meditation
  http.get(u('/group'), () => ok({ ...daily.group, history: daily.history })),
  http.put(u('/group'), async ({ request }) => {
    const c = stale(request, daily.group);
    if (c) return c;
    const v = (await body(request)) as unknown as GroupValue;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.startUtc))
      return fail(400, 'VALIDATION_FAILED', 'Invalid input', { fields: [{ path: 'startUtc', message: 'Use HH:mm' }] });
    daily.group = { ...daily.group, value: v, version: daily.group.version + 1, updatedAt: now() };
    return ok(daily.group);
  }),

  // ───────────── SoS
  http.get(u('/sos'), () => ok(sosView())),
  http.put(u('/sos/order'), async ({ request }) => {
    const { ids } = (await body(request)) as { ids: string[] };
    if (ids.length > 8) return fail(400, 'VALIDATION_FAILED', 'At most 8 tiles');
    if (ids.some((id) => !db.sessions.some((s) => s.id === id))) return fail(404, 'NOT_FOUND', 'Unknown meditation in the list');
    daily.tiles = ids;
    db.sessions.forEach((s) => (s.isSos = ids.includes(s.id)));
    return ok(sosView());
  }),
  http.put(u('/sos'), async ({ request }) => {
    const c = stale(request, daily.sos);
    if (c) return c;
    daily.sos = { ...daily.sos, value: (await body(request)) as unknown as SosValue, version: daily.sos.version + 1, updatedAt: now() };
    return ok(daily.sos);
  }),
];

resetDaily();
