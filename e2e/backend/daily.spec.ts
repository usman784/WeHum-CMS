import { expect, test, type Page } from '@playwright/test';
import { API, flushRedis, OWNER, resetAdmins, roleEmail, sql } from './harness';
import { appGet, makeTone, proxyS3 } from './s3';
import { apiToken, forgetTwoStep, signIn } from './signin';

// Phase P4 exit tests, against the real backend, worker and storage: the Today screen (choose, three lengths, swap),
// daily messages, SoS, group meditation and the 409 dialog between two admins. The app side is checked through the
// same endpoints a phone uses.

test.describe.configure({ mode: 'serial' });
test.setTimeout(150_000);

const DAY = 86_400_000;
const day = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
const label = (d: string) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${d}T00:00:00Z`),
  );
const monday = (d: string) =>
  new Date(Date.parse(`${d}T00:00:00Z`) - ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);

test.beforeAll(() => {
  resetAdmins();
  forgetTwoStep();
  flushRedis();
  sql(`DELETE FROM motd_variants WHERE date >= $1`, [day(0)]);
  sql(`DELETE FROM motd_days WHERE date >= $1`, [day(0)]);
  sql(`DELETE FROM daily_messages WHERE date >= $1`, [day(0)]);
});
test.beforeEach(async ({ page }) => {
  flushRedis();
  await signIn(page, OWNER.email);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
});

/** Titles of published premium meditations that can be a Meditation of the Day. */
const candidates = () =>
  sql<{ id: string; title: string }>(
    `SELECT DISTINCT ON (title) id, title FROM sessions WHERE status='live' AND NOT is_sos AND type <> 'youtube' AND title NOT IN (SELECT title FROM sessions GROUP BY title HAVING count(*) > 1) ORDER BY title LIMIT 3`,
  );

async function openToday(page: Page, around: string) {
  await page.goto('/today');
  await expect(page.getByRole('list', { name: 'Days of the week' })).toBeVisible();
  if (monday(around) !== monday(day(0))) await page.getByRole('button', { name: 'Next week' }).click();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: label(around) })
      .first(),
  ).toBeVisible();
}
const dayRow = (page: Page, d: string) =>
  page
    .getByRole('list', { name: 'Days of the week' })
    .getByRole('listitem')
    .filter({ hasText: label(d) });

async function choose(page: Page, d: string, title: string) {
  await dayRow(page, d)
    .getByRole('button', { name: /^(Change|Choose)/ })
    .click();
  const dialog = page.getByRole('dialog', { name: `Meditation for ${label(d)}` });
  await dialog
    .getByRole('button', { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    .first()
    .click();
  await expect(page.getByText(`${label(d)} saved`, { exact: true })).toBeVisible();
}

test('Today: choose a meditation, add its three lengths one by one; the app sees each length', async ({ page, request }) => {
  const s3 = await proxyS3(page);
  void s3;
  const [a] = candidates();
  const d = day(1);
  await openToday(page, d);
  await choose(page, d, a!.title);
  expect(sql<{ session_id: string }>(`SELECT session_id FROM motd_days WHERE date=$1`, [d])[0]!.session_id).toBe(a!.id);
  expect((await appGet<{ sessionId: string; lengths: number[] }>(request, `/v1/motd/${d}`)).data).toMatchObject({
    sessionId: a!.id,
    lengths: [],
  });
  await expect(dayRow(page, d)).toContainText('Missing 10 min, 30 min, 45 min');

  await dayRow(page, d).locator('button[aria-pressed]').click();
  for (const len of [10, 30, 45]) {
    await page.getByLabel(`${len} min audio`).setInputFiles(makeTone(`motd-${len}.wav`, 4));
    await expect(page.getByText(`${len} min saved`, { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(async () => (await appGet<{ lengths: number[] }>(request, `/v1/motd/${d}`)).data.lengths.length)
      .toBeGreaterThanOrEqual([10, 30, 45].indexOf(len) + 1);
  }
  await expect(dayRow(page, d)).toContainText('10 · 30 · 45 min ready');
  expect((await appGet<{ lengths: number[] }>(request, `/v1/motd/${d}`)).data.lengths).toEqual([10, 30, 45]);
  expect(sql(`SELECT 1 FROM motd_variants WHERE date=$1`, [d])).toHaveLength(3);
  const token = await apiToken(request, OWNER.email);
  const range = await request.get(`${API}/v1/admin/motd?from=${d}&to=${d}`, { headers: { Authorization: `Bearer ${token}` } });
  expect((await range.json()).data[0]).toMatchObject({ date: d, complete: true });
  expect(sql(`SELECT 1 FROM audit_log WHERE action='motd.variant'`).length).toBeGreaterThanOrEqual(3);
});

test('Today: "Move date" swaps two days with their three lengths; the past cannot be changed', async ({ page, request }) => {
  const [a, b] = candidates();
  const [d1, d2] = [day(1), day(2)];
  await openToday(page, d2);
  await choose(page, d2, b!.title);
  await openToday(page, d1);
  await dayRow(page, d1)
    .getByRole('button', { name: /^Move the date/ })
    .click();
  const dialog = page.getByRole('dialog', { name: /^Move “/ });
  await dialog.getByLabel('Swap with the meditation of').fill(d2);
  await dialog.getByRole('button', { name: 'Swap days' }).click();
  await expect(page.getByText(`${label(d1)} and ${label(d2)} swapped`)).toBeVisible();
  const days = Object.fromEntries(
    sql<{ date: string; session_id: string }>(`SELECT date::text, session_id FROM motd_days WHERE date IN ($1,$2)`, [d1, d2]).map((r) => [
      r.date,
      r.session_id,
    ]),
  );
  expect(days).toEqual({ [d1]: b!.id, [d2]: a!.id });
  expect(sql(`SELECT 1 FROM motd_variants WHERE date=$1`, [d2])).toHaveLength(3); // the lengths went with the meditation
  expect(sql(`SELECT 1 FROM motd_variants WHERE date=$1`, [d1])).toHaveLength(0);
  expect((await appGet<{ sessionId: string; lengths: number[] }>(request, `/v1/motd/${d1}`)).data).toMatchObject({
    sessionId: b!.id,
    lengths: [],
  });

  // yesterday is history: the API refuses, and the screen shows no buttons for it
  const token = await apiToken(request, OWNER.email);
  const past = await request.put(`${API}/v1/admin/motd/${day(-1)}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { sessionId: a!.id },
  });
  expect(past.status()).toBe(422);
});

test('Today rules: saved, seen by the app config, and a second admin gets the 409 dialog', async ({ page, request, browser }) => {
  const ctx = await browser.newContext();
  await signIn(await ctx.newPage(), roleEmail('editor'));
  await ctx.close();
  const editorToken = await apiToken(request, roleEmail('editor'));
  await page.goto('/today');
  const free = page.getByLabel('“Free for you” shows first');
  await expect(free).toBeVisible();
  const was = await free.inputValue();
  const next = was === 'newest' ? 'random' : 'newest';
  await free.selectOption(next);
  // the editor saves different rules first
  const cur = await request.get(`${API}/v1/admin/config/today`, { headers: { Authorization: `Bearer ${editorToken}` } });
  const doc = (await cur.json()).data as { version: number; value: Record<string, unknown> };
  const theirs = await request.put(`${API}/v1/admin/config/today`, {
    headers: { Authorization: `Bearer ${editorToken}`, 'If-Match': `"v${doc.version}"` },
    data: { ...doc.value, emptyRoomThreshold: 33 },
  });
  expect(theirs.status()).toBe(200);
  await page.getByRole('button', { name: 'Save changes' }).click();
  const dialog = page.getByRole('dialog', { name: 'This was changed while you were editing' });
  await expect(dialog).toBeVisible();
  expect(
    sql<{ value: { emptyRoomThreshold: number } }>(`SELECT value FROM app_config WHERE key='today'`)[0]!.value.emptyRoomThreshold,
  ).toBe(33);
  await dialog.getByRole('button', { name: 'Keep my changes' }).click();
  await expect
    .poll(
      () =>
        sql<{ value: { freeHomePick: string; emptyRoomThreshold: number } }>(`SELECT value FROM app_config WHERE key='today'`)[0]!.value,
    )
    .toMatchObject({ freeHomePick: next, emptyRoomThreshold: 33 }); // my change on top, their other change kept
});

test('Daily messages: publish today, schedule tomorrow, delete; the missing-days warning follows', async ({ page }) => {
  const [today, tomorrow] = [day(0), day(1)];
  await page.goto('/daily-messages');
  await expect(page.getByRole('list', { name: /^Days of / })).toBeVisible();
  await expect(page.getByText(/of the next 7 days have|has no message/)).toBeVisible();

  const panel = (d: string) => page.getByRole('complementary', { name: `Message for ${label(d)}` });
  const write = async (d: string, title: string, text: string, button: string) => {
    if (d.slice(0, 7) !== today.slice(0, 7)) await page.getByRole('button', { name: 'Next month' }).click();
    await page
      .getByRole('button', { name: new RegExp(`^${label(d)}`) })
      .first()
      .click();
    const p = panel(d);
    await p.getByRole('radio', { name: 'Text' }).click();
    await p.getByLabel('Title').fill(title);
    await p.getByLabel('Text').fill(text);
    await p.getByRole('button', { name: button }).click();
  };
  await write(today, 'E2E today', 'Here and now.', 'Publish now');
  await expect(page.getByRole('region', { name: /Notifications/ }).getByText('Published', { exact: true })).toBeVisible();
  expect(sql<{ status: string }>(`SELECT status FROM daily_messages WHERE date=$1`, [today])[0]!.status).toBe('live');

  await write(tomorrow, 'E2E tomorrow', 'See you tomorrow.', 'Schedule');
  await expect(page.getByText(`Scheduled for ${label(tomorrow)}`, { exact: true }).first()).toBeVisible();
  expect(sql<{ status: string; text: string }>(`SELECT status, text FROM daily_messages WHERE date=$1`, [tomorrow])[0]).toMatchObject({
    status: 'scheduled',
    text: 'See you tomorrow.',
  });

  // the scheduled message is deleted again
  await panel(tomorrow).getByRole('button', { name: 'Delete this message' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete message' }).click();
  await expect(page.getByText('Message deleted', { exact: true })).toBeVisible();
  expect(sql(`SELECT 1 FROM daily_messages WHERE date=$1`, [tomorrow])).toHaveLength(0);
  expect(sql(`SELECT 1 FROM audit_log WHERE action='dailyMessage.delete'`).length).toBeGreaterThanOrEqual(1);
});

test('SoS: add a tile, reorder it with the keyboard, change the texts; the app sees all of it', async ({ page, request }) => {
  const tiles = () => sql<{ id: string }>(`SELECT id FROM sessions WHERE is_sos ORDER BY sos_order, id`).map((r) => r.id);
  let before = tiles();
  const extra = sql<{ id: string; title: string }>(
    `SELECT id, title FROM sessions WHERE status='live' AND NOT is_sos AND type <> 'youtube' AND title NOT IN (SELECT title FROM sessions GROUP BY title HAVING count(*) > 1) ORDER BY title LIMIT 1`,
  )[0]!;
  await page.goto('/sos');
  await expect(page.getByRole('list', { name: 'SoS tiles' })).toBeVisible();
  if (before.length >= 8) {
    // the screen holds at most 8 tiles: the button is off until one is removed
    await expect(page.getByRole('button', { name: 'Add SoS session' })).toBeDisabled();
    await page
      .getByRole('button', { name: /^Remove .* from SoS$/ })
      .last()
      .click();
    await expect.poll(() => tiles().length).toBe(before.length - 1);
    before = tiles();
  }
  await page.getByRole('button', { name: 'Add SoS session' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a SoS session' });
  await dialog
    .getByRole('button', { name: new RegExp(extra.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    .first()
    .click();
  await expect.poll(tiles).toEqual([...before, extra.id]);
  const app = await appGet<{ tiles: { sessionId: string }[] }>(request, '/v1/sos');
  expect(app.data.tiles.map((t) => t.sessionId)).toEqual([...before, extra.id]);

  // move the new tile to the top with the keyboard
  await expect(page.getByRole('button', { name: /^Reorder / })).toHaveCount(before.length + 1);
  await page.waitForTimeout(1500); // our own change comes back over the socket and refreshes the list (debounced 0.5 s): not while dragging
  const handle = page.getByRole('button', { name: /^Reorder / }).last();
  await handle.focus();
  await page.keyboard.press('Space');
  const total = before.length + 1;
  for (let i = 1; i <= before.length; i++) {
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('status').filter({ hasText: `is over position ${total - i} of ${total}.` })).toHaveCount(1);
  }
  await page.keyboard.press('Space');
  await expect.poll(tiles).toEqual([extra.id, ...before]);

  await page.getByLabel('Title', { exact: true }).fill('E2E: how can we help?');
  await page.getByRole('button', { name: 'Save texts' }).click();
  await expect(page.getByText('SoS texts saved', { exact: true })).toBeVisible();
  const fresh = await appGet<{ title: string; tiles: { sessionId: string }[] }>(request, '/v1/sos');
  expect(fresh.data.title).toBe('E2E: how can we help?');
  expect(fresh.data.tiles[0]!.sessionId).toBe(extra.id);

  // and it can be taken off again
  await page
    .getByRole('button', { name: new RegExp(`^Remove .* from SoS$`) })
    .first()
    .click();
  await expect.poll(() => tiles().length).toBe(before.length);
});

test('Group meditation: a new start time reaches the app; a second admin gets the 409 dialog', async ({ page, request, browser }) => {
  const ctx = await browser.newContext();
  await signIn(await ctx.newPage(), roleEmail('editor'));
  await ctx.close();
  const editorToken = await apiToken(request, roleEmail('editor'));
  const d = day(1);
  await page.goto('/group-meditation');
  const time = page.getByLabel(/Start time/);
  await expect(time).toBeVisible();
  await time.fill('18:30');
  await page.getByLabel('Length used for the group start').selectOption('45');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Group meditation saved', { exact: true })).toBeVisible();
  expect(sql<{ value: { startUtc: string; lengthMin: number } }>(`SELECT value FROM app_config WHERE key='group'`)[0]!.value).toMatchObject(
    { startUtc: '18:30', lengthMin: 45 },
  );
  const motd = await appGet<{ group: { startUtc: string; lengthMin: number } }>(request, `/v1/motd/${d}`);
  expect(motd.data.group).toEqual({ startUtc: '18:30', lengthMin: 45 });

  // 409: the editor changes the lobby while this page has the old version open
  await page.getByLabel('Length used for the group start').selectOption('10');
  const cur = (await (await request.get(`${API}/v1/admin/group`, { headers: { Authorization: `Bearer ${editorToken}` } })).json()).data as {
    version: number;
    value: Record<string, unknown>;
  };
  const theirs = await request.put(`${API}/v1/admin/group`, {
    headers: { Authorization: `Bearer ${editorToken}`, 'If-Match': `"v${cur.version}"` },
    data: { ...cur.value, lobbyOpenMin: 20 },
  });
  expect(theirs.status()).toBe(200);
  await page.getByRole('button', { name: 'Save' }).click();
  const dialog = page.getByRole('dialog', { name: 'This was changed while you were editing' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep my changes' }).click();
  await expect
    .poll(() => sql<{ value: { lengthMin: number; lobbyOpenMin: number } }>(`SELECT value FROM app_config WHERE key='group'`)[0]!.value)
    .toMatchObject({ lengthMin: 10, lobbyOpenMin: 20 });
});

test('roles: an editor has the four screens, a moderator none', async ({ browser }) => {
  for (const [email, allowed] of [
    [roleEmail('editor'), true],
    [roleEmail('moderator'), false],
  ] as const) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, email);
    for (const [path, h1] of [
      ['/today', 'Today Screen'],
      ['/daily-messages', 'Daily Messages'],
      ['/sos', 'SoS sessions'],
      ['/group-meditation', 'Group meditation'],
    ] as const) {
      // prettier-ignore
      await page.goto(path);
      if (allowed) await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
      else await expect(page.getByText('No permission')).toBeVisible();
    }
    await ctx.close();
  }
});
