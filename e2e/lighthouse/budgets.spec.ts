import { chromium, expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import { mockApi } from '../session';

// Spec §12 budgets, checked on the production build: Performance ≥ 90 and Accessibility ≥ 95 on Dashboard and
// Sessions. The API is answered by fixtures (same as the mocked browser tests), so only the CMS itself is measured.
// The routes are set on a persistent browser context, so they also answer for the tab Lighthouse opens.

test.setTimeout(180_000);
test.describe.configure({ mode: 'serial' });

const PORT = 9333;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const dashboard = {
  at: Date.now(),
  kpis: { liveNow: 214, liveCountries: 3, meditationsToday: 3180, meditationsLastWeekSameDay: 2840, meditationsDeltaPct: 12, payingMembers: 600, inTrial: 112, mrrUsd: 3904, library: { sessions: 142, programs: 4, themes: 8 } },
  moderationOpen: 7,
  dailyMessages: Array.from({ length: 7 }, (_, i) => ({ date: day(i - 3), title: i < 5 ? `Message ${i + 1}` : null, type: i < 5 ? 'audio' : null, status: (['live', 'live', 'live', 'scheduled', 'draft', 'missing', 'missing'] as const)[i] })),
  topSessions: [{ id: 's1', title: 'Steady Under Pressure', theme: 'Breathing', plays: 4120, completion: 0.82 }],
  needsAttention: [{ kind: 'reported_dedications', count: 7 }, { kind: 'founding', taken: 412, cap: 1000 }],
  nextGroup: { startsAt: new Date(Date.now() + 3 * 3_600_000).toISOString(), title: 'The Midday Coherence', lengthMin: 30, state: 'scheduled', waiting: 0 },
}; // prettier-ignore
const sessions = Array.from({ length: 50 }, (_, i) => ({
  id: `0198a1b2-0000-7000-8000-${String(i).padStart(12, '0')}`, slug: `s-${i}`, title: `Meditation ${i + 1}`, description: null, type: 'audio', access: i % 3 ? 'premium' : 'free',
  themeId: 't1', teacherId: 'r1', tags: [], durationSec: 600, mediaId: null, youtubeId: null, coverMediaId: null, coverUrl: null, cover: null, downloadable: true,
  isSos: false, sosFeeling: null, sosSubtitle: null, status: 'live', publishAt: null, plays: 100 * i, completions: 50 * i, version: 1, createdAt: ago(9000), updatedAt: ago(60), updatedBy: null,
})); // prettier-ignore

function answers(url: URL, method: string): unknown {
  if (method !== 'GET') return undefined;
  const path = url.pathname.replace('/v1/admin', '');
  if (path === '/dashboard') return { data: dashboard };
  if (path === '/sessions') return { data: sessions, meta: { total: 142, nextCursor: null } };
  if (path === '/themes') return { data: [{ id: 't1', name: 'Breathing', sessionCount: 50 }] };
  if (path === '/teachers') return { data: [{ id: 'r1', name: 'Raphael Reiter' }] };
  return undefined;
}

const PAGES = [
  { name: 'dashboard', path: '/' },
  { name: 'sessions', path: '/sessions' },
];

for (const p of PAGES) {
  test(`${p.name}: Lighthouse performance ≥ 90, accessibility ≥ 95`, async () => {
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'wehum-lh-')), {
      channel: process.env.PW_CHANNEL || undefined,
      args: [`--remote-debugging-port=${PORT}`],
      viewport: { width: 1440, height: 900 },
    });
    try {
      await mockApi(context, 'owner', answers);
      // warm the preview server so the first measured load is not a cold start
      const warm = await context.newPage();
      await warm.goto(`http://localhost:4173${p.path}`);
      await warm.close();
      const result = await lighthouse(
        `http://localhost:4173${p.path}`,
        { port: PORT, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility'] },
        desktopConfig,
      );
      const lhr = result!.lhr;
      writeFileSync(`test-results/lighthouse-${p.name}.json`, JSON.stringify(lhr, null, 1));
      const perf = Math.round((lhr.categories.performance?.score ?? 0) * 100);
      const a11y = Math.round((lhr.categories.accessibility?.score ?? 0) * 100);
      console.log(`${p.name}: performance ${perf}, accessibility ${a11y}`);
      const failed = Object.values(lhr.audits)
        .filter(
          (a) => a.score !== null && a.score < 1 && lhr.categories.accessibility?.auditRefs.some((r) => r.id === a.id && r.weight > 0),
        )
        .map((a) => a.id);
      expect(a11y, `accessibility audits not passed: ${failed.join(', ')}`).toBeGreaterThanOrEqual(95);
      expect(perf).toBeGreaterThanOrEqual(90);
    } finally {
      await context.close();
    }
  });
}
