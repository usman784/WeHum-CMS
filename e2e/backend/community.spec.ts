import { expect, test } from '@playwright/test';
import { flushRedis, resetAdmins, roleEmail, OWNER, sql } from './harness';
import { forgetTwoStep, signIn } from './signin';

// Phase P7 exit tests, against the real backend: two moderators work the same queue (a decision by one leaves the
// other's screen at once), the rules are saved, and push scheduling is validated, with the quiet-hours warning
// counted from real people in real time zones.

test.describe.configure({ mode: 'serial' });
test.setTimeout(150_000);

const COUNTRY = 'XQ'; // a made-up country code, so the audience is exactly the people made here
const ZONES = [
  'Pacific/Kiritimati',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Europe/Berlin',
  'America/New_York',
  'Pacific/Honolulu',
  'Pacific/Pago_Pago',
];
const hourIn = (tz: string) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const quiet = (h: number) => h >= 22 || h < 7;

function person(firstName: string, tz: string, withPush = true) {
  const [u] = sql<{ id: string }>(
    `INSERT INTO users (id, first_name, is_guest, country, timezone) VALUES (gen_random_uuid(), $1, false, $2, $3) RETURNING id`,
    [firstName, COUNTRY, tz],
  );
  if (withPush)
    sql(
      `INSERT INTO devices (id, user_id, install_id, platform, push_token, app_version) VALUES (gen_random_uuid(), $1, $2, 'ios', $3, '1.0.0')`,
      [u!.id, `e2e-${Math.random().toString(36).slice(2)}`, `tok-${Math.random().toString(36).slice(2)}`],
    );
  return u!.id;
}

function flagged(firstName: string, text: string) {
  const userId = person(firstName, 'UTC', false);
  const [s] = sql<{ id: string }>(`SELECT id FROM sessions WHERE status='live' ORDER BY title LIMIT 1`);
  sql(
    `INSERT INTO dedications (id, session_id, user_id, meditation_id, first_name, country, text, status, auto_flags, report_count)
     VALUES (gen_random_uuid(), $1, $2, gen_random_uuid(), $3, 'DE', $4, 'flagged', '{profanity}', 1)`,
    [s!.id, userId, firstName, text],
  );
}

test.beforeAll(() => {
  resetAdmins();
  forgetTwoStep();
  flushRedis();
  sql(`DELETE FROM dedications`);
  sql(`DELETE FROM users WHERE country = $1`, [COUNTRY]);
  sql(`INSERT INTO admin_users (id, email, name, role, status, password_hash)
       SELECT gen_random_uuid(), 'moderator2@wehum.app', 'E2E moderator two', 'moderator', 'active', password_hash FROM admin_users WHERE email = $1`, [OWNER.email]); // prettier-ignore
});
test.beforeEach(() => flushRedis());

test('two moderators: a post hidden by one leaves the other’s queue at once; keep shows it again', async ({ page, browser }) => {
  flagged('Alba', 'E2E post one for review');
  flagged('Bruno', 'E2E post two for review');
  await signIn(page, roleEmail('moderator'));
  await page.goto('/moderation');
  const mine = page.getByRole('list', { name: 'Posts' });
  await expect(mine.getByRole('listitem')).toHaveCount(2);

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await signIn(other, 'moderator2@wehum.app');
  await other.goto('/moderation');
  const theirs = other.getByRole('list', { name: 'Posts' });
  await expect(theirs.getByRole('listitem')).toHaveCount(2);

  await mine.getByRole('listitem', { name: 'Post by Alba' }).getByRole('button', { name: 'Hide post' }).click();
  await expect(page.getByText('Post hidden', { exact: true })).toBeVisible();
  await expect(theirs.getByRole('listitem', { name: 'Post by Alba' })).toHaveCount(0, { timeout: 3_000 });
  expect(sql<{ status: string }>(`SELECT status::text FROM dedications WHERE first_name='Alba'`)[0]!.status).toBe('hidden');

  await theirs.getByRole('listitem', { name: 'Post by Bruno' }).getByRole('button', { name: 'Keep' }).click();
  await expect(other.getByText('Post kept', { exact: true })).toBeVisible();
  await expect(mine.getByRole('listitem')).toHaveCount(0, { timeout: 3_000 });
  await expect(page.getByText('Nothing to review')).toBeVisible();
  expect(sql(`SELECT 1 FROM audit_log WHERE action IN ('moderation.hide','moderation.keep')`).length).toBeGreaterThanOrEqual(2);
  await ctx.close();
});

test('rules: an owner saves them; the app-side posting rules use the new values', async ({ page }) => {
  await signIn(page, OWNER.email);
  await page.goto('/moderation');
  const limit = page.getByRole('spinbutton', { name: 'Posts per person per day' });
  await expect(limit).toBeVisible();
  await limit.fill('5');
  await limit.blur();
  await page.getByRole('button', { name: 'Save rules' }).click();
  await expect(page.getByText('Rules saved', { exact: true })).toBeVisible();
  expect(sql<{ value: { dailyLimit: number } }>(`SELECT value FROM app_config WHERE key='moderation'`)[0]!.value.dailyLimit).toBe(5);
});

test('push: scheduling is validated; the quiet-hours warning counts real people; a scheduled send can be cancelled', async ({ page }) => {
  const sleeping = ZONES.find((z) => quiet(hourIn(z)))!;
  const awake = ZONES.find((z) => !quiet(hourIn(z)))!;
  for (let i = 0; i < 3; i++) person(`Sleepy${i}`, sleeping);
  for (let i = 0; i < 2; i++) person(`Awake${i}`, awake);
  person('NoPush', awake, false); // cannot be reached: not counted

  await signIn(page, OWNER.email);
  await page.goto('/notifications');
  await page.getByRole('textbox', { name: /^Title/ }).fill('E2E retreat news');
  await page.getByRole('textbox', { name: /^Message/ }).fill('A real announcement for a few people.');
  await page.getByRole('combobox', { name: 'Audience' }).selectOption('country');
  await page.getByRole('textbox', { name: /Countries/ }).fill(COUNTRY);
  await expect(page.getByText('5 people with push on')).toBeVisible();
  await page.getByRole('combobox', { name: 'When' }).selectOption('now');
  await expect(page.getByText(/3 of them are in quiet hours \(22:00–07:00 their time\)/)).toBeVisible();

  // a time in the past is refused before anything is sent
  await page.getByRole('combobox', { name: 'When' }).selectOption('scheduled');
  await page.getByLabel(/Send at/).fill('2020-01-01T10:00');
  await page.getByRole('button', { name: 'Schedule' }).click();
  await expect(page.getByText('Pick a time in the future')).toBeVisible();
  expect(sql(`SELECT 1 FROM notifications WHERE title = 'E2E retreat news'`)).toHaveLength(0);

  const at = new Date(Date.now() + 3 * 86_400_000);
  const local = new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await page.getByLabel(/Send at/).fill(local);
  await page.getByRole('button', { name: 'Schedule' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Schedule' }).click();
  await expect(page.getByText('Scheduled', { exact: true }).first()).toBeVisible();
  const row = sql<{ status: string; targeted: number; countries: string[] }>(
    `SELECT status::text, targeted, countries FROM notifications WHERE title = 'E2E retreat news'`,
  )[0]!;
  expect(row).toMatchObject({ status: 'scheduled', targeted: 5, countries: [COUNTRY] });

  const item = page.getByRole('list', { name: 'Announcements' }).getByRole('listitem').filter({ hasText: 'E2E retreat news' });
  await item.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel announcement' }).click();
  await expect(item).toContainText('Cancelled');
  expect(sql<{ status: string }>(`SELECT status::text FROM notifications WHERE title = 'E2E retreat news'`)[0]!.status).toBe('cancelled');
});

test('roles: an editor drafts a push but cannot send it; a moderator has no push screen', async ({ page, browser }) => {
  await signIn(page, roleEmail('editor'));
  await page.goto('/notifications');
  await page.getByRole('textbox', { name: /^Title/ }).fill('E2E editor draft');
  await page.getByRole('textbox', { name: /^Message/ }).fill('Only a draft.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Send now|Schedule/ })).toHaveCount(0);
  expect(sql<{ status: string }>(`SELECT status::text FROM notifications WHERE title = 'E2E editor draft'`)[0]!.status).toBe('draft');

  const ctx = await browser.newContext();
  const mod = await ctx.newPage();
  await signIn(mod, roleEmail('moderator'));
  await mod.goto('/notifications');
  await expect(mod.getByText('No permission')).toBeVisible();
  await ctx.close();
});
