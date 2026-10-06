import { expect, test } from '@playwright/test';
import { bodyBackground, seriousViolations } from './axe';
import { openAs } from './session';

// Look and accessibility of the content screens of phase P3 (design/screens 03–06, 09–11), in a real browser, with
// the API answered by fixtures. The flows (upload, publish, 409) run against the real backend in e2e/backend/content.spec.ts.

const at = '2026-09-21T05:00:00.000Z';
const id = (n: number) => `0190a1b2-0000-7000-8000-${String(n).padStart(12, '0')}`;

const themes = [
  ['Transcendent', 'Go beyond thought', 'sun'],
  ['Loving Kindness', 'Warmth for yourself and others', 'heart'],
  ['Breathing', 'Calm through the breath', 'wind'],
  ['Sleep', 'Let the day go', 'moon'],
].map(([name, subtitle, iconKey], i) => ({
  id: id(100 + i), slug: String(name).toLowerCase().replace(/\s+/g, '-'), name, subtitle, description: `${name}: ${String(subtitle).toLowerCase()}.`,
  iconKey, order: i, visible: true, version: 1, updatedAt: at, sessionCount: 2, minDurationSec: 240, maxDurationSec: 2700,
})); // prettier-ignore

const teachers = [
  {
    id: id(200), name: 'Raphael Reiter', role: 'Head of Practice', specialty: 'Somatic breathwork', bio: 'Raphael has taught meditation for over ten years.',
    quote: 'Meditation without the incense.', photoMediaId: null, photoUrl: null, youtubeUrl: 'https://youtube.com/raphaelreiter',
    instagramUrl: 'https://instagram.com/raphael.meditates', websiteUrl: null, visible: true, canLeadGroup: true, version: 1, updatedAt: at, sessionCount: 5,
  },
]; // prettier-ignore

const session = (n: number, title: string, p: Record<string, unknown> = {}) => ({
  id: id(300 + n), slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: 'A short practice for a busy day.', type: 'audio', access: 'premium',
  themeId: themes[2]!.id, teacherId: teachers[0]!.id, tags: ['morning'], durationSec: 900, mediaId: null, youtubeId: null, coverMediaId: null, coverUrl: null,
  cover: null, downloadable: true, isSos: false, sosFeeling: null, sosSubtitle: null, status: 'live', publishAt: at, plays: 4120, completions: 2100,
  version: 1, createdAt: at, updatedAt: at, updatedBy: null, title, ...p,
}); // prettier-ignore
const sessions = [
  session(1, 'Steady Under Pressure'),
  session(2, 'Unconditional Love & Healing', {
    type: 'youtube',
    access: 'free',
    youtubeId: 'Qm7r2XyK8aE',
    durationSec: 2400,
    downloadable: false,
  }),
  session(3, 'Deep Delta Sleep Descent', { themeId: themes[3]!.id, durationSec: 2700 }),
  session(4, 'Panic', { isSos: true, sosFeeling: 'Panic', sosSubtitle: 'Grounding in four minutes', durationSec: 240 }),
  session(5, 'Open Awareness & Silence', { status: 'draft', publishAt: null, plays: 0 }),
];

const blocks = [
  ['opening', 'Arrival', 0],
  ['opening', 'Body Settle', 1],
  ['closing', 'Closing Words', 0],
  ['sound', 'Rain on Cedar', 0],
].map(([kind, name, order], i) => ({
  id: id(400 + i), kind, name, mediaId: id(500 + i), durationSec: 120, loopable: kind === 'sound', loudnessLufs: '-16.10', access: 'premium', order, visible: true, version: 1,
})); // prettier-ignore

const programs = [
  {
    id: id(600), slug: '7-day-autonomic-reset', title: '7-Day Autonomic Reset', description: 'A progressive nervous system down-regulation program.',
    access: 'premium', unlockRule: 'next_day_0700', status: 'live', version: 3, updatedAt: at, kpis: { started: 1240, completed: 384 },
    days: sessions.slice(0, 2).map((s, i) => ({
      day: i + 1, sessionId: s.id, title: null,
      session: { id: s.id, title: s.title, durationSec: s.durationSec, status: s.status, type: s.type, themeId: s.themeId },
    })),
  },
  {
    id: id(601), slug: '14-day-sleep-repair', title: '14-Day Sleep Repair', description: null, access: 'premium', unlockRule: 'immediate', status: 'draft',
    version: 1, updatedAt: at, days: [], kpis: { started: 0, completed: 0 },
  },
]; // prettier-ignore

const challenges = [
  { id: id(700), name: '7 days of calm', days: 7, counts: 'any', minMinutes: 3, membersOnly: true, showOnYou: true, startsAt: null, status: 'live', version: 2, createdAt: at, participants: 1904, finished: 1180 },
  { id: id(701), name: 'Sleep week', days: 7, counts: 'sleep', minMinutes: 3, membersOnly: true, showOnYou: true, startsAt: null, status: 'draft', version: 1, createdAt: at, participants: 0, finished: 0 },
]; // prettier-ignore

/** The content API, as fixtures. Anything not listed here is not asked by these screens. */
function answers(url: URL, method: string): unknown {
  if (method !== 'GET') return undefined;
  const path = url.pathname.replace('/v1/admin', '');
  if (path === '/themes') return { data: themes };
  if (path === '/teachers') return { data: teachers };
  if (path === '/sessions') return { data: sessions, meta: { nextCursor: null, total: sessions.length } };
  const one = /^\/sessions\/(.+)$/.exec(path);
  if (one) return { data: sessions.find((s) => s.id === one[1]) ?? sessions[0] };
  if (path === '/sound-blocks') return { data: blocks };
  if (path === '/programs') return { data: programs };
  if (path === '/challenges') return { data: challenges };
  if (path === '/config') return { data: { main: { value: { features: { challenges: true } }, version: 1 } } };
  return undefined;
}

const screens = [
  ['/themes', 'Themes'],
  ['/teachers', 'Teachers'],
  ['/sessions', 'Sessions'],
  ['/sessions/new', 'New session'],
  ['/sounds', 'Sounds'],
  ['/programs', 'Programs'],
  ['/challenges', 'Challenges'],
] as const;

for (const theme of ['dark', 'light'] as const) {
  for (const [path, heading] of screens) {
    test(`${path} shows "${heading}" and passes axe in ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('wh_theme', t), theme);
      await openAs(page, 'owner', path, answers);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      expect(await bodyBackground(page)).toBe(theme === 'dark' ? 'rgb(11, 13, 14)' : 'rgb(247, 245, 242)');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await seriousViolations(page)).toEqual([]);
      await page.screenshot({ path: `test-results/content${path.replace(/\//g, '-')}-${theme}.png` });
    });
  }
}

test('sessions list: rows show theme, status and plays, and the tabs change the address', async ({ page }) => {
  await openAs(page, 'owner', '/sessions', answers);
  const table = page.getByRole('table', { name: 'Sessions' });
  await expect(table).toBeVisible();
  await expect(table.getByText('Steady Under Pressure')).toBeVisible();
  await expect(table.getByText('Draft')).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Filter sessions' })
    .getByRole('radio', { name: /Drafts/ })
    .click();
  await expect(page).toHaveURL(/tab=drafts/);
});

test('a moderator has no content screens', async ({ page }) => {
  for (const [path] of screens) {
    await openAs(page, 'moderator', path, answers);
    await expect(page.getByText('No permission')).toBeVisible();
  }
});
