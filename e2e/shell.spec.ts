import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** Serious and critical axe violations on the current page (spec §13: none allowed). */
async function seriousViolations(page: Page) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    type Violation = { id: string; impact: string; nodes: { target: string[]; failureSummary: string }[] };
    const axe = (window as unknown as { axe: { run: () => Promise<{ violations: Violation[] }> } }).axe;
    const { violations } = await axe.run();
    return violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} — ${n.failureSummary.split('\n')[1]?.trim()}`));
  });
}

test('shell renders dark by default with the tokens and self-hosted Inter', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost:4173') && !r.url().startsWith('data:')) external.push(r.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The CMS foundation is ready');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await bg(page)).toBe('rgb(11, 13, 14)'); // #0B0D0E
  await expect(page.getByRole('button', { name: 'Primary' })).toHaveCSS('background-color', 'rgb(255, 122, 69)'); // ember
  expect(await page.evaluate(() => document.fonts.ready.then(() => document.fonts.check('14px "Inter Variable"')))).toBe(true);
  expect(external, 'no font or script comes from another origin').toEqual([]);
  expect(await seriousViolations(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/p0-shell-dark.png', fullPage: true });
});

test('shell switches to light, and keeps the theme after a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await bg(page)).toBe('rgb(247, 245, 242)'); // #F7F5F2
  await expect(page.getByRole('button', { name: 'Primary' })).toHaveCSS('background-color', 'rgb(232, 98, 44)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await bg(page)).toBe('rgb(247, 245, 242)');
  expect(await seriousViolations(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/p0-shell-light.png', fullPage: true });
});

test('the mock service worker is not shipped', async ({ request }) => {
  const r = await request.get('/mockServiceWorker.js');
  expect(r.headers()['content-type'] ?? '').not.toContain('javascript');
});
