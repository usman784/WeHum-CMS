import { expect, test, type Page } from '@playwright/test';
import { API, flushRedis, OWNER, publish, resetAdmins, roleEmail, startApi, stopApi } from './harness';
import { apiToken, forgetTwoStep, signIn } from './signin';

// Phase P5 exit tests, against the real backend: a change made by one admin reaches another admin's open screen in
// under 2 s, two admins on one editor see each other, and after a backend restart the socket comes back and
// subscribes again by itself.

test.describe.configure({ mode: 'serial' });
test.setTimeout(150_000);

const pill = (page: Page) => page.getByRole('status').filter({ hasText: /^(Live|Reconnecting…|Offline)$/ });

test.beforeAll(() => {
  resetAdmins();
  forgetTwoStep();
  flushRedis();
});
test.beforeEach(() => flushRedis()); // sign-in rate limits
test('two browsers: a rename by one admin shows in the other admin’s list in under 2 s; both see each other in the editor', async ({
  page,
  browser,
  request,
}) => {
  await signIn(page, OWNER.email); // sets up two-step sign-in, which the API sign-in below needs
  const token = await apiToken(request, OWNER.email);
  const made = await request.post(`${API}/v1/admin/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: 'E2E Live A', type: 'audio', durationSec: 600 },
  });
  const created = (await made.json()).data as { id: string; version: number };

  await page.goto('/sessions?q=E2E%20Live');
  await expect(page.getByText('E2E Live A', { exact: true })).toBeVisible();
  await expect(pill(page)).toHaveText('Live');

  // the second admin, in a browser of their own
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await signIn(other, roleEmail('editor'));
  await other.goto(`/sessions/${created.id}`);
  await expect(other.getByRole('heading', { level: 1, name: 'E2E Live A' })).toBeVisible();
  await other.getByLabel('Title', { exact: true }).fill('E2E Live renamed');
  await other.getByRole('button', { name: 'Save' }).click();
  const saved = Date.now();
  await expect(page.getByText('E2E Live renamed', { exact: true })).toBeVisible({ timeout: 2_000 });
  expect(Date.now() - saved).toBeLessThan(2_000);

  // editing presence: both on the same editor see the other one's name
  await page.goto(`/sessions/${created.id}`);
  await expect(page.getByText('E2E editor is editing this session too.')).toBeVisible({ timeout: 2_000 });
  await expect(other.getByText(/is editing this session too\.$/)).toBeVisible({ timeout: 2_000 });
  // and the name goes away when the other admin leaves
  await other.goto('/sessions');
  await expect(page.getByText('E2E editor is editing this session too.')).toBeHidden({ timeout: 2_000 });
  await ctx.close();
});

test('backend restart: the pill shows "Reconnecting…", then "Live", and the screens get live events again', async ({ page, request }) => {
  await signIn(page, OWNER.email);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(pill(page)).toHaveText('Live');

  await stopApi();
  await expect(pill(page)).toHaveText('Reconnecting…', { timeout: 15_000 });
  await startApi();
  // the client backs off up to 30 s between tries (src/lib/socket.ts), so the next try can be that far away
  await expect(pill(page)).toHaveText('Live', { timeout: 40_000 });

  // the dashboard channel was joined again: a pushed number arrives
  await expect(async () => {
    publish('live:agg', { total: 4321, countries: 9 });
    await expect(page.getByText('4,321', { exact: true })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });

  // and so were the entity changes: a rename through the API shows in the open list
  const token = await apiToken(request, OWNER.email);
  const made = await request.post(`${API}/v1/admin/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: 'E2E After restart', type: 'audio', durationSec: 600 },
  });
  const created = (await made.json()).data as { id: string; version: number };
  await page.goto('/sessions?q=E2E%20After');
  await expect(page.getByText('E2E After restart', { exact: true })).toBeVisible();
  await expect(pill(page)).toHaveText('Live');
  const renamed = await request.patch(`${API}/v1/admin/sessions/${created.id}`, {
    headers: { Authorization: `Bearer ${token}`, 'If-Match': `"v${created.version}"` },
    data: { title: 'E2E After restart (renamed)' },
  });
  expect(renamed.status()).toBe(200);
  await expect(page.getByText('E2E After restart (renamed)', { exact: true })).toBeVisible({ timeout: 2_000 });
});
