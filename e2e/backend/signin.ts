import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { API, OWNER, totp } from './harness';

// Shared sign-in helpers for the real-backend tests: real two-step codes, no shortcuts.

export const PASSWORD = OWNER.password;
/** Two-step secrets by email, filled as each account is set up. */
export const secrets = new Map<string, string>();

/**
 * A code the server has not seen yet. Each code works once, and the server accepts the previous, current and next
 * 30-second step. So up to three sign-ins fit in one step; a fourth waits for the next step.
 */
const usedSteps = new Map<string, Set<number>>();
export async function freshCode(email: string): Promise<string> {
  const used = usedSteps.get(email) ?? new Set<number>();
  usedSteps.set(email, used);
  for (;;) {
    const now = Math.floor(Date.now() / 30_000);
    const step = [now - 1, now, now + 1].find((s) => !used.has(s));
    if (step !== undefined) {
      used.add(step);
      return totp(secrets.get(email)!, step * 30_000);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/** Call after `resetAdmins()`: the accounts have no two-step sign-in again, so forget the secrets and used codes. */
export function forgetTwoStep() {
  secrets.clear();
  usedSteps.clear();
}

export const nav = (page: Page) => page.getByRole('navigation', { name: 'CMS navigation' });

export async function enterPassword(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** First sign-in of an account: scan (read) the key, confirm with a code, save the recovery codes. */
export async function setUpTwoStep(page: Page, email: string) {
  await expect(page.getByRole('heading', { level: 1, name: 'Set up two-step sign-in' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible();
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  secrets.set(email, secret);
  await page.getByLabel('6-digit code').fill(await freshCode(email));
  await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
  const items = page.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem');
  await expect(items).toHaveCount(10);
  const codes = await items.allInnerTexts();
  expect(codes).toHaveLength(10);
  await expect(page.getByRole('button', { name: 'Continue to the CMS' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'I have saved these codes in a safe place' }).check();
  await page.getByRole('button', { name: 'Continue to the CMS' }).click();
  return codes;
}

/**
 * Signs in and waits until the CMS shell is there: the code submits itself, so without the wait a test's next
 * `page.goto` could cut off the sign-in still in flight and land on the sign-in page.
 */
export async function signIn(page: Page, email: string, password = PASSWORD) {
  await enterPassword(page, email, password);
  let codes: string[] = [];
  if (!secrets.has(email)) codes = await setUpTwoStep(page, email);
  else await page.getByLabel('6-digit code').fill(await freshCode(email)); // submits itself at 6 digits
  await expect(nav(page)).toBeVisible({ timeout: 15_000 });
  return codes;
}

export const signOut = (page: Page) => nav(page).getByRole('button', { name: 'Sign out' }).first().click();

/** Sign in through the API only (no browser) and return a bearer token: for checking what the API itself allows. */
export async function apiToken(request: APIRequestContext, email: string) {
  const login = await (await request.post(`${API}/v1/admin/auth/login`, { data: { email, password: PASSWORD } })).json();
  const verify = await request.post(`${API}/v1/admin/auth/mfa/verify`, {
    data: { mfaToken: login.data.mfaToken, code: await freshCode(email) },
  });
  expect(verify.status(), `API sign-in as ${email}`).toBe(200);
  return (await verify.json()).data.accessToken as string;
}
