import { http, HttpResponse } from 'msw';
import type { LiveAgg } from '../lib/socket-events';
import type { Role } from '../lib/rbac';

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
  id: '0190a1b2-0000-7000-8000-000000000001',
  email: 'raphael@wehum.app',
  name: 'Raphael',
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

export const handlers = [
  http.get(url('/healthz'), () => HttpResponse.json({ status: 'ok' })),
  http.get(url('/v1/time'), () => ok({ serverTime: Date.now() })),
  http.get(url('/v1/live'), () => ok(mockLive)),
  http.post(url('/v1/admin/auth/refresh'), () => ok(mockSession())),
  http.post(url('/v1/admin/auth/logout'), () => new HttpResponse(null, { status: 204 })),
  http.get(url('/v1/admin/me'), ({ request }) =>
    request.headers.get('authorization') ? ok(mockAdmin()) : fail(401, 'AUTH_REQUIRED', 'Sign in to continue'),
  ),
];
