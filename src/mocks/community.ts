import { http } from 'msw';
import type { ConfigDoc } from '../features/config/useConfigForm';
import type { ModRules, ModStats, Post } from '../features/moderation/api';
import type { Announcement, AutoNotification } from '../features/notifications/api';
import { session } from '../lib/session';
import { body, fail, ok } from './overview';

/**
 * In-memory API for Moderation (14) and Push notifications (18), for tests and `VITE_MOCKS=1 pnpm dev`.
 * `resetCommunity()` puts the seed data back.
 */
const API = import.meta.env.VITE_API_URL as string;
const u = (path: string) => `${API}/v1/admin${path}`;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const role = () => session.admin?.role ?? '';
const is = (...roles: string[]) => roles.includes(role());
const denied = () => fail(403, 'FORBIDDEN', 'Your role cannot do this');
const versionOf = (h: string | null) => Number(h?.match(/\d+/)?.[0] ?? NaN);

export const community = {
  posts: [] as Post[],
  rules: null as unknown as ConfigDoc<ModRules>,
  announcements: [] as Announcement[],
  automatic: [] as AutoNotification[],
  audience: { targeted: 14820, quiet: 0 },
  calls: [] as { method: string; path: string; body?: unknown }[],
};

const post = (p: Partial<Post> & Pick<Post, 'id' | 'firstName' | 'text'>): Post => ({
  sessionId: 's1',
  sessionTitle: 'Steady Under Pressure',
  userId: `user-${p.id}`,
  country: 'GB',
  status: 'flagged',
  autoFlags: [],
  reportCount: 0,
  reasons: [],
  crisis: false,
  holdingCount: 0,
  userMuted: false,
  createdAt: ago(12),
  moderatedAt: null,
  ...p,
});

export function resetCommunity() {
  community.posts = [
    post({
      id: 'p4',
      firstName: 'Sam',
      text: 'For myself. I don’t know how much longer I can keep going like this.',
      autoFlags: ['crisis'],
      crisis: true,
      country: null,
      createdAt: ago(120),
    }),
    post({
      id: 'p1',
      firstName: 'Elena',
      text: 'For hospital night shift workers finding quiet before dawn.',
      reportCount: 2,
      reasons: ['spam'],
      status: 'hidden',
      createdAt: ago(12),
    }),
    post({
      id: 'p2',
      firstName: 'Marcus',
      text: 'Meditating for everyone at our office today.',
      autoFlags: ['profanity'],
      sessionId: 's2',
      sessionTitle: 'The Midday Coherence',
      country: 'CA',
      createdAt: ago(34),
    }),
    post({
      id: 'p3',
      firstName: 'Aiko',
      text: 'For my team before the product launch.',
      status: 'visible',
      country: 'JP',
      holdingCount: 2100,
      createdAt: ago(60),
    }),
  ];
  community.rules = {
    key: 'moderation',
    version: 3,
    updatedAt: ago(600),
    value: {
      dailyLimit: 3,
      autoHideReports: 3,
      blockLinks: true,
      profanity: true,
      crisisWords: ['end it', 'no way out'],
      muteAfterHides: 3,
    },
  };
  community.announcements = [
    {
      id: 'n1',
      title: 'New: 7-Day Autonomic Reset',
      body: 'Seven days, ten minutes.',
      audience: 'all',
      countries: [],
      deepLink: null,
      sendMode: 'now',
      sendAt: ago(60 * 24 * 16),
      status: 'sent',
      targeted: 14800,
      delivered: 14210,
      opened: 2558,
      failed: 3,
      createdAt: ago(60 * 24 * 16),
      version: 3,
    },
    {
      id: 'n2',
      title: 'Retreat in Vienna',
      body: 'Join us.',
      audience: 'country',
      countries: ['AT'],
      deepLink: null,
      sendMode: 'scheduled',
      sendAt: new Date(Date.now() + 86_400_000).toISOString(),
      status: 'scheduled',
      targeted: 320,
      delivered: 0,
      opened: 0,
      failed: 0,
      createdAt: ago(30),
      version: 2,
    },
    {
      id: 'n3',
      title: 'Draft idea',
      body: 'Not sure yet.',
      audience: 'members',
      countries: [],
      deepLink: 'wehum://today',
      sendMode: 'now',
      sendAt: null,
      status: 'draft',
      targeted: 0,
      delivered: 0,
      opened: 0,
      failed: 0,
      createdAt: ago(10),
      version: 1,
    },
  ];
  community.automatic = [
    { key: 'daily_message', enabled: true, title: 'Today’s message from Raphael', body: '{title}', delivered: 0, opened: 0 },
    { key: 'daily_nudge', enabled: true, title: 'WeHum', body: 'Time to meditate, {firstName}.', delivered: 1000, opened: 250 },
    {
      key: 'group_warning',
      enabled: true,
      title: 'Group meditation in 10 minutes',
      body: '{title} starts at {time}.',
      delivered: 0,
      opened: 0,
    },
    {
      key: 'trial_ending',
      enabled: true,
      title: 'Your trial ends in 2 days',
      body: 'Keep meditating with everyone.',
      delivered: 0,
      opened: 0,
    },
  ];
  community.audience = { targeted: 14820, quiet: 0 };
  community.calls = [];
}
resetCommunity();

const NEEDS_REVIEW = (p: Post) => p.status === 'flagged' || (p.status === 'hidden' && !p.moderatedAt && p.reportCount > 0);
const openCount = () => community.posts.filter(NEEDS_REVIEW).length;
const stats = (): ModStats => ({
  posts: 612,
  flagged: community.posts.filter((p) => p.autoFlags.length).length,
  hidden: 4,
  kept: 9,
  open: openCount(),
});
const decide = (id: string, action: 'hide' | 'keep') => {
  const p = community.posts.find((x) => x.id === id);
  if (!p) return null;
  p.status = action === 'hide' ? 'hidden' : 'visible';
  p.moderatedAt = new Date().toISOString();
  if (action === 'keep') p.autoFlags = [];
  return p;
};
let nSeq = 10;

export const communityHandlers = [
  // ── moderation
  http.get(u('/moderation/stats'), () => (is('owner', 'admin', 'moderator') ? ok(stats()) : denied())),
  http.get(u('/moderation/rules'), () => (is('owner', 'admin', 'moderator') ? ok(community.rules) : denied())),
  http.put(u('/moderation/rules'), async ({ request }) => {
    if (!is('owner', 'admin')) return denied();
    if (versionOf(request.headers.get('if-match')) !== community.rules.version)
      return fail(409, 'CONFLICT_VERSION', 'Changed by someone else', { current: community.rules });
    const value = (await body(request)) as unknown as ModRules;
    community.rules = { ...community.rules, value, version: community.rules.version + 1, updatedAt: new Date().toISOString() };
    community.calls.push({ method: 'PUT', path: '/moderation/rules', body: value });
    return ok(community.rules);
  }),
  http.post(u('/moderation/bulk'), async ({ request }) => {
    if (!is('owner', 'admin', 'moderator')) return denied();
    const b = (await body(request)) as { ids: string[]; action: 'hide' | 'keep' };
    community.calls.push({ method: 'POST', path: '/moderation/bulk', body: b });
    return ok({
      results: b.ids.map((id) =>
        decide(id, b.action) ? { id, ok: true, status: b.action === 'hide' ? 'hidden' : 'visible' } : { id, ok: false, error: 'Not found' },
      ),
    });
  }),
  http.post(u('/moderation/:id/:action'), ({ params }) => {
    if (!is('owner', 'admin', 'moderator')) return denied();
    const action = String(params.action) as 'hide' | 'keep';
    const p = decide(String(params.id), action);
    if (!p) return fail(404, 'NOT_FOUND', 'Dedication not found');
    community.calls.push({ method: 'POST', path: `/moderation/${p.id}/${action}` });
    return ok({ id: p.id, status: p.status, autoMuted: false });
  }),
  http.get(u('/moderation'), ({ request }) => {
    if (!is('owner', 'admin', 'moderator')) return denied();
    const sp = new URL(request.url).searchParams;
    const f = sp.get('filter') ?? 'review';
    const sessionId = sp.get('sessionId');
    const rows = community.posts
      .filter((p) =>
        f === 'review' ? NEEDS_REVIEW(p) : f === 'flagged' ? p.status === 'flagged' : f === 'hidden' ? p.status === 'hidden' : true,
      )
      .filter((p) => !sessionId || p.sessionId === sessionId)
      .sort((a, b) => Number(b.crisis) - Number(a.crisis) || b.createdAt.localeCompare(a.createdAt));
    return ok(rows, { nextCursor: null, open: openCount() });
  }),

  // ── push notifications
  http.get(u('/notifications/audience'), () =>
    is('owner', 'admin', 'editor') ? ok({ ...community.audience, quietHours: { start: '22:00', end: '07:00' } }) : denied(),
  ),
  http.get(u('/notifications/automatic'), () => (is('owner', 'admin', 'editor') ? ok(community.automatic) : denied())),
  http.patch(u('/notifications/automatic/:key'), async ({ params, request }) => {
    if (!is('owner', 'admin')) return denied();
    const a = community.automatic.find((x) => x.key === params.key);
    if (!a) return fail(404, 'NOT_FOUND', 'Unknown automatic notification');
    Object.assign(a, await body(request));
    community.calls.push({ method: 'PATCH', path: `/notifications/automatic/${a.key}`, body: { enabled: a.enabled } });
    return ok(a);
  }),
  http.get(u('/notifications'), () => (is('owner', 'admin', 'editor') ? ok(community.announcements) : denied())),
  http.post(u('/notifications'), async ({ request }) => {
    if (!is('owner', 'admin', 'editor')) return denied();
    const b = await body(request);
    const row = {
      ...(b as object),
      id: `n${++nSeq}`,
      status: 'draft',
      targeted: 0,
      delivered: 0,
      opened: 0,
      failed: 0,
      createdAt: new Date().toISOString(),
      version: 1,
    } as Announcement;
    community.announcements.unshift(row);
    community.calls.push({ method: 'POST', path: '/notifications', body: b });
    return ok(row, undefined, { status: 201 });
  }),
  http.patch(u('/notifications/:id'), async ({ params, request }) => {
    const n = community.announcements.find((x) => x.id === params.id);
    if (!n) return fail(404, 'NOT_FOUND', 'Notification not found');
    if (versionOf(request.headers.get('if-match')) !== n.version)
      return fail(409, 'CONFLICT_VERSION', 'Changed by someone else', { current: n });
    Object.assign(n, await body(request), { version: n.version + 1 });
    return ok(n);
  }),
  http.post(u('/notifications/:id/test'), async ({ params, request }) => {
    community.calls.push({ method: 'POST', path: `/notifications/${String(params.id)}/test`, body: await body(request) });
    return ok({ sent: true });
  }),
  http.post(u('/notifications/:id/send'), ({ params }) => {
    if (!is('owner', 'admin')) return denied();
    const n = community.announcements.find((x) => x.id === params.id);
    if (!n) return fail(404, 'NOT_FOUND', 'Notification not found');
    if (n.status !== 'draft') return fail(422, 'INVALID_STATE', 'Only a draft can be sent');
    Object.assign(n, {
      status: n.sendMode === 'scheduled' ? 'scheduled' : 'sending',
      targeted: community.audience.targeted,
      version: n.version + 1,
    });
    community.calls.push({ method: 'POST', path: `/notifications/${n.id}/send` });
    return ok({ ...n, quietCount: community.audience.quiet });
  }),
  http.post(u('/notifications/:id/cancel'), ({ params }) => {
    if (!is('owner', 'admin')) return denied();
    const n = community.announcements.find((x) => x.id === params.id);
    if (!n) return fail(404, 'NOT_FOUND', 'Notification not found');
    Object.assign(n, { status: 'cancelled', version: n.version + 1 });
    community.calls.push({ method: 'POST', path: `/notifications/${n.id}/cancel` });
    return ok(n);
  }),
];
