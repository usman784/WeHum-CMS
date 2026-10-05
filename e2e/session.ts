import type { Page, Route } from '@playwright/test';

/**
 * The tests in this folder run WITHOUT a backend: every call to the API origin is answered here.
 * (The tests in e2e/backend/ use the real backend.) The production build calls http://localhost:3000.
 */
export const API_ORIGIN = 'http://localhost:3000';
export type Role = 'owner' | 'admin' | 'editor' | 'moderator';

const admin = (role: Role) => ({
  id: `0190a1b2-0000-7000-8000-00000000000${['owner', 'admin', 'editor', 'moderator'].indexOf(role) + 1}`,
  email: role === 'owner' ? 'raphael@wehum.app' : `${role}@wehum.app`,
  name: role === 'owner' ? 'Raphael Reiter' : `Demo ${role[0]!.toUpperCase()}${role.slice(1)}`,
  role,
  mfaEnabled: true,
  permissions: [],
});

const cors = { 'access-control-allow-origin': 'http://localhost:4173', 'access-control-allow-credentials': 'true' };
const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * Answer the API for this page. With a role, the silent refresh on page load signs that admin in
 * (as if a valid refresh cookie were there). With `null` nobody is signed in.
 */
export async function mockApi(page: Page, role: Role | null) {
  let current = role;
  await page.route(`${API_ORIGIN}/**`, (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-headers': 'authorization,content-type,x-csrf,if-match',
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE',
        },
      });
    }
    if (path === '/v1/admin/auth/refresh') {
      return current
        ? json(route, 200, { data: { accessToken: 'e2e-access-token', expiresIn: 600, csrfToken: 'e2e-csrf', admin: admin(current) } })
        : json(route, 401, { error: { code: 'AUTH_REQUIRED', message: 'No session', traceId: 'e2e' } });
    }
    if (path === '/v1/admin/auth/logout') {
      current = null;
      return route.fulfill({ status: 204, headers: cors });
    }
    if (path === '/v1/admin/public/live') return json(route, 200, { data: { meditatedToday: 3180, meditatingNow: 214, at: Date.now() } });
    return route.abort(); // nothing else exists yet (the socket simply stays offline)
  });
}

/** Open a page as a signed-in admin of that role. */
export async function openAs(page: Page, role: Role, path = '/') {
  await mockApi(page, role);
  await page.goto(path);
}
