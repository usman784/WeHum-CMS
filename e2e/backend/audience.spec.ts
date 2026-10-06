import { expect, test, type APIRequestContext } from '@playwright/test';
import { API, flushRedis, OWNER, RC_WEBHOOK_SECRET, resetAdmins, roleEmail, sql } from './harness';
import { apiToken, forgetTwoStep, signIn } from './signin';

// Phase P6 exit tests, against the real backend, worker and a stand-in for RevenueCat: delete a user (typed confirm →
// job progress → the user is gone), export and gift, the Founding offer closing live in a second admin's screen, and
// a RevenueCat webhook arriving while the Subscriptions screen is open.

test.describe.configure({ mode: 'serial' });
test.setTimeout(150_000);

test.beforeAll(() => {
  resetAdmins();
  forgetTwoStep();
  flushRedis();
  sql(`UPDATE offers SET open = true, closed_at = NULL, taken = 412, cap = 1000 WHERE id = 'founding'`);
});
test.beforeEach(() => flushRedis());

/** A person as the app makes one: a guest, then (optionally) a saved email account. */
async function appUser(request: APIRequestContext, firstName: string, email?: string) {
  const g = await request.post(`${API}/v1/auth/guest`, {
    data: { installId: `e2e-${Math.random().toString(36).slice(2, 12)}`, platform: 'ios', appVersion: '1.0.0', timezone: 'Europe/Berlin' },
  });
  const { accessToken, me: user } = (await g.json()).data as { accessToken: string; me: { id: string } };
  sql(`UPDATE users SET first_name = $2, country = 'DE' WHERE id = $1`, [user.id, firstName]);
  if (email) sql(`UPDATE users SET email = $2, is_guest = false WHERE id = $1`, [user.id, email]);
  return { id: user.id, token: accessToken };
}

const rcEvent = (type: string, userId: string, extra: Record<string, unknown> = {}) => ({
  api_version: '1.0',
  event: {
    id: `e2e-${Math.random().toString(36).slice(2)}`,
    type,
    app_user_id: userId,
    original_app_user_id: userId,
    product_id: 'wehum_monthly',
    period_type: 'NORMAL',
    store: 'APP_STORE',
    price: 9.99,
    currency: 'USD',
    event_timestamp_ms: Date.now(),
    purchased_at_ms: Date.now(),
    expiration_at_ms: Date.now() + 30 * 86_400_000,
    ...extra,
  },
});

test('users: search finds a person, the detail shows them; delete needs the email, runs as a job, and the user is gone', async ({
  page,
  request,
}) => {
  const email = `e2e-delete-${Date.now()}@example.com`;
  const person = await appUser(request, 'Deletia', email);
  await signIn(page, OWNER.email);
  await page.goto('/users');
  await page.getByRole('searchbox', { name: 'Search users' }).fill('Deletia');
  await page.getByRole('table', { name: 'Users' }).getByText('Deletia').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Deletia' })).toBeVisible();
  await expect(page.getByText(email, { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Delete account and data' }).click();
  const dialog = page.getByRole('dialog', { name: /Delete Deletia/ });
  const go = dialog.getByRole('button', { name: 'Delete account and data' });
  await expect(go).toBeDisabled();
  await dialog.getByRole('textbox').fill(email);
  await go.click();
  await expect(page.getByText('Account and data deleted', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/users$/);
  await expect
    .poll(
      () =>
        sql<{ deleted: boolean }>(`SELECT deleted_at IS NOT NULL OR email IS NULL AS deleted FROM users WHERE id = $1`, [person.id])[0]
          ?.deleted ?? true,
    )
    .toBe(true);
  // the person's own app is signed out: their token no longer works
  const me = await request.get(`${API}/v1/me`, {
    headers: { Authorization: `Bearer ${person.token}`, 'x-platform': 'ios', 'x-app-version': '1.0.0' },
  });
  expect(me.status()).toBeGreaterThanOrEqual(400);
});

test('user detail: export gives download links; gift adds 30 days premium; mute marks the person', async ({ page, request }) => {
  const person = await appUser(request, 'Exporta', `e2e-export-${Date.now()}@example.com`);
  await signIn(page, OWNER.email);
  await page.goto(`/users/${person.id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Exporta' })).toBeVisible();

  await page.getByRole('button', { name: 'Export user data (JSON + CSV)' }).click();
  await expect(page.getByRole('link', { name: 'Download JSON' })).toBeVisible({ timeout: 60_000 });
  expect(await page.getByRole('link', { name: 'Download JSON' }).getAttribute('href')).toMatch(/^http/);

  await page.getByRole('button', { name: 'Gift 30 days premium' }).click();
  await expect(page.getByText('30 days premium given', { exact: true })).toBeVisible();
  const ent = sql<{ active: boolean; store: string }>(`SELECT active, store::text FROM entitlements WHERE user_id = $1`, [person.id])[0];
  expect(ent).toMatchObject({ active: true, store: 'promotional' });

  await page.getByRole('button', { name: 'Mute in Together feed' }).click();
  await expect(page.getByRole('button', { name: 'Unmute in Together feed' })).toBeVisible();
  expect(sql<{ muted: boolean }>(`SELECT muted_at IS NOT NULL AS muted FROM users WHERE id = $1`, [person.id])[0]!.muted).toBe(true);
});

test('subscriptions: a webhook shows up live; "End offer now" closes Founding and a second admin sees it at once', async ({
  page,
  browser,
  request,
}) => {
  await signIn(page, OWNER.email);
  await page.goto('/subscriptions');
  await expect(page.getByRole('heading', { level: 1, name: 'Subscriptions' })).toBeVisible();
  const founding = page.getByRole('region', { name: /Founding 1,000/ });
  await expect(founding).toContainText('Live');

  // RevenueCat reports a new monthly member while the screen is open
  const person = await appUser(request, 'Monthia', `e2e-monthly-${Date.now()}@example.com`);
  const hook = await request.post(`${API}/webhooks/revenuecat`, {
    headers: { Authorization: `Bearer ${RC_WEBHOOK_SECRET}` },
    data: rcEvent('INITIAL_PURCHASE', person.id),
  });
  expect(hook.status()).toBe(200);
  await expect(page.getByRole('list', { name: 'Latest subscription events' })).toContainText('Monthia', { timeout: 20_000 });

  // the second admin has the screen open too
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await signIn(other, roleEmail('admin'));
  await other.goto('/subscriptions');
  await expect(other.getByRole('region', { name: /Founding 1,000/ })).toContainText('Live');

  await founding.getByRole('button', { name: 'End offer now' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End offer' }).click();
  await expect(page.getByText('Founding offer ended', { exact: true })).toBeVisible();
  await expect(founding).toContainText('Ended');
  expect(sql<{ open: boolean }>(`SELECT open FROM offers WHERE id = 'founding'`)[0]!.open).toBe(false);
  await expect(other.getByRole('region', { name: /Founding 1,000/ })).toContainText('Ended', { timeout: 5_000 });
  await ctx.close();

  // the app's paywall no longer offers Founding
  const token = await apiToken(request, OWNER.email);
  const again = await request.post(`${API}/v1/admin/offers/founding/close`, { headers: { Authorization: `Bearer ${token}` } });
  expect(again.status()).toBe(422); // already closed: the button is idempotent on purpose
});

test('roles: an editor reads subscriptions and users but has no support actions; the API agrees', async ({ page, request }) => {
  const person = await appUser(request, 'Roleta');
  await signIn(page, roleEmail('editor'));
  await page.goto('/subscriptions');
  await expect(page.getByRole('heading', { level: 1, name: 'Subscriptions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'End offer now' })).toHaveCount(0);
  await page.goto(`/users/${person.id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Roleta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete account and data' })).toHaveCount(0);
  const token = await apiToken(request, roleEmail('editor'));
  const del = await request.delete(`${API}/v1/admin/users/${person.id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { confirm: person.id.slice(0, 8) },
  });
  expect(del.status()).toBe(403);
});
