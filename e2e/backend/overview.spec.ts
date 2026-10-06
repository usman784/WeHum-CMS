import { expect, test, type Page } from '@playwright/test';
import { API, flushRedis, OWNER, publish, redis, resetAdmins, roleEmail, sql } from './harness';
import { apiToken, forgetTwoStep, signIn } from './signin';

// Phase P5 exit tests, against the real backend: the dashboard shows the live numbers (on load and pushed over the
// socket), "needs attention" follows the data (a missing daily message, a MOTD without all lengths), and a moderator
// gets only the moderation slice.

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const DAY = 86_400_000;
const day = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
const label = (d: string) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${d}T00:00:00Z`),
  );

const attention = (page: Page) => page.getByRole('list', { name: 'Needs attention' });
const tile = (page: Page, name: string) => page.getByText(name, { exact: true }).locator('..');

/** A user with one flagged dedication: what a moderator has to review. */
function flaggedDedication() {
  const [user] = sql<{ id: string }>(`INSERT INTO users (id, first_name, is_guest) VALUES (gen_random_uuid(), 'E2E', true) RETURNING id`);
  const [session] = sql<{ id: string }>(`SELECT id FROM sessions WHERE status='live' ORDER BY id LIMIT 1`);
  sql(
    `INSERT INTO dedications (id, session_id, user_id, meditation_id, first_name, country, text, status, report_count)
     VALUES (gen_random_uuid(), $1, $2, gen_random_uuid(), 'E2E', 'DE', 'For everyone tonight', 'flagged', 1)`,
    [session!.id, user!.id],
  );
}

test.beforeAll(() => {
  resetAdmins();
  forgetTwoStep();
  flushRedis();
  sql(`DELETE FROM dedications`);
  sql(`DELETE FROM daily_messages WHERE date >= $1`, [day(-7)]);
  sql(`DELETE FROM motd_variants WHERE date >= $1`, [day(0)]);
  sql(`DELETE FROM motd_days WHERE date >= $1`, [day(0)]);
});

test('owner: live numbers on load and over the socket; "needs attention" names the missing message and lengths', async ({
  page,
  request,
}) => {
  // tomorrow has a Meditation of the Day without any lengths yet; nobody wrote today's message
  const [motd] = sql<{ id: string; title: string }>(
    `SELECT id, title FROM sessions WHERE status='live' AND NOT is_sos AND type <> 'youtube' ORDER BY title LIMIT 1`,
  );
  sql(`INSERT INTO motd_days (date, session_id) VALUES ($1, $2)`, [day(1), motd!.id]);
  // what the presence engine last wrote (no scheduler runs in these tests)
  redis('set', 'live:agg:last', JSON.stringify({ total: 1234, countries: 7 }));

  await signIn(page, OWNER.email);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(tile(page, 'Meditating right now')).toContainText('1,234');
  await expect(tile(page, 'Meditating right now')).toContainText('Across 7 countries');

  // the library tile matches the database
  const [lib] = sql<{ sessions: number; programs: number; themes: number }>(
    `SELECT (SELECT count(*) FROM sessions WHERE status='live')::int AS sessions, (SELECT count(*) FROM programs WHERE status='live')::int AS programs, (SELECT count(*) FROM themes WHERE visible)::int AS themes`,
  );
  await expect(tile(page, 'Library')).toContainText(`${lib!.programs} programs · ${lib!.themes} themes`);

  // needs attention: today's message, tomorrow's three lengths; no moderation item while the queue is empty
  const list = attention(page);
  await expect(list).toContainText(`${label(day(0))}’s Daily Message is missing`);
  await expect(list).toContainText(`10-min, 30-min, 45-min version missing for ${label(day(1))}`);
  await expect(list).toContainText(`${motd!.title} needs 10, 30 and 45 min`);
  await expect(list).not.toContainText('needs review');
  await expect(page.getByRole('list', { name: 'Daily messages this week' })).toContainText('No message yet');

  // a new live number is pushed over the socket: the tile changes without a reload
  await expect(async () => {
    publish('live:agg', { total: 2001, countries: 12 });
    await expect(tile(page, 'Meditating right now')).toContainText('2,001', { timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await expect(tile(page, 'Meditating right now')).toContainText('Across 12 countries');

  // a published message for today removes that item after a reload
  sql(`INSERT INTO daily_messages (date, title, type, text, status) VALUES ($1, 'E2E today', 'text', 'Hello', 'live')`, [day(0)]);
  await page.reload();
  await expect(attention(page)).toContainText('version missing');
  await expect(attention(page)).not.toContainText(`${label(day(0))}’s Daily Message is missing`);
  await expect(page.getByRole('list', { name: 'Daily messages this week' })).toContainText('E2E today');

  // the API agrees with the screen
  const token = await apiToken(request, OWNER.email);
  const res = await (await request.get(`${API}/v1/admin/dashboard`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(res.data.kpis.liveNow).toBe(1234); // the stored snapshot; the pushed one was only on the socket
  expect(res.data.needsAttention).toContainEqual({ kind: 'motd_missing_variant', date: day(1), title: motd!.title, lengths: [10, 30, 45] });
});

test('moderator: only the moderation slice, and the open count follows the socket', async ({ page, request }) => {
  flaggedDedication();
  flushRedis();
  await signIn(page, roleEmail('moderator'));
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(attention(page)).toContainText('1 dedication needs review');
  await expect(page.getByText('Meditating right now')).toHaveCount(0);
  await expect(page.getByText('Daily Messages this week')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New session' })).toHaveCount(0);

  await expect(async () => {
    publish('moderation:count', { open: 3 });
    await expect(attention(page)).toContainText('3 dedications need review', { timeout: 1500 });
  }).toPass({ timeout: 20_000 });

  // the API itself sends no business numbers to a moderator
  const token = await apiToken(request, roleEmail('moderator'));
  const res = await (await request.get(`${API}/v1/admin/dashboard`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(Object.keys(res.data).sort()).toEqual(['at', 'moderationOpen', 'needsAttention']);
  expect(res.data.moderationOpen).toBe(1);
});

test('owner: the reported dedications come first and link to the moderation queue', async ({ page }) => {
  flushRedis();
  await signIn(page, OWNER.email);
  const first = attention(page).getByRole('listitem').first();
  await expect(first).toContainText('1 dedication needs review');
  await expect(first.getByRole('link')).toHaveAttribute('href', '/moderation');
});
