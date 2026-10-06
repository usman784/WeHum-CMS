import { expect, test } from '@playwright/test';
import { seriousViolations } from '../axe';
import { ACCESS_TTL_SEC, API, emailedLink, flushRedis, OWNER, resetAdmins, roleEmail, sql } from './harness';
import { apiToken, enterPassword, freshCode, nav, PASSWORD, secrets, setUpTwoStep, signIn, signOut } from './signin';

// Phase P2 exit tests, against the real backend: sign-in with real two-step codes, navigation per role,
// lockout, token refresh, password reset and invitations.

let ownerRecovery: string[] = [];

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => {
  resetAdmins();
  flushRedis();
});
test.beforeEach(() => flushRedis()); // rate-limit counters start at zero for every test

test('owner: first sign-in sets up two-step, then the shell is live', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await expect(page.getByTestId('meditated-today')).toHaveText(/^\d[\d,]*$/); // the public counter answered
  expect(await seriousViolations(page)).toEqual([]);

  ownerRecovery = await signIn(page, OWNER.email);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(nav(page).getByRole('link')).toHaveCount(17);
  await expect(nav(page).getByText('Owner · Sign out')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Live' })).toBeVisible(); // the /admin socket accepted the token

  // the secret is stored encrypted, the recovery codes hashed
  const [row] = sql<{ mfa_enabled: boolean; totp_secret: string; recovery_codes: string[] }>(
    `SELECT mfa_enabled, totp_secret, recovery_codes FROM admin_users WHERE email=$1`,
    [OWNER.email],
  );
  expect(row?.mfa_enabled).toBe(true);
  expect(row?.totp_secret).not.toContain(secrets.get(OWNER.email)!);
  expect(row?.recovery_codes).toHaveLength(10);
  expect(row?.recovery_codes).not.toContain(ownerRecovery[0]);
});

test('owner: password + code; a reload keeps the session; nothing is kept in browser storage', async ({ page }) => {
  await signIn(page, OWNER.email);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toMatch(/eyJ|token/i); // no access token in storage (spec §6.2)
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'wh_rt')).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/v1/admin/auth' });
  expect(cookies.find((c) => c.name === 'wh_csrf')).toMatchObject({ httpOnly: false });

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(nav(page)).toBeVisible();

  await signOut(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await page.goto('/sessions'); // the cookie is gone on the server too
  await expect(page).toHaveURL(/\/login\?next=%2Fsessions$/);
});

test('wrong password and wrong code are refused with a clear message', async ({ page }) => {
  await enterPassword(page, OWNER.email, 'not-the-password');
  await expect(page.getByRole('alert')).toHaveText('Email or password is wrong');
  await expect(page.getByLabel('Password')).toHaveValue('');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('6-digit code').fill('000000');
  await expect(page.getByRole('alert')).toHaveText('That code is not valid');
  await page.getByLabel('6-digit code').fill(await freshCode(OWNER.email));
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  sql(`UPDATE admin_users SET failed_logins=0 WHERE email=$1`, [OWNER.email]);
});

test('a recovery code signs in once and never again', async ({ page }) => {
  const code = ownerRecovery[0]!;
  await enterPassword(page, OWNER.email);
  await page.getByRole('button', { name: 'Use a recovery code instead' }).click();
  await page.getByLabel('Recovery code').fill(code.toUpperCase());
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await signOut(page);

  await enterPassword(page, OWNER.email);
  await page.getByRole('button', { name: 'Use a recovery code instead' }).click();
  await page.getByLabel('Recovery code').fill(code);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert')).toHaveText('That code is not valid');
  sql(`UPDATE admin_users SET failed_logins=0 WHERE email=$1`, [OWNER.email]);
});

for (const [role, links, forbidden, allowed] of [
  ['admin', 17, null, '/settings'],
  ['editor', 15, '/settings', '/sessions'],
  ['moderator', 2, '/sessions', '/moderation'],
] as const) {
  test(`${role}: sees ${links} links, and the pages outside the role say "No permission"`, async ({ page }) => {
    await signIn(page, roleEmail(role));
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(nav(page).getByRole('link')).toHaveCount(links);
    await expect(nav(page).getByText(new RegExp(role, 'i')).last()).toBeVisible();

    await nav(page)
      .getByRole('link', { name: role === 'moderator' ? 'Dedications & gratitude' : 'Sessions' })
      .click();
    await expect(page).toHaveURL(new RegExp(`${allowed === '/settings' ? '/sessions' : allowed}$`));
    await expect(page.getByText('No permission')).toHaveCount(0);

    if (forbidden) {
      // typed into the address bar: the guard answers, not only the hidden link
      await page.goto(forbidden);
      await expect(page.getByText('No permission')).toBeVisible();
    }
  });
}

test('the API enforces the same roles, whatever the UI shows', async ({ request }) => {
  const as = async (role: string) => ({ Authorization: `Bearer ${await apiToken(request, roleEmail(role))}` });
  const moderator = await as('moderator');
  const editor = await as('editor');
  expect((await request.get(`${API}/v1/admin/me`, { headers: moderator })).status()).toBe(200);
  expect((await request.get(`${API}/v1/admin/sessions`, { headers: moderator })).status()).toBe(403);
  expect((await request.get(`${API}/v1/admin/team`, { headers: moderator })).status()).toBe(403);
  expect((await request.get(`${API}/v1/admin/sessions`, { headers: editor })).status()).toBe(200);
  expect((await request.get(`${API}/v1/admin/team`, { headers: editor })).status()).toBe(403);
  expect((await request.get(`${API}/v1/admin/sessions`)).status()).toBe(401);
});

test('five wrong passwords lock the account: "Too many attempts. Try again in 15 minutes."', async ({ page }) => {
  const email = roleEmail('editor');
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  for (let i = 1; i <= 5; i++) {
    await page.getByLabel('Password').fill(`wrong-password-${i}`);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Email or password is wrong');
    await expect(page.getByLabel('Password')).toHaveValue('');
  }
  // locked now: even the right password is refused
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Too many attempts. Try again in 15 minutes.');
  const [row] = sql<{ locked: boolean }>(`SELECT locked_until > now() AS locked FROM admin_users WHERE email=$1`, [email]);
  expect(row?.locked).toBe(true);
  sql(`UPDATE admin_users SET locked_until=NULL, failed_logins=0 WHERE email=$1`, [email]);
});

test('the session renews itself before the access token ends, without the admin noticing', async ({ page }) => {
  await signIn(page, OWNER.email);
  await expect(page.getByRole('status').filter({ hasText: 'Live' })).toBeVisible();
  // The server warns 60 s before the token ends; with the short e2e lifetime that is a few seconds after sign-in.
  const refreshed = await page.waitForResponse((r) => r.url().endsWith('/v1/admin/auth/refresh'), {
    timeout: (ACCESS_TTL_SEC - 60 + 15) * 1000,
  });
  expect(refreshed.status()).toBe(200);
  await expect(page.getByRole('status').filter({ hasText: 'Live' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('an expired access token: the next request refreshes first and then succeeds', async ({ page }) => {
  test.setTimeout((ACCESS_TTL_SEC + 60) * 1000);
  await signIn(page, OWNER.email);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  // Hold back every refresh until the token has really expired (as after a long pause with a sleeping laptop).
  let hold = true;
  await page.route('**/v1/admin/auth/refresh', async (route) => {
    while (hold) await new Promise((r) => setTimeout(r, 250));
    await route.continue();
  });
  await page.waitForTimeout((ACCESS_TTL_SEC + 3) * 1000);
  hold = false;

  // "Sign out" calls the API with the stale token → TOKEN_EXPIRED → refresh → the same call again → 204.
  const calls: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/v1/admin/auth/')) calls.push(`${r.url().split('/v1/admin/auth/')[1]} ${r.status()}`);
  });
  await signOut(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  expect(calls).toContain('refresh 200');
  expect(calls.at(-1)).toBe('logout 204');
  // the session really ended on the server: a reload does not sign back in
  await page.unroute('**/v1/admin/auth/refresh');
  await page.goto('/sessions');
  await expect(page).toHaveURL(/\/login\?next=%2Fsessions$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
});

test('forgot password: emailed link sets a new password and ends open sessions', async ({ page, browser }) => {
  const email = roleEmail('editor');
  const other = await browser.newContext();
  const open = await other.newPage(); // the editor is signed in somewhere else
  await signIn(open, email);
  await expect(open.getByRole('status').filter({ hasText: 'Live' })).toBeVisible();

  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();

  await expect.poll(() => emailedLinkOrNull(email, 'reset-password')).not.toBeNull();
  const link = emailedLink(email, 'reset-password');
  await page.goto(link);
  await page.getByLabel('New password').fill('A-brand-new-password-1');
  await page.getByLabel('Repeat the password').fill('A-brand-new-password-1');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('status')).toHaveText('Your password was changed. Sign in with the new one.');

  // the other browser is signed out at once, with the reason
  await expect(open.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await expect(open.getByRole('status')).toContainText('You were signed out because your access changed.');
  await other.close();

  await enterPassword(page, email); // old password
  await expect(page.getByRole('alert')).toHaveText('Email or password is wrong');
  await page.getByLabel('Password').fill('A-brand-new-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('6-digit code').fill(await freshCode(email));
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  await page.goto(link); // the link works once
  await page.getByLabel('New password').fill('Another-password-22');
  await page.getByLabel('Repeat the password').fill('Another-password-22');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'This link no longer works' })).toBeVisible();
});

test('invitation: the link sets name and password, then two-step setup, then the CMS with the invited role', async ({ page, request }) => {
  const email = 'lena@wehum.app';
  const owner = { Authorization: `Bearer ${await apiToken(request, OWNER.email)}` };
  const invite = await request.post(`${API}/v1/admin/team/invite`, { headers: owner, data: { email, role: 'moderator' } });
  expect(invite.status()).toBe(201);

  await page.goto(emailedLink(email, 'accept-invite'));
  await expect(page.getByRole('heading', { level: 1, name: 'Join the WeHum CMS' })).toBeVisible();
  await page.getByLabel('Your name').fill('Lena Fischer');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByLabel('Repeat the password').fill('short');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Use at least 10 characters')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('Lena-long-password-1');
  await page.getByLabel('Repeat the password').fill('Lena-long-password-1');
  await page.getByRole('button', { name: 'Continue' }).click();

  await setUpTwoStep(page, email);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(nav(page).getByText('Lena Fischer')).toBeVisible();
  await expect(nav(page).getByRole('link')).toHaveCount(2); // moderator

  await page.goto(emailedLink(email, 'accept-invite')); // signed in already: straight to the CMS
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
});

test('role changed by an owner: the admin is signed out at once and gets the new navigation after signing in', async ({
  page,
  request,
}) => {
  const email = roleEmail('admin');
  await signIn(page, email);
  await expect(nav(page).getByRole('link')).toHaveCount(17);
  await expect(page.getByRole('status').filter({ hasText: 'Live' })).toBeVisible();

  const owner = { Authorization: `Bearer ${await apiToken(request, OWNER.email)}` };
  const [{ id }] = sql<{ id: string }>(`SELECT id FROM admin_users WHERE email=$1`, [email]) as [{ id: string }];
  expect((await request.patch(`${API}/v1/admin/team/${id}`, { headers: owner, data: { role: 'moderator' } })).status()).toBe(200);

  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('You were signed out because your access changed.');
  await signIn(page, email);
  await expect(nav(page).getByRole('link')).toHaveCount(2);
});

function emailedLinkOrNull(to: string, path: 'reset-password' | 'accept-invite') {
  try {
    return emailedLink(to, path);
  } catch {
    return null;
  }
}
