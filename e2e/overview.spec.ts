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

function answers(url: URL, method: string): unknown {
  if (method !== 'GET') return undefined;
  const path = url.pathname.replace('/v1/admin', '');
  if (path === '/dashboard') return { data: dashboard };
  return undefined;
}

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
