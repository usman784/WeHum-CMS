import { http, HttpResponse } from 'msw';
import type { LiveAgg } from '../lib/socket-events';
import type { Role } from '../lib/rbac';
import { contentHandlers } from './content';
import { dailyHandlers } from './daily';

/**
 * MSW handlers shared by Vitest (`server.ts`) and the browser worker (`browser.ts`).
 * Shapes follow the backend envelope `{ data, meta }` / `{ error: { code, message, details, traceId } }`.
 * Each feature adds its own handlers next to this file in its phase.
 */
export const API = import.meta.env.VITE_API_URL as string;
export const url = (path: string) => `${API}${path}`;

export const ok = <T>(data: T, meta?: object, init?: ResponseInit) => HttpResponse.json(meta ? { data, meta } : { data }, init);

export const fail = (status: number, code: string, message = code, details?: unknown) =>
  HttpResponse.json({ error: { code, message, details, traceId: 'trace-mock-1' } }, { status });

export const mockAdmin = (role: Role = 'owner') => ({
  id: `0190a1b2-0000-7000-8000-00000000000${['owner', 'admin', 'editor', 'moderator'].indexOf(role) + 1}`,
  email: role === 'owner' ? 'raphael@wehum.app' : `${role}@wehum.app`,
  name: role === 'owner' ? 'Raphael Reiter' : `Demo ${role[0]!.toUpperCase()}${role.slice(1)}`,
  role,
  mfaEnabled: true,
  permissions: [] as string[],
});

export const mockSession = (role: Role = 'owner') => ({
  accessToken: 'mock-access-token',
  expiresIn: 600,
  csrfToken: 'mock-csrf',
  admin: mockAdmin(role),
});

export const mockLive: LiveAgg = {
  total: 1284,
  countries: 42,
  top: [
    { c: 'DE', n: 310 },
    { c: 'US', n: 275 },
    { c: 'PK', n: 120 },
  ],
  quiet: false,
  meditatedToday: 18230,
  vibration: 71,
  at: 1_760_000_000_000,
};

export const MOCK_PASSWORD = 'correct-horse-battery';
export const MOCK_CODE = '123456';
export const MOCK_RECOVERY = 'a1b2c-3d4e5';
export const MOCK_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
export const mockRecoveryCodes = Array.from({ length: 10 }, (_, i) => `${String(i).repeat(5)}-abcde`);

/**
 * Sign-in state of the mock API. Starts signed out. Sign in with any of
 * owner@ / admin@ / editor@ / moderator@wehum.app (or raphael@wehum.app), the password above and code 123456.
 * `new@wehum.app` has no two-step sign-in yet and goes through the setup.
 */
export const mockAuth = { role: null as Role | null };
const roleOf = (email: string): Role | null =>
  email === 'raphael@wehum.app'
    ? 'owner'
    : ((['owner', 'admin', 'editor', 'moderator'] as const).find((r) => email === `${r}@wehum.app`) ?? null);

type Json = Record<string, string | undefined>;
const signedIn = (role: Role) => {
  mockAuth.role = role;
  return ok(mockSession(role));
};

export const handlers = [
  http.get(url('/healthz'), () => HttpResponse.json({ status: 'ok' })),
  http.get(url('/v1/time'), () => ok({ serverTime: Date.now() })),
  http.get(url('/v1/live'), () => ok(mockLive)),
  http.get(url('/v1/admin/public/live'), () =>
    ok({ meditatedToday: mockLive.meditatedToday, meditatingNow: mockLive.total, at: Date.now() }),
  ),

  http.post(url('/v1/admin/auth/login'), async ({ request }) => {
    const { email = '', password } = (await request.json()) as Json;
    if (password !== MOCK_PASSWORD) return fail(401, 'INVALID_CREDENTIALS', 'Email or password is wrong');
    if (email === 'new@wehum.app') return ok({ step: 'enroll', enrollToken: 'mock-enroll-token-0000000000' });
    const role = roleOf(email);
    return role
      ? ok({ step: 'mfa', mfaToken: `mock-mfa-token-00000000-${role}` })
      : fail(401, 'INVALID_CREDENTIALS', 'Email or password is wrong');
  }),
  http.post(url('/v1/admin/auth/mfa/verify'), async ({ request }) => {
    const { mfaToken = '', code, recoveryCode } = (await request.json()) as Json;
    const role = mfaToken.split('-').pop() as Role;
    return code === MOCK_CODE || recoveryCode === MOCK_RECOVERY ? signedIn(role) : fail(401, 'MFA_REQUIRED', 'That code is not valid');
  }),
  http.post(url('/v1/admin/auth/mfa/enroll'), async ({ request }) => {
    const { code } = (await request.json()) as Json;
    if (!code)
      return ok({ secret: MOCK_SECRET, otpauthUri: `otpauth://totp/WeHum%20CMS:new%40wehum.app?secret=${MOCK_SECRET}&issuer=WeHum%20CMS` });
    if (code !== MOCK_CODE) return fail(401, 'MFA_REQUIRED', 'That code is not valid');
    mockAuth.role = 'editor';
    return ok({ ...mockSession('editor'), recoveryCodes: mockRecoveryCodes });
  }),
  http.post(url('/v1/admin/auth/refresh'), () =>
    mockAuth.role ? ok(mockSession(mockAuth.role)) : fail(401, 'AUTH_REQUIRED', 'No session'),
  ),
  http.post(url('/v1/admin/auth/logout'), () => {
    mockAuth.role = null;
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(url('/v1/admin/auth/forgot'), () => new HttpResponse(null, { status: 202 })),
  http.post(url('/v1/admin/auth/reset'), async ({ request }) => {
    const { token = '' } = (await request.json()) as Json;
    return token.startsWith('expired') ? fail(401, 'TOKEN_INVALID', 'This link is invalid or has expired') : ok({ ok: true });
  }),
  http.post(url('/v1/admin/auth/accept-invite'), async ({ request }) => {
    const { token = '' } = (await request.json()) as Json;
    return token.startsWith('expired')
      ? fail(401, 'TOKEN_INVALID', 'This link is invalid or has expired')
      : ok({ step: 'enroll', enrollToken: 'mock-enroll-token-0000000000' });
  }),
  http.get(url('/v1/admin/me'), ({ request }) =>
    request.headers.get('authorization') ? ok(mockAdmin(mockAuth.role ?? 'owner')) : fail(401, 'AUTH_REQUIRED', 'Sign in to continue'),
  ),
  ...contentHandlers,
  ...dailyHandlers,
];
