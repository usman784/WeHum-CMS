import { http, HttpResponse } from 'msw';
import type { BreathPattern, BreathworkDoc, Milestone } from '../features/coming-soon/api';
import type { GratitudeKind, Post } from '../features/moderation/api';
import { session } from '../lib/session';
import { body, fail, ok } from './overview';

/**
 * In-memory API for the coming-soon parts (P9): gratitude moderation, breathing templates, breathwork lessons,
 * milestones. For tests and `VITE_MOCKS=1 pnpm dev`. `resetComingSoon()` puts the seed data back.
 */
const API = import.meta.env.VITE_API_URL as string;
const u = (path: string) => `${API}/v1/admin${path}`;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const is = (...roles: string[]) => roles.includes(session.admin?.role ?? '');
const denied = () => fail(403, 'FORBIDDEN', 'Your role cannot do this');
const versionOf = (h: string | null) => Number(h?.match(/\d+/)?.[0] ?? NaN);

type GratitudeRow = Omit<Post, 'sessionId' | 'sessionTitle' | 'holdingCount'> & { kind: GratitudeKind };

export const comingSoon = {
  gratitude: [] as GratitudeRow[],
  patterns: [] as BreathPattern[],
  lessons: null as unknown as BreathworkDoc,
  milestones: [] as Milestone[],
  calls: [] as { method: string; path: string; body?: unknown }[],
};

const g = (p: Partial<GratitudeRow> & Pick<GratitudeRow, 'id' | 'firstName' | 'text'>): GratitudeRow => ({
  kind: 'gratitude',
  userId: `user-${p.id}`,
  country: 'AT',
  status: 'flagged',
  autoFlags: [],
  reportCount: 0,
  reasons: [],
  crisis: false,
  userMuted: false,
  createdAt: ago(60),
  moderatedAt: null,
  ...p,
});
const pattern = (id: string, name: string, subtitle: string, beats: [number, number, number, number], sort: number, status: BreathPattern['status'] = 'live'): BreathPattern => ({
  id, name, subtitle, inhaleSec: beats[0], hold1Sec: beats[1], exhaleSec: beats[2], hold2Sec: beats[3], rounds: 10, sort, status, version: 1,
}); // prettier-ignore

export function resetComingSoon() {
  comingSoon.gratitude = [
    g({
      id: 'g1',
      firstName: 'Hannah',
      text: 'The first cold morning and a warm cup of tea.',
      reportCount: 3,
      reasons: ['spam'],
      status: 'hidden',
    }),
    g({ id: 'g2', firstName: 'Lukas', kind: 'affirmation', text: 'I am enough today.', autoFlags: ['profanity'] }),
  ];
  comingSoon.patterns = [
    pattern('bp1', 'Calming', 'Longer out-breath', [4, 7, 8, 0], 0),
    pattern('bp2', 'Focus', 'Box breathing', [4, 4, 4, 4], 1),
    pattern('bp3', 'Coherent', 'Five and five', [5, 0, 5, 0], 2, 'draft'),
  ];
  comingSoon.lessons = { key: 'breathwork', version: 1, updatedAt: null, value: { lessons: [] } };
  comingSoon.milestones = [
    { key: 'first', label: 'First meditation', badge: '1', metric: 'meditations', target: 1, reached: 4210 },
    { key: 'days7', label: '7 days meditated', badge: '7', metric: 'days', target: 7, reached: 1880 },
    { key: 'minutes1000', label: '1,000 minutes', badge: '1k', metric: 'minutes', target: 1000, reached: 1 },
  ];
  comingSoon.calls = [];
}
resetComingSoon();

const REVIEW = (p: GratitudeRow) => p.status === 'flagged' || (p.status === 'hidden' && !p.moderatedAt && p.reportCount > 0);
const decide = (id: string, action: 'hide' | 'keep') => {
  const p = comingSoon.gratitude.find((x) => x.id === id);
  if (!p) return null;
  p.status = action === 'hide' ? 'hidden' : 'visible';
  p.moderatedAt = new Date().toISOString();
  return p;
};
let seq = 10;

export const comingSoonHandlers = [
  http.get(u('/gratitude'), ({ request }) => {
    if (!is('owner', 'admin', 'moderator')) return denied();
    const sp = new URL(request.url).searchParams;
    const f = sp.get('filter') ?? 'review';
    const kind = sp.get('kind');
    const rows = comingSoon.gratitude
      .filter((p) =>
        f === 'review' ? REVIEW(p) : f === 'flagged' ? p.status === 'flagged' : f === 'hidden' ? p.status === 'hidden' : true,
      )
      .filter((p) => !kind || p.kind === kind);
    return ok(rows, { nextCursor: null, open: comingSoon.gratitude.filter(REVIEW).length });
  }),
  http.post(u('/gratitude/bulk'), async ({ request }) => {
    const b = (await body(request)) as { ids: string[]; action: 'hide' | 'keep' };
    comingSoon.calls.push({ method: 'POST', path: '/gratitude/bulk', body: b });
    return ok({ results: b.ids.map((id) => ({ id, ok: !!decide(id, b.action) })) });
  }),
  http.post(u('/gratitude/:id/:action'), ({ params }) => {
    if (!is('owner', 'admin', 'moderator')) return denied();
    const action = String(params.action) as 'hide' | 'keep';
    const p = decide(String(params.id), action);
    if (!p) return fail(404, 'NOT_FOUND', 'Post not found');
    comingSoon.calls.push({ method: 'POST', path: `/gratitude/${p.id}/${action}` });
    return ok({ id: p.id, status: p.status });
  }),

  http.get(u('/breath-patterns'), () => (is('owner', 'admin', 'editor') ? ok(comingSoon.patterns) : denied())),
  http.post(u('/breath-patterns'), async ({ request }) => {
    const b = (await body(request)) as Omit<BreathPattern, 'id' | 'status' | 'version'>;
    const row: BreathPattern = { ...b, id: `bp${++seq}`, status: 'draft', version: 1 };
    comingSoon.patterns.push(row);
    comingSoon.calls.push({ method: 'POST', path: '/breath-patterns', body: b });
    return ok(row, undefined, { status: 201 });
  }),
  http.patch(u('/breath-patterns/:id'), async ({ params, request }) => {
    const p = comingSoon.patterns.find((x) => x.id === params.id);
    if (!p) return fail(404, 'NOT_FOUND', 'Pattern not found');
    if (versionOf(request.headers.get('if-match')) !== p.version)
      return fail(409, 'CONFLICT_VERSION', 'Changed by someone else', { current: p });
    const b = await body(request);
    Object.assign(p, b, { version: p.version + 1 });
    comingSoon.calls.push({ method: 'PATCH', path: `/breath-patterns/${p.id}`, body: b });
    return ok(p);
  }),
  http.delete(u('/breath-patterns/:id'), ({ params }) => {
    if (!is('owner', 'admin')) return denied();
    comingSoon.patterns = comingSoon.patterns.filter((x) => x.id !== params.id);
    comingSoon.calls.push({ method: 'DELETE', path: `/breath-patterns/${String(params.id)}` });
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(u('/breathwork'), () => ok(comingSoon.lessons)),
  http.put(u('/breathwork'), async ({ request }) => {
    if (versionOf(request.headers.get('if-match')) !== comingSoon.lessons.version)
      return fail(409, 'CONFLICT_VERSION', 'Changed by someone else', { current: comingSoon.lessons });
    const value = (await body(request)) as { lessons: string[] };
    comingSoon.lessons = { ...comingSoon.lessons, value, version: comingSoon.lessons.version + 1 };
    comingSoon.calls.push({ method: 'PUT', path: '/breathwork', body: value });
    return ok(comingSoon.lessons);
  }),
  http.get(u('/milestones'), () => ok(comingSoon.milestones)),
];
