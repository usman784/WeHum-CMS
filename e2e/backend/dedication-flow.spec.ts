import { expect, test } from '@playwright/test';
import { API, flushRedis, OWNER, resetAdmins, roleEmail, sql } from './harness';
import { forgetTwoStep, signIn } from './signin';

// A dedication written in the app, end to end on the real backend, with NO tab clicked first: the screen opens on
// "All posts" and shows it at once; a flagged one lands in "Needs review"; hide / show again / keep work and reach
// the app feed; deleting the account removes the post. Screenshots go to test-results/shots/.

test.describe.configure({ mode: 'serial' });
test.setTimeout(150_000);

const CLEAN = 'For my father, healing slowly in Lahore.';
const CRISIS = 'I keep thinking about self harm tonight.';
const shot = (n: string) => `test-results/shots/dedication-${n}.png`;

test.beforeAll(() => {
  resetAdmins();
  forgetTwoStep();
  flushRedis();
  sql(`DELETE FROM dedications`);
});

test('write in the app → CMS shows it at once → review, hide, keep → delete the account', async ({ page, request, browser }) => {
  const guest = await (await request.post(`${API}/v1/auth/guest`, { data: { installId: `e2e-${Date.now()}`, platform: 'android', appVersion: '1.0.0', timezone: 'Asia/Karachi' } })).json();
  const userId = guest.data.me.id as string;
  sql(`UPDATE users SET is_guest=false, first_name='Usman', country='PK', show_country=true WHERE id=$1`, [userId]);
  sql(`INSERT INTO entitlements (user_id, active, product_id, period_type, expires_at) VALUES ($1, true, 'wehum_annual', 'normal', now() + interval '30 days')`, [userId]); // prettier-ignore
  const token = (await (await request.post(`${API}/v1/auth/refresh`, { data: { refreshToken: guest.data.refreshToken } })).json()).data.accessToken as string;
  const auth = { authorization: `Bearer ${token}` };
  const [s] = sql<{ id: string }>(`SELECT id FROM sessions WHERE status='live' ORDER BY title LIMIT 1`);
  const feed = async () => ((await (await request.get(`${API}/v1/sessions/${s!.id}/dedications`, { headers: auth })).json()).data as { text: string }[]).map((d) => d.text);

  // 1. open the screen: no clicks, it is on All posts
  await signIn(page, roleEmail('moderator'));
  await page.goto('/moderation');
  await expect(page.getByRole('radio', { name: 'All posts' })).toBeChecked();
  await expect(page.getByText('No posts here')).toBeVisible();

  // 2. write in the app: it arrives without a reload
  expect((await request.post(`${API}/v1/dedications`, { headers: auth, data: { sessionId: s!.id, text: CLEAN } })).status()).toBe(201);
  const list = page.getByRole('list', { name: 'Posts' });
  const clean = list.getByRole('listitem', { name: 'Post by Usman' });
  await expect(clean).toContainText(CLEAN, { timeout: 5_000 });
  await page.screenshot({ path: shot('1-all-posts-shows-new'), fullPage: true });
  expect(await feed()).toContain(CLEAN);

  // 3. a normal post is not a review item
  await page.getByRole('radio', { name: /^Needs review/ }).click();
  await expect(page.getByText('Nothing to review')).toBeVisible();
  await page.screenshot({ path: shot('2-needs-review-empty'), fullPage: true });

  // 4. a crisis-word post goes to review
  expect((await request.post(`${API}/v1/dedications`, { headers: auth, data: { sessionId: s!.id, text: CRISIS } })).status()).toBe(201);
  const flagged = list.getByRole('listitem', { name: 'Post by Usman' });
  await expect(flagged).toContainText(CRISIS, { timeout: 5_000 });
  await expect(flagged).toContainText(/crisis/i);
  await page.screenshot({ path: shot('3-needs-review-flagged'), fullPage: true });
  await flagged.getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByText('Post kept', { exact: true })).toBeVisible();
  await expect(page.getByText('Nothing to review')).toBeVisible();

  // 5. hide the normal post: gone from the app feed; show it again: back
  await page.getByRole('radio', { name: 'All posts' }).click();
  const row = list.getByRole('listitem', { name: 'Post by Usman' }).filter({ hasText: CLEAN });
  await row.getByRole('button', { name: 'Hide post' }).click();
  await expect(page.getByText('Post hidden', { exact: true })).toBeVisible();
  await page.screenshot({ path: shot('4-hidden'), fullPage: true });
  expect(await feed()).not.toContain(CLEAN);
  await page.getByRole('radio', { name: 'Hidden' }).click();
  await list.getByRole('listitem', { name: 'Post by Usman' }).filter({ hasText: CLEAN }).getByRole('button', { name: 'Show again' }).click();
  await expect.poll(feed, { timeout: 5_000 }).toContain(CLEAN);
  await page.screenshot({ path: shot('5-shown-again'), fullPage: true });

  // 6. the owner deletes the account from Users (moderators cannot): its dedications go with it
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await signIn(owner, OWNER.email);
  await owner.goto(`/users/${userId}`);
  await owner.getByRole('button', { name: 'Delete account and data' }).click();
  const dialog = owner.getByRole('dialog');
  await dialog.getByRole('textbox').fill(userId.slice(0, 8));
  await owner.screenshot({ path: shot('6-delete-dialog'), fullPage: true });
  await dialog.getByRole('button', { name: /Delete account/ }).click();
  await expect.poll(() => sql(`SELECT 1 FROM dedications WHERE user_id=$1`, [userId]).length, { timeout: 60_000 }).toBe(0);
  expect(sql(`SELECT 1 FROM users WHERE id=$1 AND deleted_at IS NULL`, [userId]).length).toBe(0);
  await owner.goto('/moderation');
  await expect(owner.getByText('No posts here')).toBeVisible();
  await owner.screenshot({ path: shot('7-after-delete'), fullPage: true });
  await ownerCtx.close();
});
