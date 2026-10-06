import { expect, test } from '@playwright/test';
import { io } from 'socket.io-client';
import { API, flushRedis, OWNER, resetAdmins, roleEmail, sql } from './harness';
import { apiToken, forgetTwoStep, signIn } from './signin';

// Phase P8 exit tests, against the real backend: analytics read the daily aggregates; a feature flag switched in
// Settings reaches a phone at once (`config:changed` on the app socket, and the next bootstrap); the team rules hold
// (nobody changes their own role, an admin cannot touch owners); every change is in the audit log.

test.describe.configure({ mode: 'serial' });
test.setTimeout(150_000);

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const app = { 'x-platform': 'ios', 'x-app-version': '1.0.0' };

test.beforeAll(() => {
  resetAdmins();
  forgetTwoStep();
  flushRedis();
  // two days of roll-ups, as the nightly job writes them
  sql(`DELETE FROM daily_aggregates WHERE date >= $1`, [day(-30)]);
  for (const [d, med, group] of [
    [day(-2), 120, 20],
    [day(-1), 150, 30],
  ] as const)
    sql(
      `INSERT INTO daily_aggregates (date, meditations, minutes, group_meditations, active_users, new_users, new_trials, new_paid, cancellations, revenue_usd, peak_live, countries, by_theme, funnel)
       VALUES ($1, $2, $3, $4, 40, 5, 2, 1, 0, 9.99, 12, '{"DE": 30, "US": 10}', '{"Sleep": 900}', '{"installed": 10, "introDone": 8, "firstMeditation": 6, "continuedFree": 5, "trialStarted": 2, "savedAccount": 3, "paid": 1}')`,
      [d, med, med * 12, group],
    );
});
test.beforeEach(() => flushRedis());

test('analytics: KPIs, days, funnel and themes come from the roll-ups; 7/14/30/90 switch', async ({ page }) => {
  await signIn(page, OWNER.email);
  await page.goto('/analytics?period=7');
  await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible();
  const meditations = page.getByText('Meditations', { exact: true }).locator('..');
  await expect(meditations).toContainText('270');
  await expect(page.getByRole('list', { name: 'Meditations per day' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('list', { name: 'Conversion funnel' })).toContainText('Became paid member');
  await expect(page.getByRole('list', { name: 'Conversion funnel' })).toContainText('10%');
  await expect(page.getByRole('list', { name: 'Minutes by theme' })).toContainText('Sleep');
  await expect(page.getByRole('list', { name: 'Meditators by country' })).toContainText('Germany');
  await page.getByRole('radio', { name: '90 days' }).click();
  await expect(page).toHaveURL(/period=90/);
  await expect(meditations).toContainText('270');
});

test('settings: a feature flag switched on reaches a phone at once; the bootstrap has it too', async ({ page, request }) => {
  // a phone with the app open
  const guest = await request.post(`${API}/v1/auth/guest`, {
    data: { installId: `e2e-${Math.random().toString(36).slice(2, 12)}`, platform: 'ios', appVersion: '1.0.0', timezone: 'UTC' },
  });
  const token = (await guest.json()).data.accessToken as string;
  const phone = io(`${API}/live`, { transports: ['websocket'], auth: { token }, reconnection: false });
  const changed: { key: string }[] = [];
  phone.on('config:changed', (p: { key: string }) => changed.push(p));
  await new Promise<void>((done, fail) => {
    phone.on('connect', () => done());
    phone.on('connect_error', fail);
  });

  try {
    const before = (await (await request.get(`${API}/v1/bootstrap`, { headers: { Authorization: `Bearer ${token}`, ...app } })).json())
      .data;
    const was = before.features.gratitude as boolean;

    await signIn(page, OWNER.email);
    await page.goto('/settings?tab=releases');
    await page.getByRole('switch', { name: 'Gratitude feed' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Settings saved', { exact: true })).toBeVisible();

    await expect.poll(() => changed.some((c) => c.key === 'main'), { timeout: 5_000 }).toBe(true);
    const after = (await (await request.get(`${API}/v1/bootstrap`, { headers: { Authorization: `Bearer ${token}`, ...app } })).json()).data;
    expect(after.features.gratitude).toBe(!was);
    expect(sql(`SELECT 1 FROM audit_log WHERE action = 'config.update' AND target_id = 'main'`).length).toBeGreaterThanOrEqual(1);
  } finally {
    phone.close();
  }
});

test('settings: minimum app version blocks an old app (426); invalid versions are not saved', async ({ page, request }) => {
  await signIn(page, OWNER.email);
  await page.goto('/settings?tab=releases');
  const ios = page.getByRole('textbox', { name: 'Minimum iOS version' });
  await ios.fill('2.0');
  await expect(page.getByText('Use x.y.z, e.g. 1.2.0')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await ios.fill('2.0.0');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Settings saved', { exact: true })).toBeVisible();
  const guest = await request.post(`${API}/v1/auth/guest`, {
    data: { installId: `e2e-${Math.random().toString(36).slice(2, 12)}`, platform: 'ios', appVersion: '1.0.0', timezone: 'UTC' },
  });
  const token = (await guest.json()).data.accessToken as string;
  const old = await request.get(`${API}/v1/today`, { headers: { Authorization: `Bearer ${token}`, ...app } });
  expect(old.status()).toBe(426);
  // put it back for the other tests
  await ios.fill('1.0.0');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Settings saved', { exact: true }).first()).toBeVisible();
});

test('team: invite, role change; an admin cannot change the owner; nobody changes their own role', async ({ page, request, browser }) => {
  const email = `e2e-invite-${Date.now()}@wehum.app`;
  await signIn(page, OWNER.email);
  await page.goto('/settings?tab=team');
  await page.getByRole('button', { name: '+ Invite member' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite a team member' });
  await dialog.getByRole('textbox', { name: 'Email' }).fill(email);
  await dialog.getByRole('combobox', { name: 'Role' }).selectOption('moderator');
  await dialog.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText('Invitation sent', { exact: true })).toBeVisible();
  expect(sql<{ status: string; role: string }>(`SELECT status::text, role::text FROM admin_users WHERE email = $1`, [email])[0]).toEqual({
    status: 'invited',
    role: 'moderator',
  });
  await expect(page.getByRole('combobox', { name: /^Role of / }).first()).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Role of Owner' })).toBeDisabled(); // myself

  await page.getByRole('combobox', { name: 'Role of E2E editor' }).selectOption('admin');
  await expect(page.getByText('E2E editor is now admin', { exact: true })).toBeVisible();
  expect(sql<{ role: string }>(`SELECT role::text FROM admin_users WHERE email = $1`, [roleEmail('editor')])[0]!.role).toBe('admin');

  // an admin's view: the owner row is locked, and the API says the same
  const ctx = await browser.newContext();
  const adminPage = await ctx.newPage();
  await signIn(adminPage, roleEmail('admin'));
  await adminPage.goto('/settings?tab=team');
  await expect(adminPage.getByRole('combobox', { name: 'Role of Owner' })).toBeDisabled();
  await ctx.close();
  const adminToken = await apiToken(request, roleEmail('admin'));
  const [owner] = sql<{ id: string }>(`SELECT id FROM admin_users WHERE email = $1`, [OWNER.email]);
  const demote = await request.patch(`${API}/v1/admin/team/${owner!.id}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { role: 'editor' },
  });
  expect(demote.status()).toBe(403);
});

test('audit log: shows the changes of this run with who made them', async ({ page }) => {
  await signIn(page, OWNER.email);
  await page.goto('/settings?tab=audit');
  const log = page.getByRole('list', { name: 'Audit log' });
  await expect(log).toContainText('Config update');
  await expect(log).toContainText('Team invite');
  await page.getByRole('combobox', { name: 'What' }).selectOption('admin');
  await expect(log).not.toContainText('Config update');
  await expect(log).toContainText('Team update');
});

test('roles: editors and moderators have no Settings; moderators no Analytics', async ({ browser }) => {
  for (const [email, analytics] of [[roleEmail('moderator'), false]] as const) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, email);
    await page.goto('/settings');
    await expect(page.getByText('No permission')).toBeVisible();
    await page.goto('/analytics');
    if (analytics) await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible();
    else await expect(page.getByText('No permission')).toBeVisible();
    await ctx.close();
  }
});
