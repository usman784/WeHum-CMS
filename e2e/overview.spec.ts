import { expect, test } from '@playwright/test';
import { bodyBackground, seriousViolations } from './axe';
import { openAs } from './session';

// Look and accessibility of the overview screens (dashboard first; analytics, subscriptions, users, moderation, push and
// settings join as they are built), in a real browser with the API answered by fixtures.

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const dashboard = {
  at: Date.now(),
  kpis: { liveNow: 214, liveCountries: 3, meditationsToday: 3180, meditationsLastWeekSameDay: 2840, meditationsDeltaPct: 12, payingMembers: 600, inTrial: 112, mrrUsd: 3904, library: { sessions: 142, programs: 4, themes: 8 } },
  moderationOpen: 7,
  dailyMessages: Array.from({ length: 7 }, (_, i) => ({ date: day(i - 3), title: i < 5 ? `Message ${i + 1}` : null, type: i < 5 ? 'audio' : null, status: (['live', 'live', 'live', 'scheduled', 'draft', 'missing', 'missing'] as const)[i] })),
  topSessions: [{ id: 's1', title: 'Steady Under Pressure', theme: 'Breathing', plays: 4120, completion: 0.82 }, { id: 's2', title: 'Reset Your Nervous System', theme: 'Short Resets', plays: 3880, completion: 0.91 }],
  needsAttention: [{ kind: 'reported_dedications', count: 7 }, { kind: 'missing_daily_message', date: day(2) }, { kind: 'motd_missing_variant', date: day(1), title: 'Cadence', lengths: [45] }, { kind: 'founding', taken: 412, cap: 1000 }],
  nextGroup: { startsAt: new Date(Date.now() + 3 * 3_600_000).toISOString(), title: 'The Midday Coherence', lengthMin: 30, state: 'scheduled', waiting: 0 },
}; // prettier-ignore

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const summary = {
  payingMembers: { total: 600, founding: 412, annual: 0, monthly: 188 }, inTrial: 112, mrrUsd: 3904, trialToPaid: 0.46, trialsStarted30d: 140, cancelled: 18, paymentProblems: 2,
  founding: { taken: 412, cap: 1000, left: 588, open: true, closedAt: null, productId: 'wehum_annual_founding' },
  plans: [{ productId: 'wehum_annual_founding', priceUsd: 59, trialDays: 7, active: 412 }, { productId: 'wehum_annual', priceUsd: 79, trialDays: 7, active: 0 }, { productId: 'wehum_monthly', priceUsd: 9.99, trialDays: 7, active: 188 }],
}; // prettier-ignore
const U1 = '0198a1b2-0000-7000-8000-000000000001';
const users = [
  { id: U1, name: 'Marcus Vance', email: 'marcus.v@gmail.com', isGuest: false, providers: ['apple'], country: 'US', joinedAt: '2026-09-02T10:00:00Z', lastActiveAt: ago(2), muted: false, membership: { plan: 'founding', label: 'Annual · Founding', status: 'active' }, weekMinutes: 95, meditations: 64 },
  { id: '0198a1b2-0000-7000-8000-000000000003', name: 'Aiko T.', email: null, isGuest: true, providers: [], country: 'JP', joinedAt: '2026-09-27T10:00:00Z', lastActiveAt: ago(60), muted: false, membership: { plan: 'trial', label: 'Trial · day 4 of 7', status: 'trial' }, weekMinutes: 40, meditations: 6 },
  { id: '0198a1b2-0000-7000-8000-000000000004', name: 'Sam R.', email: null, isGuest: true, providers: [], country: null, joinedAt: '2026-10-01T10:00:00Z', lastActiveAt: ago(300), muted: false, membership: { plan: 'free', label: 'Free · guest', status: 'free' }, weekMinutes: 10, meditations: 1 },
]; // prettier-ignore
const members = [
  { userId: U1, name: 'Marcus Vance', email: 'marcus.v@gmail.com', country: 'US', productId: 'wehum_annual_founding', periodType: 'normal', store: 'app_store', active: true, startedAt: ago(40000), expiresAt: ago(-400000), willRenew: true, billingIssue: false, isFounding: true },
  { userId: 'u2', name: 'Lukas B.', email: null, country: 'DE', productId: 'wehum_monthly', periodType: 'normal', store: 'play_store', active: true, startedAt: ago(40000), expiresAt: ago(-20000), willRenew: true, billingIssue: true, isFounding: false },
]; // prettier-ignore
const events = [
  { id: 'e1', type: 'INITIAL_PURCHASE', userId: 'x', name: 'Priya N.', email: null, productId: 'wehum_annual_founding', periodType: 'trial', priceUsd: 0, eventAt: ago(12) },
  { id: 'e2', type: 'BILLING_ISSUE', userId: 'u2', name: 'Lukas B.', email: null, productId: 'wehum_monthly', periodType: 'normal', priceUsd: null, eventAt: ago(300) },
]; // prettier-ignore
const detail = {
  ...users[0], timezone: 'America/New_York', accountSavedAt: '2026-09-05T10:00:00Z', wasGuestDays: 3, devices: [{ platform: 'ios', model: 'iPhone', appVersion: '1.0.0', lastSeenAt: ago(2) }],
  reminder: { enabled: true, time: '07:00', timezone: 'America/New_York', groupWarning: false, dailyMessagePush: true },
  stats: { weekDays: 5, weekMinutes: 105, meditations: 64, minutes: 820, groupMeditations: 48, avgMinutes: 12.8 },
  recentMeditations: [{ id: 'm1', session: 'Steady Under Pressure', kind: 'group', startedAt: ago(30), durationSec: 840 }],
  dedications: [{ id: 'd1', text: 'For my brother before his exam.', status: 'visible', holdingCount: 140, createdAt: ago(900), session: 'Steady' }],
  membership: { plan: 'founding', label: 'Annual · Founding', status: 'active', productId: 'wehum_annual_founding', store: 'app_store', startedAt: ago(40000), expiresAt: ago(-400000), willRenew: true, billingIssue: false, revenueCatId: U1 },
}; // prettier-ignore

const posts = [
  { id: 'p4', sessionId: 's1', sessionTitle: 'Pre-Competition Dial-In', userId: 'u4', firstName: 'Sam', country: null, text: 'For myself. I don’t know how much longer I can keep going like this.', status: 'flagged', autoFlags: ['crisis'], reportCount: 0, reasons: [], crisis: true, holdingCount: 0, userMuted: false, createdAt: ago(120), moderatedAt: null },
  { id: 'p1', sessionId: 's2', sessionTitle: 'Steady Under Pressure', userId: 'u1', firstName: 'Elena', country: 'GB', text: 'For hospital night shift workers finding quiet before dawn.', status: 'hidden', autoFlags: [], reportCount: 2, reasons: ['spam'], crisis: false, holdingCount: 12, userMuted: false, createdAt: ago(12), moderatedAt: null },
]; // prettier-ignore
const rules = {
  key: 'moderation',
  version: 3,
  updatedAt: ago(600),
  value: { dailyLimit: 3, autoHideReports: 3, blockLinks: true, profanity: true, crisisWords: ['end it'], muteAfterHides: 3 },
};
const announcements = [
  { id: 'n1', title: 'New: 7-Day Autonomic Reset', body: 'Seven days.', audience: 'all', countries: [], deepLink: null, sendMode: 'now', sendAt: ago(20000), status: 'sent', targeted: 14800, delivered: 14210, opened: 2558, failed: 3, createdAt: ago(20000), version: 3 },
  { id: 'n3', title: 'Draft idea', body: 'Not sure yet.', audience: 'members', countries: [], deepLink: null, sendMode: 'now', sendAt: null, status: 'draft', targeted: 0, delivered: 0, opened: 0, failed: 0, createdAt: ago(10), version: 1 },
]; // prettier-ignore
const automatic = [
  { key: 'daily_nudge', enabled: true, title: 'WeHum', body: 'Time to meditate, {firstName}.', delivered: 1000, opened: 250 },
  { key: 'trial_ending', enabled: true, title: 'Your trial ends in 2 days', body: 'Keep meditating with everyone.', delivered: 0, opened: 0 },
]; // prettier-ignore

const perDay = Array.from({ length: 14 }, (_, i) => ({
  date: day(i - 13),
  solo: 2000 + ((i * 137) % 900),
  group: 300 + ((i * 53) % 200),
  minutes: 30000,
  activeUsers: 1200,
  newUsers: 40,
}));
const k = (value: number, previous: number) => ({ value, previous, deltaPct: Math.round(((value - previous) / previous) * 1000) / 10 });
const trends = {
  period: 14, from: perDay[0]!.date, to: perDay.at(-1)!.date, tz: 'UTC', peakLive: 412, perDay,
  kpis: { activeUsers: k(8940, 8200), meditations: k(39900, 35600), minutes: k(512000, 478000), avgLengthMin: k(12.8, 13.2), newPaying: k(171, 141) },
  byTheme: [{ theme: 'Sleep', minutes: 158000, share: 0.31 }, { theme: 'Breathing', minutes: 112000, share: 0.22 }],
  countries: [{ country: 'DE', members: 4210, share: 0.23 }, { country: 'US', members: 3880, share: 0.21 }],
}; // prettier-ignore
const funnel = { period: 14, from: perDay[0]!.date, to: perDay.at(-1)!.date, steps: [['installed', 6420, 1], ['introDone', 5130, 0.8], ['firstMeditation', 4410, 0.69], ['continuedFree', 3940, 0.61], ['trialStarted', 920, 0.14], ['savedAccount', 2310, 0.36], ['paid', 300, 0.047]].map(([key, count, share]) => ({ key, count, share })) }; // prettier-ignore
const retention = { retention: [{ day: 1, cohort: 1000, retained: 580, rate: 0.58 }, { day: 7, cohort: 900, retained: 306, rate: 0.34 }, { day: 30, cohort: 800, retained: 152, rate: 0.19 }], at: ago(0) }; // prettier-ignore
const config = {
  main: { key: 'main', version: 2, updatedAt: null, value: { minVersion: { ios: '1.0.0', android: '1.0.0' }, maintenance: false, features: { challenges: false, gratitude: false, breathwork: false, milestones: false, intent: true }, supportEmail: 'support@wehum.app', defaultReminderTime: '07:00', languages: ['en'] } },
  legal: { key: 'legal', version: 1, updatedAt: null, value: { privacyUrl: 'https://wehum.app/privacy', termsUrl: 'https://wehum.app/terms', healthDisclaimer: 'Not medical advice.', deleteInactiveGuestsMonths: 12 } },
}; // prettier-ignore
const team = [
  { id: '0190a1b2-0000-7000-8000-000000000001', email: 'raphael@wehum.app', name: 'Raphael Reiter', role: 'owner', status: 'active', mfaEnabled: true, lastSignInAt: ago(5), createdAt: ago(90000) },
  { id: 't2', email: 'lena@wehum.app', name: 'Lena Fischer', role: 'editor', status: 'active', mfaEnabled: false, lastSignInAt: ago(9000), createdAt: ago(80000) },
  { id: 't3', email: 'jonas@wehum.app', name: 'Jonas Weber', role: 'moderator', status: 'invited', mfaEnabled: false, lastSignInAt: null, createdAt: ago(100) },
]; // prettier-ignore

function answers(url: URL, method: string): unknown {
  if (method !== 'GET') return undefined;
  const path = url.pathname.replace('/v1/admin', '');
  if (path === '/dashboard') return { data: dashboard };
  if (path === '/subscriptions/summary') return { data: summary };
  if (path === '/subscriptions/members') return { data: members, meta: { nextCursor: null } };
  if (path === '/subscriptions/events') return { data: events, meta: { nextCursor: null } };
  if (path === '/sessions') return { data: [], meta: { total: 24, nextCursor: null } };
  if (path === '/users')
    return { data: users, meta: { nextCursor: null, counts: { all: 4860, guests: 2550, accounts: 2310, paying: 600, trial: 112 } } };
  if (path === `/users/${U1}`) return { data: detail };
  if (path === '/analytics') return { data: trends };
  if (path === '/analytics/funnel') return { data: funnel };
  if (path === '/analytics/retention') return { data: retention };
  if (path === '/config') return { data: config };
  if (path === '/team') return { data: team };
  if (path === '/moderation') return { data: posts, meta: { nextCursor: null, open: 2 } };
  if (path === '/moderation/stats') return { data: { posts: 612, flagged: 1, hidden: 4, kept: 9, open: 2 } };
  if (path === '/moderation/rules') return { data: rules };
  if (path === '/notifications') return { data: announcements };
  if (path === '/notifications/automatic') return { data: automatic };
  if (path === '/notifications/audience') return { data: { targeted: 14820, quiet: 0, quietHours: { start: '22:00', end: '07:00' } } };
  return undefined;
}

const SCREENS = [
  {
    name: 'subscriptions',
    path: '/subscriptions',
    h1: 'Subscriptions',
    ready: (p: import('@playwright/test').Page) => p.getByRole('list', { name: 'Members' }),
  },
  { name: 'users', path: '/users', h1: 'Users & Members', ready: (p: import('@playwright/test').Page) => p.getByText('Marcus Vance') },
  {
    name: 'user-detail',
    path: `/users/${U1}`,
    h1: 'Marcus Vance',
    ready: (p: import('@playwright/test').Page) => p.getByRole('list', { name: 'Recent meditations' }),
  },
];

for (const theme of ['dark', 'light'] as const) {
  test(`dashboard passes axe in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('wh_theme', t), theme);
    await openAs(page, 'owner', '/', answers);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Needs attention' })).toBeVisible();
    expect(await bodyBackground(page)).toBe(theme === 'dark' ? 'rgb(11, 13, 14)' : 'rgb(247, 245, 242)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await seriousViolations(page)).toEqual([]);
    await page.screenshot({ path: `test-results/overview-dashboard-${theme}.png`, fullPage: true });
  });
}

for (const theme of ['dark', 'light'] as const) {
  for (const sc of SCREENS) {
    test(`${sc.name} passes axe in ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('wh_theme', t), theme);
      await openAs(page, 'owner', sc.path, answers);
      await expect(page.getByRole('heading', { level: 1, name: sc.h1 })).toBeVisible();
      await expect(sc.ready(page).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await seriousViolations(page)).toEqual([]);
      await page.screenshot({ path: `test-results/overview-${sc.name}-${theme}.png`, fullPage: true });
    });
  }
}

test('a moderator has no subscriptions or users screens', async ({ page }) => {
  await openAs(page, 'moderator', '/subscriptions', answers);
  await expect(page.getByText('No permission')).toBeVisible();
  await page.goto('/users');
  await expect(page.getByText('No permission')).toBeVisible();
});
