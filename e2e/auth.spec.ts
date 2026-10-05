import { expect, test } from '@playwright/test';
import { seriousViolations } from './axe';
import { mockApi } from './session';

// Look and accessibility of the sign-in screens (design/screens/00_Login.png). The sign-in flow itself is
// tested against the real backend in e2e/backend/auth.spec.ts.

for (const theme of ['dark', 'light'] as const) {
  test(`sign-in page matches the design and passes axe in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('wh_theme', t), theme);
    await mockApi(page, null);
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();

    const hero = page.getByRole('region', { name: 'WeHum' });
    const box = await hero.boundingBox();
    expect(box?.width).toBe(720); // two equal columns at 1440 px
    await expect(hero).toHaveCSS('background-color', 'rgb(18, 60, 58)'); // teal #123C3A in both themes
    await expect(page.getByTestId('meditated-today')).toHaveText('3,180');
    await expect(hero.getByText('Everything people hear in WeHum starts here.')).toBeVisible();

    const email = page.getByLabel('Email');
    expect((await email.boundingBox())?.height).toBe(48);
    const button = page.getByRole('button', { name: 'Sign in' });
    expect((await button.boundingBox())?.height).toBe(50);
    expect((await button.boundingBox())?.width).toBe(400);
    await expect(page.getByText('Protected by two-step verification for admin accounts')).toBeVisible();

    expect(await seriousViolations(page)).toEqual([]);
    await page.screenshot({ path: `test-results/login-${theme}.png` });
  });
}

test('under 1024 px the hero is hidden and the form uses the full width', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await mockApi(page, null);
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'WeHum' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('keyboard only: email → password → forgot link → sign in, and the form checks before sending', async ({ page }) => {
  await mockApi(page, null);
  await page.goto('/login');
  await page.getByLabel('Email').focus();
  await page.keyboard.type('not-an-email');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
  await expect(page.getByText('Enter your password')).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test('forgot password, reset and invite pages pass axe; dead links say so', async ({ page }) => {
  await mockApi(page, null);
  await page.goto('/forgot-password');
  await expect(page.getByRole('heading', { level: 1, name: 'Forgot password' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await page.goto('/reset-password?token=a-token-that-is-long-enough-123');
  await expect(page.getByRole('heading', { level: 1, name: 'Set a new password' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await page.goto('/accept-invite?token=a-token-that-is-long-enough-123');
  await expect(page.getByRole('heading', { level: 1, name: 'Join the WeHum CMS' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await page.goto('/reset-password');
  await expect(page.getByRole('heading', { level: 1, name: 'This link no longer works' })).toBeVisible();
  await page.goto('/accept-invite');
  await expect(page.getByRole('heading', { level: 1, name: 'This invitation no longer works' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
