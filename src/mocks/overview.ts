import { http, HttpResponse } from 'msw';
import type { Dashboard, DashboardSlim } from '../features/dashboard/api';
import { session } from '../lib/session';

/**
 * In-memory API for the overview screens (dashboard, analytics, subscriptions, users, moderation, push, settings),
 * for tests and `VITE_MOCKS=1 pnpm dev`. `resetOverview()` puts the seed data back.
 */
const API = import.meta.env.VITE_API_URL as string;
const u = (path: string) => `${API}/v1/admin${path}`;
export const ok = <T>(data: T, meta?: object, init?: ResponseInit) => HttpResponse.json(meta ? { data, meta } : { data }, init);
export const fail = (status: number, code: string, message: string, details?: unknown) =>
  HttpResponse.json({ error: { code, message, details, traceId: 'trace-mock-1' } }, { status });
export const body = async (request: Request) => ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export const overview = {
  dashboard: null as unknown as Dashboard,
};

export function resetOverview() {
  const monday = (() => {
    const d = new Date();
    const dow = (d.getUTCDay() + 6) % 7;
    return -dow;
  })();
  overview.dashboard = {
    at: Date.now(),
    kpis: {
      liveNow: 214,
      liveCountries: 3,
      meditationsToday: 3180,
      meditationsLastWeekSameDay: 2840,
      meditationsDeltaPct: 12,
      payingMembers: 600,
      inTrial: 112,
      mrrUsd: 3904,
      library: { sessions: 142, programs: 4, themes: 8 },
    },
    moderationOpen: 7,
    dailyMessages: Array.from({ length: 7 }, (_, i) => {
      const status = (['live', 'live', 'live', 'scheduled', 'draft', 'missing', 'missing'] as const)[i]!;
      return {
        date: day(monday + i),
        title: status === 'missing' ? null : `Message ${i + 1}`,
        type: status === 'missing' ? null : ((i % 2 ? 'audio' : 'video') as 'audio' | 'video'),
        status,
      };
    }),
    topSessions: [
      { id: 's1', title: 'Steady Under Pressure', theme: 'Breathing', plays: 4120, completion: 0.82 },
      { id: 's2', title: 'Reset Your Nervous System', theme: 'Short Resets', plays: 3880, completion: 0.91 },
    ],
    needsAttention: [
      { kind: 'reported_dedications', count: 7 },
      { kind: 'missing_daily_message', date: day(2) },
      { kind: 'motd_missing_variant', date: day(1), title: 'Cadence Synchronization', lengths: [45] },
      { kind: 'founding', taken: 412, cap: 1000 },
    ],
    nextGroup: {
      startsAt: new Date(Date.now() + 3 * 3_600_000).toISOString(),
      title: 'The Midday Coherence',
      lengthMin: 30,
      state: 'scheduled',
      waiting: 0,
    },
  };
}
resetOverview();

export const overviewHandlers = [
  http.get(u('/dashboard'), () => {
    if (session.admin?.role === 'moderator') {
      const d = overview.dashboard;
      const slim: DashboardSlim = {
        at: d.at,
        moderationOpen: d.moderationOpen,
        needsAttention: d.needsAttention.filter((a) => a.kind === 'reported_dedications'),
      };
      return ok(slim);
    }
    return ok(overview.dashboard);
  }),
];
