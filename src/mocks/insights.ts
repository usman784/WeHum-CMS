import { http, HttpResponse } from 'msw';
import type { Funnel, Retention, Trends } from '../features/analytics/api';
import type { ConfigDoc } from '../features/config/useConfigForm';
import type { AuditEntry, LegalConfig, MainConfig, TeamMember } from '../features/settings/api';
import { session } from '../lib/session';
import { db } from './content';
import { body, fail, ok } from './overview';

/**
 * In-memory API for Analytics (02) and Settings (19: config, team, audit), for tests and `VITE_MOCKS=1 pnpm dev`.
 * `resetInsights()` puts the seed data back.
 */
const API = import.meta.env.VITE_API_URL as string;
const u = (path: string) => `${API}/v1/admin${path}`;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const role = () => session.admin?.role ?? '';
const is = (...roles: string[]) => roles.includes(role());
const denied = () => fail(403, 'FORBIDDEN', 'Your role cannot do this');
const versionOf = (h: string | null) => Number(h?.match(/\d+/)?.[0] ?? NaN);

export const insights = {
  main: null as unknown as ConfigDoc<MainConfig>,
  legal: null as unknown as ConfigDoc<LegalConfig>,
  team: [] as TeamMember[],
  audit: [] as AuditEntry[],
  calls: [] as { method: string; path: string; body?: unknown }[],
};

export function trendsFor(period: number): Trends {
  const perDay = Array.from({ length: period }, (_, i) => ({
    date: day(i - period + 1),
    solo: 2000 + ((i * 137) % 900),
    group: 300 + ((i * 53) % 200),
    minutes: 30000,
    activeUsers: 1200,
    newUsers: 40,
  }));
  return {
    period,
    from: perDay[0]!.date,
    to: perDay.at(-1)!.date,
    tz: 'UTC',
    kpis: {
      activeUsers: { value: 8940, previous: 8200, deltaPct: 9 },
      meditations: { value: 39900, previous: 35600, deltaPct: 12.1 },
      minutes: { value: 512000, previous: 478000, deltaPct: 7.1 },
      avgLengthMin: { value: 12.8, previous: 13.2, deltaPct: -3 },
      newPaying: { value: 171, previous: 141, deltaPct: 21.3 },
    },
    perDay,
    byTheme: [
      { theme: 'Sleep', minutes: 158000, share: 0.31 },
      { theme: 'Breathing', minutes: 112000, share: 0.22 },
      { theme: 'Other', minutes: 51000, share: 0.1 },
    ],
    countries: [
      { country: 'DE', members: 4210, share: 0.23 },
      { country: 'US', members: 3880, share: 0.21 },
      { country: 'Other', members: 6820, share: 0.37 },
    ],
    peakLive: 412,
  };
}
const funnel = (period: number): Funnel => ({
  period,
  from: day(-period + 1),
  to: day(0),
  steps: [
    { key: 'installed', count: 6420, share: 1 },
    { key: 'introDone', count: 5130, share: 0.8 },
    { key: 'firstMeditation', count: 4410, share: 0.69 },
    { key: 'continuedFree', count: 3940, share: 0.61 },
    { key: 'trialStarted', count: 920, share: 0.14 },
    { key: 'savedAccount', count: 2310, share: 0.36 },
    { key: 'paid', count: 300, share: 0.047 },
  ],
});
const retention: Retention = {
  retention: [
    { day: 1, cohort: 1000, retained: 580, rate: 0.58 },
    { day: 7, cohort: 900, retained: 306, rate: 0.34 },
    { day: 30, cohort: 800, retained: 152, rate: 0.19 },
  ],
  at: new Date().toISOString(),
};

export function resetInsights() {
  insights.main = {
    key: 'main',
    version: 2,
    updatedAt: null,
    value: {
      minVersion: { ios: '1.0.0', android: '1.0.0' },
      maintenance: false,
      features: { challenges: false, gratitude: false, breathwork: false, milestones: false, intent: true },
      supportEmail: 'support@wehum.app',
      defaultReminderTime: '07:00',
      languages: ['en'],
    },
  };
  insights.legal = {
    key: 'legal',
    version: 1,
    updatedAt: null,
    value: {
      privacyUrl: 'https://wehum.app/privacy',
      termsUrl: 'https://wehum.app/terms',
      healthDisclaimer: 'Not medical advice.',
      deleteInactiveGuestsMonths: 12,
    },
  };
  insights.team = [
    {
      id: 'admin-owner',
      email: 'raphael@wehum.app',
      name: 'Raphael Reiter',
      role: 'owner',
      status: 'active',
      mfaEnabled: true,
      lastSignInAt: new Date().toISOString(),
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'admin-admin',
      email: 'admin@wehum.app',
      name: 'Usman',
      role: 'admin',
      status: 'active',
      mfaEnabled: true,
      lastSignInAt: new Date().toISOString(),
      createdAt: '2026-01-02T00:00:00Z',
    },
    {
      id: 'admin-editor',
      email: 'lena@wehum.app',
      name: 'Lena Fischer',
      role: 'editor',
      status: 'active',
      mfaEnabled: false,
      lastSignInAt: '2026-09-29T10:00:00Z',
      createdAt: '2026-01-03T00:00:00Z',
    },
    {
      id: 'admin-invited',
      email: 'jonas@wehum.app',
      name: 'Jonas Weber',
      role: 'moderator',
      status: 'invited',
      mfaEnabled: false,
      lastSignInAt: null,
      createdAt: '2026-01-04T00:00:00Z',
    },
  ];
  insights.audit = [
    {
      id: 3,
      actorId: 'admin-owner',
      actorRole: 'owner',
      action: 'config.update',
      targetType: 'config',
      targetId: 'main',
      before: null,
      after: null,
      ip: null,
      requestId: null,
      at: new Date().toISOString(),
    },
    {
      id: 2,
      actorId: 'admin-editor',
      actorRole: 'editor',
      action: 'session.publish',
      targetType: 'session',
      targetId: 's1',
      before: null,
      after: null,
      ip: null,
      requestId: null,
      at: new Date(Date.now() - 3_600_000).toISOString(),
    },
    {
      id: 1,
      actorId: null,
      actorRole: null,
      action: 'notification.send',
      targetType: 'notification',
      targetId: 'n1',
      before: null,
      after: null,
      ip: null,
      requestId: null,
      at: new Date(Date.now() - 7_200_000).toISOString(),
    },
  ];
  insights.calls = [];
}
resetInsights();

const periodOf = (request: Request) => {
  const p = Number(new URL(request.url).searchParams.get('period') ?? 14);
  return [7, 14, 30, 90].includes(p) ? p : null;
};
const putConfig = (key: 'main' | 'legal') =>
  http.put(u(`/config/${key}`), async ({ request }) => {
    if (!is('owner', 'admin')) return denied();
    const doc = insights[key] as ConfigDoc<unknown>;
    if (versionOf(request.headers.get('if-match')) !== doc.version)
      return fail(409, 'CONFLICT_VERSION', 'Changed by someone else', { current: doc });
    const value = await body(request);
    const next = { ...doc, value, version: doc.version + 1, updatedAt: new Date().toISOString() };
    (insights as Record<string, unknown>)[key] = next;
    if (key === 'main') db.flags.challenges = !!(value as unknown as MainConfig).features?.challenges;
    insights.calls.push({ method: 'PUT', path: `/config/${key}`, body: value });
    return ok(next);
  });

export const insightsHandlers = [
  // ── analytics
  http.get(u('/analytics/funnel'), ({ request }) => {
    const p = periodOf(request);
    return p ? ok(funnel(p)) : fail(422, 'VALIDATION_FAILED', 'Period must be 7, 14, 30 or 90');
  }),
  http.get(u('/analytics/retention'), () => ok(retention)),
  http.get(u('/analytics/export'), () => new HttpResponse('date,meditations\n', { headers: { 'content-type': 'text/csv' } })),
  http.get(u('/analytics'), ({ request }) => {
    if (!is('owner', 'admin', 'editor')) return denied();
    const p = periodOf(request);
    return p ? ok(trendsFor(p)) : fail(422, 'VALIDATION_FAILED', 'Period must be 7, 14, 30 or 90');
  }),

  // ── settings
  // the Challenges screen reads its flag here too: `db.flags.challenges` (content mock) is the same switch
  http.get(u('/config'), () => {
    if (!is('owner', 'admin')) return denied();
    const main = {
      ...insights.main,
      value: { ...insights.main.value, features: { ...insights.main.value.features, challenges: db.flags.challenges } },
    };
    return ok({ main, legal: insights.legal });
  }),
  putConfig('main'),
  putConfig('legal'),
  http.get(u('/team'), () => (is('owner', 'admin') ? ok(insights.team) : denied())),
  http.post(u('/team/invite'), async ({ request }) => {
    const b = (await body(request)) as { email: string; name?: string; role: TeamMember['role'] };
    if (role() !== 'owner' && b.role === 'owner') return fail(403, 'FORBIDDEN', 'Only an owner can invite an owner');
    if (insights.team.some((m) => m.email === b.email)) return fail(409, 'ALREADY_EXISTS', 'This email is already on the team');
    const m: TeamMember = {
      id: `admin-${insights.team.length + 1}`,
      email: b.email,
      name: b.name ?? b.email.split('@')[0]!,
      role: b.role,
      status: 'invited',
      mfaEnabled: false,
      lastSignInAt: null,
      createdAt: new Date().toISOString(),
    };
    insights.team.push(m);
    insights.calls.push({ method: 'POST', path: '/team/invite', body: b });
    return ok(m, undefined, { status: 201 });
  }),
  http.patch(u('/team/:id'), async ({ params, request }) => {
    const m = insights.team.find((x) => x.id === params.id);
    if (!m) return fail(404, 'NOT_FOUND', 'Team member not found');
    const b = (await body(request)) as Partial<TeamMember>;
    if (
      m.role === 'owner' &&
      b.role &&
      b.role !== 'owner' &&
      insights.team.filter((x) => x.role === 'owner' && x.status === 'active').length === 1
    )
      return fail(422, 'INVALID_STATE', 'There must always be one active owner');
    Object.assign(m, b);
    insights.calls.push({ method: 'PATCH', path: `/team/${m.id}`, body: b });
    return ok(m);
  }),
  http.delete(u('/team/:id'), ({ params }) => {
    insights.team = insights.team.filter((x) => x.id !== params.id);
    insights.calls.push({ method: 'DELETE', path: `/team/${String(params.id)}` });
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(u('/audit'), ({ request }) => {
    if (!is('owner', 'admin')) return denied();
    const sp = new URL(request.url).searchParams;
    const rows = insights.audit.filter(
      (a) => (!sp.get('targetType') || a.targetType === sp.get('targetType')) && (!sp.get('actorId') || a.actorId === sp.get('actorId')),
    );
    return ok(rows, { nextCursor: null });
  }),
];
