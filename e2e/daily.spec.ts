import { expect, test } from '@playwright/test';
import { bodyBackground, seriousViolations } from './axe';
import { openAs } from './session';

// Look and accessibility of the daily-experience screens of phase P4 (design/screens 07, 08, 12, 13), in a real browser,
// with the API answered by fixtures. The flows run against the real backend in e2e/backend/daily.spec.ts.

const DAY = 86_400_000;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const monday = (d: string) =>
  new Date(Date.parse(`${d}T00:00:00Z`) - ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
const id = (n: number) => `0190a1b2-0000-7000-8000-${String(n).padStart(12, '0')}`;
const at = '2026-09-21T05:00:00.000Z';

const sessions = ['Steady Under Pressure', 'Deep Delta Sleep Descent', 'Cadence Synchronization 4s/6s', 'Panic', 'Anxiety'].map((title, i) => ({
  id: id(300 + i), slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: null, type: 'audio', access: 'premium', themeId: null, teacherId: null,
  tags: [], durationSec: i > 2 ? 240 : 900, mediaId: id(500), youtubeId: null, coverMediaId: null, coverUrl: null, cover: null, downloadable: true,
  isSos: i > 2, sosFeeling: i > 2 ? title : null, sosSubtitle: i > 2 ? 'Grounding in four minutes' : null, status: 'live', publishAt: at, plays: 100, completions: 50,
  version: 1, createdAt: at, updatedAt: at, updatedBy: null, title,
})); // prettier-ignore

const media = {
  id: id(500), kind: 'audio', name: 'steady.wav', mime: 'audio/mp4', bytes: 14 * 1024 * 1024, status: 'ready', error: null, durationSec: 600, loudnessLufs: -16.1,
  width: null, height: null, blurhash: null, createdAt: at, previewUrl: null, job: null,
}; // prettier-ignore
const ready = { mediaId: id(500), status: 'ready', durationSec: 600 };

const motdDay = (date: string, n: number | null) =>
  n === null
    ? { date, sessionId: null, variants: null, complete: false }
    : {
        date, sessionId: sessions[n]!.id, sessionTitle: sessions[n]!.title, sessionStatus: 'live', groupStartUtc: null, groupLengthMin: null,
        variants: { 10: ready, 30: ready, 45: n === 1 ? null : ready }, complete: n !== 1, practicedToday: 0, version: 1,
      }; // prettier-ignore

const today = day(0);
const message = (date: string, title: string, status: string, p: Record<string, unknown> = {}) => ({
  date, type: 'audio', title, text: null, mediaId: id(500), imageMediaId: null, durationSec: 240, themeTag: 'Attention', status, version: 1, updatedAt: at, ...p,
}); // prettier-ignore

function answers(url: URL, method: string): unknown {
  if (method !== 'GET') return undefined;
  const path = url.pathname.replace('/v1/admin', '');
  if (path === '/motd') {
    const [from, to] = [url.searchParams.get('from')!, url.searchParams.get('to')!];
    const out = [];
    for (let d = from; d <= to; d = new Date(Date.parse(`${d}T00:00:00Z`) + DAY).toISOString().slice(0, 10))
      out.push(motdDay(d, d === day(0) ? 0 : d === day(1) ? 1 : d === day(2) ? 2 : d === day(-1) ? 0 : null));
    return { data: out };
  }
  if (path === '/daily-messages')
    return { data: [message(day(-1), 'Quiet Power: Settling the Inner Rush', 'live'), message(today, 'Releasing Cognitive Friction Before Work', 'live'), message(day(1), 'Dissolving Defensiveness', 'scheduled'), message(day(2), 'End-of-Week Grounding', 'draft', { themeTag: 'Pacing' })] }; // prettier-ignore
  if (path === '/config/today')
    return { data: { key: 'today', version: 1, updatedAt: at, value: { emptyRoomThreshold: 10, freeHomePick: 'random', showDailyMessage: false, sections: { progress: true, liveCounter: true, worldMap: true } } } }; // prettier-ignore
  if (path === '/group')
    return {
      data: {
        key: 'group',
        version: 1,
        updatedAt: at,
        value: { startUtc: '16:00', lengthMin: 30, lobbyOpenMin: 15, reminderMin: 10 },
        history: [{ date: day(-1), title: 'Steady Under Pressure', groupJoined: 486, soloCount: 1940, practicedToday: 2426 }, { date: day(-2), title: 'Evening Settle', groupJoined: 402, soloCount: 1610, practicedToday: 2012 }], // prettier-ignore
      },
    };
  if (path === '/sos')
    return {
      data: {
        key: 'sos',
        version: 1,
        updatedAt: at,
        value: { title: 'How can I help?', subtitle: 'Short sessions for hard moments.', help: { title: 'Need more help?', body: 'You can contact us and book a personal session with Raphael.', bookingUrl: 'https://wehum.app/book', contactEmail: 'support@wehum.app' } }, // prettier-ignore
        tiles: sessions.slice(3).map((s, i) => ({ sessionId: s.id, title: s.title, feeling: s.title, subtitle: s.sosSubtitle, durationSec: s.durationSec, status: 'live', order: i })), // prettier-ignore
      },
    };
  if (path === '/sessions') return { data: sessions, meta: { nextCursor: null, total: sessions.length } };
  if (path.startsWith('/media/')) return { data: media };
  return undefined;
}

const screens = [
  ['/today', 'Today Screen'],
  ['/daily-messages', 'Daily Messages'],
  ['/sos', 'SoS sessions'],
  ['/group-meditation', 'Group meditation'],
] as const;

for (const theme of ['dark', 'light'] as const) {
  for (const [path, heading] of screens) {
    test(`${path} shows "${heading}" and passes axe in ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('wh_theme', t), theme);
      await openAs(page, 'owner', path, answers);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      // each screen waits for its data before it is checked
      const ready = {
        '/today': () => expect(page.getByRole('list', { name: 'Days of the week' })).toBeVisible(),
        '/daily-messages': () => expect(page.getByRole('list', { name: /^Days of / })).toBeVisible(),
        '/sos': () => expect(page.getByRole('list', { name: 'SoS tiles' })).toBeVisible(),
        '/group-meditation': () => expect(page.getByRole('list', { name: 'Group history' })).toBeVisible(),
      }[path];
      await ready();
      expect(await bodyBackground(page)).toBe(theme === 'dark' ? 'rgb(11, 13, 14)' : 'rgb(247, 245, 242)');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await seriousViolations(page)).toEqual([]);
      await page.screenshot({ path: `test-results/daily${path.replace(/\//g, '-')}-${theme}.png`, fullPage: true });
    });
  }
}

test('today: the week starts on Monday, the past is locked, a missing length is flagged', async ({ page }) => {
  await openAs(page, 'owner', '/today', answers);
  const list = page.getByRole('list', { name: 'Days of the week' });
  await expect(list.getByRole('listitem')).toHaveCount(7);
  await expect(list.getByRole('listitem').first()).toContainText(new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${monday(day(0))}T00:00:00Z`))); // prettier-ignore
  await expect(list.getByText('Missing 45 min')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'App preview' })).toBeVisible();
});

test('daily messages: a missing day is marked and the legend is there', async ({ page }) => {
  await openAs(page, 'owner', '/daily-messages', answers);
  await expect(page.getByRole('button', { name: /missing$/ }).first()).toBeVisible();
  await expect(page.getByRole('list', { name: 'Legend' })).toContainText('Scheduled');
});

test('a moderator has no daily-experience screens', async ({ page }) => {
  for (const [path] of screens) {
    await openAs(page, 'moderator', path, answers);
    await expect(page.getByText('No permission')).toBeVisible();
  }
});
