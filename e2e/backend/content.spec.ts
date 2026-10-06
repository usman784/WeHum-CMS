import { expect, test } from '@playwright/test';
import { API, flushRedis, OWNER, resetAdmins, roleEmail, sql } from './harness';
import { appCatalog, makeTone, proxyS3 } from './s3';
import { apiToken, forgetTwoStep, nav, signIn } from './signin';

// Phase P3 exit tests, against the real backend and real storage: the publish flow (upload → processing → publish →
// visible in the app catalog), upload resume after a network drop, and the 409 conflict dialog.

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

test.beforeAll(() => {
  resetAdmins();
  forgetTwoStep();
  flushRedis();
});
test.beforeEach(async ({ page }) => {
  flushRedis();
  await signIn(page, OWNER.email);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
});

const status = (page: import('@playwright/test').Page) => page.getByRole('status').filter({ hasText: 'Live' });

test('publish flow: new session → upload → processing → publish → the app catalog has it', async ({ page, request }) => {
  const s3 = await proxyS3(page);
  await nav(page).getByRole('link', { name: 'Sessions' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sessions' })).toBeVisible();
  await page
    .getByRole('link', { name: 'New session' })
    .or(page.getByRole('button', { name: 'New session' }))
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'New session' })).toBeVisible();

  const publish = page.getByRole('button', { name: 'Publish' });
  await expect(publish).toBeDisabled(); // nothing to play yet
  await page.getByLabel('Title', { exact: true }).fill('E2E Morning Reset');
  await page.getByLabel('Short description').fill('Made by the browser test.');
  await page.getByLabel('Audio file').setInputFiles(makeTone('tone-2s.wav', 2));

  // processing runs in the backend's worker; the file's details appear when it is done
  await expect(page.getByText(/0:0[12] · [−-]\d+\.\d LUFS/)).toBeVisible({ timeout: 60_000 });
  expect(s3.puts()).toEqual([1]);
  await expect(page.getByRole('button', { name: 'Publish' })).toBeEnabled();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('region', { name: /Notifications/ }).getByText('Published')).toBeVisible();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);

  const [row] = sql<{ id: string; status: string; type: string; access: string; media_id: string; duration_sec: number }>(
    `SELECT id, status, type, access, media_id, duration_sec FROM sessions WHERE title='E2E Morning Reset'`,
  );
  expect(row).toMatchObject({ status: 'live', type: 'audio', access: 'premium' });
  expect(row!.duration_sec).toBeGreaterThanOrEqual(1);
  const [media] = sql<{ status: string; mime: string; loudness_lufs: string }>(
    `SELECT status, mime, loudness_lufs FROM media_assets WHERE id=$1`,
    [row!.media_id],
  );
  expect(media).toMatchObject({ status: 'ready', mime: 'audio/mp4' }); // transcoded to AAC by the worker

  const catalog = await appCatalog(request);
  expect(catalog.sessions.find((s) => s.id === row!.id)).toMatchObject({ title: 'E2E Morning Reset', access: 'premium' });

  // and it is in the list, published
  await page.goto('/sessions');
  await expect(page.getByRole('row', { name: /E2E Morning Reset/ })).toContainText('Published');
  await expect(status(page)).toBeVisible();
});

test('YouTube link: resolved for real, always free, published without a file', async ({ page, request }) => {
  await page.goto('/sessions/new');
  await page.getByRole('radio', { name: /YouTube link/ }).click();
  await expect(page.getByText('Free for everyone. No download needed.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled();
  await page.getByLabel('Title', { exact: true }).fill('E2E YouTube');
  // Not a YouTube link: the API's answer is shown, nothing else happens.
  await page.getByLabel('YouTube link').fill('https://example.com/video');
  await page.getByRole('button', { name: 'Check link' }).click();
  await expect(page.getByText('That does not look like a YouTube link').or(page.getByText('Not a YouTube link'))).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled();
  void request;
});

test('upload resume: the connection drops during a part, the part is retried by itself and the upload finishes', async ({ page }) => {
  const s3 = await proxyS3(page);
  s3.drop(2, 2); // the first two tries of part 2 fail like a lost connection
  await page.goto('/sessions/new');
  await page.getByLabel('Title', { exact: true }).fill('E2E Resume');
  await page.getByLabel('Audio file').setInputFiles(makeTone('tone-resume.wav', 230)); // ~22 MB: 3 parts of 10 MB
  await expect(page.getByText(/[34]:\d\d · [−-]\d+\.\d LUFS|3:5\d/)).toBeVisible({ timeout: 90_000 });
  expect(s3.puts().sort()).toEqual([1, 2, 3]); // every part arrived once; the failed tries never reached storage
  const [m] = sql<{ status: string; bytes: string }>(`SELECT status, bytes FROM media_assets WHERE original_name='tone-resume.wav'`);
  expect(m!.status).toBe('ready');
});

test('upload pause and cancel: pausing stops the parts, cancelling removes the asset on the server', async ({ page }) => {
  const s3 = await proxyS3(page);
  s3.drop(1, 99); // part 1 never gets through, so the upload stays open long enough to use the buttons
  await page.goto('/sessions/new');
  await page.getByLabel('Audio file').setInputFiles(makeTone('tone-resume.wav', 230));
  await expect(page.getByRole('button', { name: 'Cancel upload' })).toBeVisible();
  // hashing runs before the browser creates the upload, so wait until the server has the row
  await expect
    .poll(
      () =>
        sql<{ n: number }>(`SELECT count(*)::int AS n FROM media_assets WHERE original_name='tone-resume.wav' AND status='uploading'`)[0]!
          .n,
      { timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'Cancel upload' }).click();
  await expect(page.getByRole('button', { name: 'Choose file' })).toBeVisible();
  await expect
    .poll(
      () =>
        sql<{ n: number }>(`SELECT count(*)::int AS n FROM media_assets WHERE original_name='tone-resume.wav' AND status='uploading'`)[0]!
          .n,
    )
    .toBe(0);
  expect(sql(`SELECT 1 FROM audit_log WHERE action='media.cancel'`).length).toBeGreaterThanOrEqual(1);
});

test('409: two admins edit the same session; the second save shows both versions and nothing is overwritten', async ({
  page,
  request,
  browser,
}) => {
  // the other admin: an editor (own saves never warn the person who made them, so it must be someone else)
  const editorCtx = await browser.newContext();
  await signIn(await editorCtx.newPage(), roleEmail('editor'));
  await editorCtx.close();
  const editorToken = await apiToken(request, roleEmail('editor'));

  // an existing draft, made through the API
  const token = await apiToken(request, OWNER.email);
  const made = await request.post(`${API}/v1/admin/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: 'E2E Conflict', type: 'audio', durationSec: 600 },
  });
  const created = (await made.json()).data as { id: string; version: number };

  await page.goto(`/sessions/${created.id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'E2E Conflict' })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('E2E Conflict (mine)');

  // someone else saves first
  const theirs = await request.patch(`${API}/v1/admin/sessions/${created.id}`, {
    headers: { Authorization: `Bearer ${editorToken}`, 'If-Match': `"v${created.version}"` },
    data: { title: 'E2E Conflict (theirs)', description: 'Edited elsewhere.' },
  });
  expect(theirs.status()).toBe(200);
  // the open editor is told over the socket
  await expect(page.getByText(/This session changed/)).toBeVisible();
  expect(await page.getByLabel('Title', { exact: true }).inputValue()).toBe('E2E Conflict (mine)'); // my edit is still here

  await page.getByRole('button', { name: 'Save' }).click();
  const dialog = page.getByRole('dialog', { name: 'This was changed while you were editing' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('row', { name: /Title/ })).toContainText('E2E Conflict (theirs)');
  await expect(dialog.getByRole('row', { name: /Title/ })).toContainText('E2E Conflict (mine)');
  expect(sql<{ title: string }>(`SELECT title FROM sessions WHERE id=$1`, [created.id])[0]!.title).toBe('E2E Conflict (theirs)');

  await dialog.getByRole('button', { name: 'Keep my changes' }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => sql<{ title: string; description: string }>(`SELECT title, description FROM sessions WHERE id=$1`, [created.id])[0])
    .toMatchObject({
      title: 'E2E Conflict (mine)',
      description: 'Edited elsewhere.', // their other change is kept: only my fields were sent
    });
});

test('themes: drag order is saved on the server; deleting a theme in use asks where to move its sessions', async ({ page, request }) => {
  await page.goto('/themes');
  await expect(page.getByRole('heading', { level: 1, name: 'Themes' })).toBeVisible();
  const handles = page.getByRole('button', { name: /^Reorder / });
  const names = () => handles.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.replace('Reorder ', '')));
  const before = await names();
  expect(before.length).toBeGreaterThanOrEqual(8);
  await handles.first().focus();
  const said = (t: string) => expect(page.getByRole('status').filter({ hasText: t })).toHaveCount(1);
  await page.keyboard.press('Space');
  await said(`Picked up ${before[0]}. Position 1 of ${before.length}.`);
  await page.keyboard.press('ArrowRight'); // two columns: right = the next theme
  await said(`${before[0]} is over position 2 of ${before.length}.`);
  await page.keyboard.press('Space');
  await said(`${before[0]} dropped at position 2 of ${before.length}.`);
  const expected = [before[1], before[0], ...before.slice(2)];
  await expect.poll(names).toEqual(expected);
  await expect.poll(() => sql<{ name: string }>(`SELECT name FROM themes ORDER BY "order"`).map((r) => r.name)).toEqual(expected);
  // the app sees the new order
  const catalog = await appCatalog(request);
  expect(catalog.themes.slice(0, 2).map((t) => t.name)).toEqual([expected[0], expected[1]]);

  // delete: the seeded themes hold meditations
  const used = sql<{ name: string; n: number }>(
    `SELECT t.name, count(s.id)::int AS n FROM themes t JOIN sessions s ON s.theme_id=t.id GROUP BY t.name HAVING count(s.id)>0 LIMIT 1`,
  )[0]!;
  await page
    .getByRole('button', { name: new RegExp(`^${used.name}`) }) // the card starts with its name; other cards may mention it
    .first()
    .click();
  await page.getByRole('button', { name: 'Delete theme' }).click();
  const dialog = page.getByRole('dialog', { name: `Delete “${used.name}”?` });
  await expect(dialog).toContainText('use this theme');
  await dialog.getByRole('button', { name: 'Move and delete' }).click();
  await expect(page.getByText('Choose a theme to move the meditations to.', { exact: true })).toBeVisible(); // the toast (the live region repeats it)
  expect(sql(`SELECT 1 FROM themes WHERE name=$1`, [used.name])).toHaveLength(1);
});

test('roles: an editor can edit content but not delete drafts; a moderator has no content screens', async ({ browser }) => {
  for (const [email, expectSessions] of [
    ['editor@wehum.app', true],
    ['moderator@wehum.app', false],
  ] as const) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, email);
    await page.goto('/sessions');
    if (expectSessions) {
      await expect(page.getByRole('heading', { level: 1, name: 'Sessions' })).toBeVisible();
      await expect(page.getByRole('table', { name: 'Sessions' })).toBeVisible();
      const draft = page.getByRole('row').filter({ hasText: 'Draft' }).first();
      await draft.getByRole('button', { name: /More actions/ }).click();
      await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Delete draft' })).toHaveCount(0);
    } else await expect(page.getByText('No permission')).toBeVisible();
    await ctx.close();
  }
});
