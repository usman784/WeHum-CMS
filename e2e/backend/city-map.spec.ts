import { expect, test } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { API, flushRedis, OWNER, resetAdmins, spawnRole, sql } from './harness';
import { forgetTwoStep, signIn } from './signin';

// The Dashboard map "By city", live on the real backend: phones with a city (the server rounds the position), the CMS draws a
// dot per city and a list; a new city, a person leaving and a hidden country all reach the open page without a reload.
// Screenshots go to test-results/shots/.

test.describe.configure({ mode: 'serial' });
test.setTimeout(150_000);

const shot = (n: string) => `test-results/shots/city-${n}.png`;
const sockets: Socket[] = [];

let scheduler = 0;
test.beforeAll(() => {
  resetAdmins();
  forgetTwoStep();
  flushRedis();
  scheduler = spawnRole('scheduler'); // the leader computes the dashboard numbers every 5 s and pushes them over the socket
});
test.afterAll(() => {
  sockets.forEach((s) => s.close());
  try {
    process.kill(-scheduler, 'SIGTERM');
  } catch {
    // already gone
  }
});

test('phones send their city → the CMS city map and list follow live: new city, leaving, hidden country', async ({ page, request }) => {
  const phone = async (country: string, name: string, lat: number, lng: number) => {
    const g = await (
      await request.post(`${API}/v1/auth/guest`, {
        data: { installId: `e2e-${name}-${Math.random()}`, platform: 'android', appVersion: '1.0.0', timezone: 'Asia/Karachi' },
      })
    ).json();
    const id = g.data.me.id as string;
    sql(`UPDATE users SET country = $2 WHERE id = $1`, [id, country]);
    const token = g.data.accessToken as string;
    const auth = { authorization: `Bearer ${token}` };
    const r = await request.patch(`${API}/v1/me`, { headers: auth, data: { city: { name, lat, lng } } });
    expect(r.status()).toBe(200);
    const s = io(`${API}/live`, { transports: ['websocket'], auth: { token }, reconnection: false });
    sockets.push(s);
    await new Promise<void>((done, fail) => {
      s.on('connect', () => done());
      s.on('connect_error', fail);
    });
    return { id, auth, s };
  };

  const l1 = await phone('PK', 'Lahore', 31.5204, 74.3587);
  await phone('PK', 'Lahore', 31.5401, 74.4099);
  await phone('DE', 'Berlin', 52.52, 13.405);
  expect(sql(`SELECT city_lat, city_lng FROM users WHERE id = $1`, [l1.id])[0]).toEqual({ city_lat: 31.5, city_lng: 74.4 }); // rounded by the server

  await signIn(page, OWNER.email);
  await page.goto('/');
  const map = page.getByTestId('world-map');
  await expect(map).toBeVisible();
  await page.getByRole('radio', { name: 'By city' }).click();
  const dot = (name: string) => map.locator(`[data-city="${name}"]`);
  await expect(dot('Lahore')).toHaveAttribute('data-n', '2', { timeout: 15_000 });
  await expect(dot('Berlin')).toHaveAttribute('data-n', '1');
  const list = page.getByRole('list', { name: 'People online by city' });
  await expect(list.getByRole('listitem').first()).toContainText('Lahore');
  await map.scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot('1-lahore-berlin'), fullPage: true });

  // a new city appears without a reload
  const t = await phone('JP', 'Tokyo', 35.6895, 139.6917);
  await expect(dot('Tokyo')).toHaveAttribute('data-n', '1', { timeout: 15_000 });
  await page.screenshot({ path: shot('2-tokyo-appears'), fullPage: true });

  // someone leaves: the count drops
  l1.s.close();
  await expect(dot('Lahore')).toHaveAttribute('data-n', '1', { timeout: 15_000 });

  // hiding the country hides the city too
  expect((await request.patch(`${API}/v1/me`, { headers: t.auth, data: { showCountry: false } })).status()).toBe(200);
  await expect(dot('Tokyo')).toHaveCount(0, { timeout: 15_000 });
  await page.screenshot({ path: shot('3-tokyo-hidden'), fullPage: true });

  // back to country view: the same data, shaded
  await page.getByRole('radio', { name: 'By country' }).click();
  await expect(map.locator('[data-city]')).toHaveCount(0);
  await expect(map.locator('[data-country="PK"]')).toHaveAttribute('data-n', '1');
  await page.screenshot({ path: shot('4-country-view'), fullPage: true });
});
