import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API, flushRedis, OWNER, resetAdmins, roleEmail, sql } from './harness';
import { forgetTwoStep, signIn } from './signin';

// Phase P9 exit tests (flag on/off), against the real backend: each coming-soon feature is closed to the app while
// its switch is off and opens the moment an owner switches it on in Settings; gratitude posts are moderated in the
// CMS; breathing templates and lessons made in the CMS are what the app's Breathwork screen gets.

test.describe.configure({ mode: 'serial' });
test.setTimeout(150_000);

const app = { 'x-platform': 'ios', 'x-app-version': '1.0.0' };
let member: { id: string; token: string };

/** A member with an account, as the app has one. */
async function makeMember(request: APIRequestContext, name: string) {
  const g = await request.post(`${API}/v1/auth/guest`, {
    data: { installId: `e2e-${Math.random().toString(36).slice(2, 12)}`, platform: 'ios', appVersion: '1.0.0', timezone: 'UTC' },
  });
  const { me } = (await g.json()).data as { me: { id: string } };
  sql(`UPDATE users SET first_name=$2, is_guest=false, email=$3, country='AT' WHERE id=$1`, [
    me.id,
    name,
    `e2e-${me.id.slice(0, 8)}@example.com`,
  ]);
  sql(`INSERT INTO entitlements (user_id, active, product_id, period_type, expires_at) VALUES ($1, true, 'wehum_annual', 'normal', now() + interval '30 days') ON CONFLICT (user_id) DO NOTHING`, [me.id]); // prettier-ignore
  flushRedis(); // the entitlement is cached; a fresh token then carries the account and membership
  const refresh = await request.post(`${API}/v1/auth/refresh`, { data: { refreshToken: (await g.json()).data.refreshToken } });
  return { id: me.id, token: (await refresh.json()).data.accessToken as string };
}
const appGet = (request: APIRequestContext, path: string) =>
  request.get(`${API}${path}`, { headers: { Authorization: `Bearer ${member.token}`, ...app } });

async function switchFeatures(page: Page, names: string[], on: boolean) {
  await page.goto('/settings?tab=releases');
  for (const n of names) {
    const sw = page.getByRole('switch', { name: n });
    if ((await sw.getAttribute('aria-checked')) !== String(on)) await sw.click();
  }
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Settings saved', { exact: true })).toBeVisible();
}

test.beforeAll(async ({ request }) => {
  resetAdmins();
  forgetTwoStep();
  flushRedis();
  sql(`DELETE FROM gratitude_posts`);
  member = await makeMember(request, 'Hannah');
});
test.beforeEach(() => flushRedis());

test('flags off: the app gets FEATURE_OFF; an owner switches them on in Settings; the app opens them at once', async ({
  page,
  request,
}) => {
  await signIn(page, OWNER.email);
  await switchFeatures(page, ['Challenges', 'Gratitude feed', 'Breathwork', 'Milestones'], false);
  for (const path of ['/v1/challenges', '/v1/gratitude', '/v1/breathwork', '/v1/me/milestones']) {
    const r = await appGet(request, path);
    expect(r.status(), path).toBe(404);
    expect((await r.json()).error.code, path).toBe('FEATURE_OFF');
  }
  await switchFeatures(page, ['Challenges', 'Gratitude feed', 'Breathwork', 'Milestones'], true);
  for (const path of ['/v1/challenges', '/v1/gratitude', '/v1/breathwork', '/v1/me/milestones'])
    expect((await appGet(request, path)).status(), path).toBe(200);
});

test('gratitude: a reported post waits in the CMS tab; keeping it puts it back in the app feed', async ({ page, request }) => {
  const share = await request.post(`${API}/v1/gratitude`, {
    headers: { Authorization: `Bearer ${member.token}`, ...app },
    data: { kind: 'gratitude', text: 'The first cold morning and a warm cup of tea.' },
  });
  expect(share.status()).toBe(201);
  const id = (await share.json()).data.id as string;
  // three people report it: it is hidden and waits for review
  for (const n of ['R1', 'R2', 'R3']) {
    const r = await makeMember(request, n);
    await request.post(`${API}/v1/gratitude/${id}/report`, {
      headers: { Authorization: `Bearer ${r.token}`, ...app },
      data: { reason: 'spam' },
    });
  }
  expect(sql<{ status: string }>(`SELECT status::text FROM gratitude_posts WHERE id=$1`, [id])[0]!.status).toBe('hidden');

  await signIn(page, roleEmail('moderator'));
  await page.goto('/moderation');
  await page.getByRole('tab', { name: 'Gratitude feed' }).click();
  const post = page.getByRole('list', { name: 'Posts' }).getByRole('listitem', { name: 'Post by Hannah' });
  await expect(post).toContainText('Reported ×3 · spam');
  await post.getByRole('button', { name: 'Show again' }).click();
  await expect(page.getByText('Post kept', { exact: true })).toBeVisible();
  await expect(post).toHaveCount(0);
  const feed = (await (await appGet(request, '/v1/gratitude?kind=gratitude')).json()).data as { id: string }[];
  expect(feed.map((p) => p.id)).toContain(id);
  expect(sql(`SELECT 1 FROM audit_log WHERE action='gratitude.keep' AND target_id=$1`, [id])).toHaveLength(1);
});

test('breathwork: a template and the lessons made in the CMS are what the app gets', async ({ page, request }) => {
  await signIn(page, roleEmail('editor'));
  await page.goto('/coming-soon');
  await page.getByRole('button', { name: 'New template' }).click();
  const dialog = page.getByRole('dialog', { name: 'New breathing template' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('E2E Coherent');
  await dialog.getByRole('textbox', { name: 'Subtitle' }).fill('Five and five');
  for (const [beat, n] of [
    ['In', '5'],
    ['Out', '5'],
  ] as const) {
    await dialog.getByRole('spinbutton', { name: beat }).fill(n);
    await dialog.getByRole('spinbutton', { name: beat }).blur();
  }
  await dialog.getByRole('combobox', { name: 'Status' }).selectOption('live');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Template added', { exact: true })).toBeVisible();

  const pick = page.getByRole('combobox', { name: 'Add a lesson' });
  const first = await pick.locator('option:not([value=""])').first().getAttribute('value');
  await pick.selectOption(first!);
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Save lessons' }).click();
  await expect(page.getByText('Lessons saved', { exact: true })).toBeVisible();

  const bw = (await (await appGet(request, '/v1/breathwork')).json()).data as {
    templates: { name: string; inhaleSec: number; exhaleSec: number }[];
    lessons: { lesson: number; session: { id: string } }[];
  };
  expect(bw.templates).toContainEqual(expect.objectContaining({ name: 'E2E Coherent', inhaleSec: 5, exhaleSec: 5 }));
  expect(bw.lessons).toEqual([expect.objectContaining({ lesson: 1, session: expect.objectContaining({ id: first }) })]);
});

test('milestones: the CMS lists the 12 awards with how many people reached each', async ({ page, request }) => {
  await appGet(request, '/v1/me/milestones'); // the member opens the screen
  await signIn(page, OWNER.email);
  await page.goto('/coming-soon');
  const list = page.getByRole('list', { name: 'Milestones' });
  await expect(list.getByRole('listitem')).toHaveCount(12);
  await expect(list).toContainText('First meditation');
});

test('challenges: the CMS shows people in a challenge and the finish rate from real joins', async ({ page, request }) => {
  const [c] = sql<{ id: string }>(
    `INSERT INTO challenges (id, name, days, counts, status) VALUES (gen_random_uuid(), 'E2E 7 days', 7, 'any', 'live') RETURNING id`,
  );
  expect(
    (await request.post(`${API}/v1/challenges/${c!.id}/join`, { headers: { Authorization: `Bearer ${member.token}`, ...app } })).status(),
  ).toBe(200);
  await signIn(page, OWNER.email);
  await page.goto('/challenges');
  const row = page.getByRole('button', { name: /E2E 7 days/ }).first();
  await expect(row).toContainText('1');
});
