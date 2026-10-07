import { http, HttpResponse } from 'msw';
import type { Member, SubsEvent, SubsSummary } from '../features/subscriptions/api';
import type { Job, UserCounts, UserDetail, UserRow } from '../features/users/api';
import { session } from '../lib/session';
import { body, fail, ok } from './overview';

/**
 * In-memory API for Subscriptions (15), Users (16) and User detail (17), for tests and `VITE_MOCKS=1 pnpm dev`.
 * `resetAudience()` puts the seed data back. A job is done by its first `GET /jobs/:id`.
 */
const API = import.meta.env.VITE_API_URL as string;
const u = (path: string) => `${API}/v1/admin${path}`;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const MANAGERS = ['owner', 'admin'];
const CONTENT = ['owner', 'admin', 'editor'];
const MODERATION = ['owner', 'admin', 'moderator'];
const allowed = (roles: string[]) => !!session.admin && roles.includes(session.admin.role);
const denied = () => fail(403, 'FORBIDDEN', 'Your role cannot do this');

export const audience = {
  summary: null as unknown as SubsSummary,
  members: [] as Member[],
  events: [] as SubsEvent[],
  users: [] as UserRow[],
  details: new Map<string, UserDetail>(),
  jobs: new Map<string, Job & { result?: unknown }>(),
  /** Requests seen by the mock, for assertions. */
  calls: [] as { method: string; path: string; body?: unknown }[],
};

const seedUsers = (): UserRow[] => [
  {
    id: '0198a1b2-0000-7000-8000-000000000001',
    name: 'Marcus Vance',
    email: 'marcus.v@gmail.com',
    isGuest: false,
    providers: ['apple'],
    country: 'US',
    joinedAt: '2026-09-02T10:00:00Z',
    lastActiveAt: ago(2),
    muted: false,
    membership: { plan: 'founding', label: 'Annual · Founding', status: 'active' },
    weekMinutes: 95,
    meditations: 64,
  },
  {
    id: '0198a1b2-0000-7000-8000-000000000002',
    name: 'Elena K.',
    email: 'elena@gmail.com',
    isGuest: false,
    providers: ['google'],
    country: 'GB',
    joinedAt: '2026-08-14T10:00:00Z',
    lastActiveAt: ago(14),
    muted: false,
    membership: { plan: 'monthly', label: 'Monthly', status: 'active' },
    weekMinutes: 140,
    meditations: 112,
  },
  {
    id: '0198a1b2-0000-7000-8000-000000000003',
    name: 'Aiko T.',
    email: null,
    isGuest: true,
    providers: [],
    country: 'JP',
    joinedAt: '2026-09-27T10:00:00Z',
    lastActiveAt: ago(60),
    muted: false,
    membership: { plan: 'trial', label: 'Trial · day 4 of 7', status: 'trial' },
    weekMinutes: 40,
    meditations: 6,
  },
  {
    id: '0198a1b2-0000-7000-8000-000000000004',
    name: 'Sam R.',
    email: null,
    isGuest: true,
    providers: [],
    country: null,
    joinedAt: '2026-10-01T10:00:00Z',
    lastActiveAt: ago(300),
    muted: false,
    membership: { plan: 'free', label: 'Free · guest', status: 'free' },
    weekMinutes: 10,
    meditations: 1,
  },
];

function detailOf(r: UserRow): UserDetail {
  const member = r.membership.plan !== 'free';
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    isGuest: r.isGuest,
    country: r.country,
    timezone: 'America/New_York',
    joinedAt: r.joinedAt,
    lastActiveAt: r.lastActiveAt,
    muted: r.muted,
    providers: r.providers,
    accountSavedAt: r.isGuest ? null : '2026-09-05T10:00:00Z',
    wasGuestDays: r.isGuest ? null : 3,
    devices: [{ platform: 'ios', model: 'iPhone', appVersion: '1.0.0', lastSeenAt: r.lastActiveAt }],
    reminder: { enabled: true, time: '07:00', timezone: 'America/New_York', groupWarning: false, dailyMessagePush: true },
    stats: { weekDays: 5, weekMinutes: r.weekMinutes, meditations: r.meditations, minutes: 820, groupMeditations: 48, avgMinutes: 12.8 },
    recentMeditations: [
      { id: 'm1', session: 'Steady Under Pressure', kind: 'group', startedAt: ago(30), durationSec: 840 },
      { id: 'm2', session: 'Releasing Cognitive Friction', kind: 'motd', startedAt: ago(60 * 26), durationSec: 240 },
    ],
    dedications: [
      {
        id: 'd1',
        text: 'Dedicated to anyone navigating tough news today.',
        status: 'visible',
        holdingCount: 2300,
        createdAt: ago(90),
        session: 'Steady',
      },
    ],
    membership: {
      ...r.membership,
      productId: member ? (r.membership.plan === 'monthly' ? 'wehum_monthly' : 'wehum_annual_founding') : null,
      store: member ? 'app_store' : null,
      startedAt: member ? '2026-09-09T10:00:00Z' : null,
      expiresAt: member ? inDays(337) : null,
      willRenew: member,
      billingIssue: false,
      revenueCatId: r.id,
    },
  };
}

export function resetAudience() {
  audience.summary = {
    payingMembers: { total: 600, founding: 412, annual: 0, monthly: 188 },
    inTrial: 112,
    mrrUsd: 3904,
    trialToPaid: 0.46,
    trialsStarted30d: 140,
    cancelled: 18,
    paymentProblems: 2,
    founding: { taken: 412, cap: 1000, left: 588, open: true, closedAt: null, productId: 'wehum_annual_founding' },
    plans: [
      { productId: 'wehum_annual_founding', priceUsd: 59, trialDays: 7, active: 412 },
      { productId: 'wehum_annual', priceUsd: 79, trialDays: 7, active: 0 },
      { productId: 'wehum_monthly', priceUsd: 9.99, trialDays: 7, active: 188 },
    ],
  };
  audience.users = seedUsers();
  audience.details = new Map(audience.users.map((r) => [r.id, detailOf(r)]));
  audience.members = audience.users
    .filter((r) => r.membership.plan !== 'free')
    .map((r) => {
      const d = audience.details.get(r.id)!;
      return {
        userId: r.id,
        name: r.name,
        email: r.email,
        country: r.country,
        productId: d.membership.productId,
        periodType: r.membership.plan === 'trial' ? 'trial' : 'normal',
        store: 'app_store',
        active: true,
        startedAt: d.membership.startedAt,
        expiresAt: d.membership.expiresAt,
        willRenew: true,
        billingIssue: false,
        isFounding: r.membership.plan === 'founding',
      };
    });
  audience.events = [
    {
      id: 'e1',
      type: 'INITIAL_PURCHASE',
      userId: audience.users[2]!.id,
      name: 'Aiko T.',
      email: null,
      productId: 'wehum_annual_founding',
      periodType: 'trial',
      priceUsd: 0,
      eventAt: ago(12),
    },
    {
      id: 'e2',
      type: 'RENEWAL',
      userId: audience.users[1]!.id,
      name: 'Elena K.',
      email: 'elena@gmail.com',
      productId: 'wehum_monthly',
      periodType: 'normal',
      priceUsd: 9.99,
      eventAt: ago(60),
    },
    {
      id: 'e3',
      type: 'BILLING_ISSUE',
      userId: null,
      name: null,
      email: null,
      productId: 'wehum_monthly',
      periodType: 'normal',
      priceUsd: null,
      eventAt: ago(300),
    },
  ];
  audience.jobs.clear();
  audience.calls = [];
}
resetAudience();

const counts = (): UserCounts => ({
  all: audience.users.length,
  guests: audience.users.filter((x) => x.isGuest).length,
  accounts: audience.users.filter((x) => !x.isGuest).length,
  paying: audience.users.filter((x) => ['founding', 'annual', 'monthly'].includes(x.membership.plan)).length,
  trial: audience.users.filter((x) => x.membership.plan === 'trial').length,
});

const TAB_FILTER: Record<string, (r: UserRow) => boolean> = {
  all: () => true,
  guests: (r) => r.isGuest,
  free: (r) => !r.isGuest && r.membership.plan === 'free',
  trial: (r) => r.membership.plan === 'trial',
  annual: (r) => r.membership.plan === 'annual' || r.membership.plan === 'founding',
  monthly: (r) => r.membership.plan === 'monthly',
  cancelled: (r) => r.membership.plan === 'cancelled',
};

let jobSeq = 0;
function startJob(type: string, result: unknown) {
  const id = `00000000-0000-4000-8000-${String(++jobSeq).padStart(12, '0')}`;
  audience.jobs.set(id, { id, type, status: 'running', progress: 40, result });
  return id;
}

const csv = (name: string) =>
  new HttpResponse('id,name\n1,Test\n', {
    headers: { 'content-type': 'text/csv', 'content-disposition': `attachment; filename="${name}"` },
  });

export const audienceHandlers = [
  // ── subscriptions
  http.get(u('/subscriptions/summary'), () => (allowed(CONTENT) ? ok(audience.summary) : denied())),
  http.get(u('/subscriptions/members/export'), () => (allowed(MANAGERS) ? csv('wehum-members.csv') : denied())),
  http.get(u('/subscriptions/members'), ({ request }) => {
    if (!allowed(CONTENT)) return denied();
    const tab = new URL(request.url).searchParams.get('tab') ?? 'all';
    const rows = audience.members.filter((m) =>
      tab === 'all'
        ? true
        : tab === 'trial'
          ? m.periodType === 'trial'
          : tab === 'monthly'
            ? /monthly/.test(m.productId ?? '') && m.periodType !== 'trial'
            : tab === 'annual'
              ? !/monthly/.test(m.productId ?? '') && m.periodType !== 'trial'
              : tab === 'problem'
                ? m.billingIssue
                : !m.willRenew,
    );
    return ok(rows, { nextCursor: null });
  }),
  http.get(u('/subscriptions/events'), () => (allowed(CONTENT) ? ok(audience.events, { nextCursor: null }) : denied())),
  http.post(u('/offers/founding/close'), () => {
    if (!allowed(MANAGERS)) return denied();
    audience.calls.push({ method: 'POST', path: '/offers/founding/close' });
    if (!audience.summary.founding.open) return fail(422, 'INVALID_STATE', 'The Founding offer is already closed');
    audience.summary.founding = { ...audience.summary.founding, open: false, closedAt: new Date().toISOString() };
    return ok(audience.summary.founding);
  }),

  // ── users
  http.get(u('/users/export'), () => (allowed(MANAGERS) ? csv('wehum-users.csv') : denied())),
  http.get(u('/users'), ({ request }) => {
    if (!allowed(CONTENT)) return denied();
    const sp = new URL(request.url).searchParams;
    const q = (sp.get('q') ?? '').toLowerCase();
    const rows = audience.users
      .filter(TAB_FILTER[sp.get('tab') ?? 'all'] ?? (() => true))
      .filter((r) => !q || r.id === q || (r.name ?? '').toLowerCase().includes(q) || (r.email ?? '').toLowerCase().startsWith(q));
    return ok(rows, { nextCursor: null, counts: counts() });
  }),
  http.get(u('/users/:id'), ({ params }) => {
    if (!allowed(CONTENT)) return denied();
    const d = audience.details.get(String(params.id));
    return d ? ok(d) : fail(404, 'NOT_FOUND', 'User not found');
  }),
  http.post(u('/users/:id/export'), ({ params }) => {
    if (!allowed(MANAGERS)) return denied();
    const id = String(params.id);
    audience.calls.push({ method: 'POST', path: `/users/${id}/export` });
    const jobId = startJob('user_export', {
      json: 'https://cdn.test/export.json',
      csv: 'https://cdn.test/export.csv',
      meditations: 64,
      expiresInHours: 24,
    });
    return ok({ jobId }, undefined, { status: 202 });
  }),
  http.post(u('/users/:id/gift'), async ({ params, request }) => {
    if (!allowed(MANAGERS)) return denied();
    const b = await body(request);
    audience.calls.push({ method: 'POST', path: `/users/${String(params.id)}/gift`, body: b });
    return ok({ active: true, expiresAt: inDays(Number(b.days) || 30) });
  }),
  http.post(u('/users/:id/mute'), async ({ params, request }) => {
    if (!allowed(MODERATION)) return denied();
    const b = await body(request);
    const d = audience.details.get(String(params.id));
    if (d) d.muted = b.muted !== false;
    audience.calls.push({ method: 'POST', path: `/users/${String(params.id)}/mute`, body: b });
    return ok({ muted: b.muted !== false });
  }),
  http.delete(u('/users/:id'), async ({ params, request }) => {
    if (!allowed(MANAGERS)) return denied();
    const id = String(params.id);
    const d = audience.details.get(id);
    if (!d) return fail(404, 'NOT_FOUND', 'User not found');
    const b = await body(request);
    const expected = (d.email ?? d.id.slice(0, 8)).toLowerCase();
    if (
      String(b.confirm ?? '')
        .trim()
        .toLowerCase() !== expected
    )
      return fail(422, 'VALIDATION_FAILED', 'The confirmation does not match', {
        fields: [{ path: 'confirm', message: 'Type the email address to confirm' }],
      });
    audience.calls.push({ method: 'DELETE', path: `/users/${id}`, body: b });
    const jobId = startJob('user_delete', { deleted: true });
    audience.details.delete(id);
    audience.users = audience.users.filter((r) => r.id !== id);
    return ok({ jobId }, undefined, { status: 202 });
  }),
  http.get(u('/jobs/:id'), ({ params }) => {
    const j = audience.jobs.get(String(params.id));
    if (!j) return fail(404, 'NOT_FOUND', 'Job not found');
    const done = { ...j, status: 'done', progress: 100 }; // the worker is quick here: done by the first poll
    audience.jobs.set(j.id, done);
    return ok(done);
  }),
];
