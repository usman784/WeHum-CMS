import { expect, test } from '@playwright/test';
import { bodyBackground, seriousViolations } from './axe';
import { API_ORIGIN, mockApi, openAs } from './session';

test('shell renders dark by default with the tokens and self-hosted Inter', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('http://localhost:4173') && !u.startsWith(API_ORIGIN) && !u.startsWith('data:')) external.push(u);
  });
  await openAs(page, 'owner');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await bodyBackground(page)).toBe('rgb(11, 13, 14)'); // #0B0D0E
  await expect(page.getByRole('navigation', { name: 'CMS navigation' })).toHaveCSS('background-color', 'rgb(17, 19, 21)'); // #111315
  expect(await page.evaluate(() => document.fonts.ready.then(() => document.fonts.check('14px "Inter Variable"')))).toBe(true);
  expect(external, 'no font, script or tracker comes from another origin').toEqual([]);
  expect(await seriousViolations(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/shell-dark.png', fullPage: true });
});

test('shell switches to light, and keeps the theme after a reload', async ({ page }) => {
  await openAs(page, 'owner');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await bodyBackground(page)).toBe('rgb(247, 245, 242)'); // #F7F5F2
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await bodyBackground(page)).toBe('rgb(247, 245, 242)');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
  expect(await seriousViolations(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/shell-light.png', fullPage: true });
});

test('sidebar matches the design at 1440 px: 248 px wide, active link in ember', async ({ page }) => {
  await openAs(page, 'owner', '/sessions');
  const nav = page.getByRole('navigation', { name: 'CMS navigation' });
  expect((await nav.boundingBox())?.width).toBe(248);
  const active = nav.getByRole('link', { name: 'Sessions' });
  await expect(active).toHaveAttribute('aria-current', 'page');
  await expect(active).toHaveCSS('color', 'rgb(255, 155, 112)'); // #FF9B70
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveCSS('color', 'rgb(160, 164, 168)'); // #A0A4A8
  await expect(nav.getByText('CONTENT', { exact: true })).toBeVisible();
});

test('sidebar collapses to icons under 1200 px and stays usable', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await openAs(page, 'owner');
  const nav = page.getByRole('navigation', { name: 'CMS navigation' });
  expect((await nav.boundingBox())?.width).toBe(72);
  await expect(nav.getByText('CONTENT', { exact: true })).toBeHidden();
  await nav.getByRole('link', { name: 'Themes' }).click(); // the name is still there for assistive tech
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Themes');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll').toBe(true);
  expect(await seriousViolations(page)).toEqual([]);
});

for (const [role, count, forbidden] of [
  ['owner', 17, null],
  ['admin', 17, null],
  ['editor', 15, '/settings'],
  ['moderator', 2, '/sessions'],
] as const) {
  test(`${role} sees ${count} links${forbidden ? ` and gets "No permission" on ${forbidden}` : ''}`, async ({ page }) => {
    await openAs(page, role);
    await expect(page.getByRole('navigation', { name: 'CMS navigation' }).getByRole('link')).toHaveCount(count);
    if (forbidden) {
      await page.goto(forbidden);
      await expect(page.getByText('No permission')).toBeVisible();
    }
  });
}

test('keyboard: the skip link is the first stop and moves focus to the content', async ({ page }) => {
  await openAs(page, 'owner');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('without a session every page leads to sign in and remembers the target', async ({ page }) => {
  await mockApi(page, null);
  await page.goto('/sessions');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await expect(page).toHaveURL(/\/login\?next=%2Fsessions$/);
  await expect(page.getByRole('navigation', { name: 'CMS navigation' })).toHaveCount(0);
});

test('sign out returns to the sign-in page', async ({ page }) => {
  await openAs(page, 'admin');
  await page.getByRole('navigation', { name: 'CMS navigation' }).getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await page.reload(); // the cookie is gone too
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
});

test('the mock service worker is not shipped', async ({ request }) => {
  const r = await request.get('/mockServiceWorker.js');
  expect(r.headers()['content-type'] ?? '').not.toContain('javascript');
});
