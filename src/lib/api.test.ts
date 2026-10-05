import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, mockSession, ok, url } from '../mocks/handlers';
import { server } from '../mocks/server';
import { api, ApiError, auth, isConflict, isNetworkError, refresh } from './api';
import { session } from './session';

const setCsrfCookie = (v: string) => {
  document.cookie = `wh_csrf=${v}; path=/`;
};

afterEach(() => auth.set(null));

describe('api() request', () => {
  it('unwraps the envelope and returns data + meta', async () => {
    server.use(http.get(url('/v1/admin/sessions'), () => ok([{ id: 's1' }], { nextCursor: 'c2' })));
    const r = await api<{ id: string }[]>('/v1/admin/sessions');
    expect(r.data).toEqual([{ id: 's1' }]);
    expect(r.meta?.nextCursor).toBe('c2');
  });

  it('sends the bearer token, credentials and query params (skipping empty values)', async () => {
    let seen: Request | undefined;
    server.use(
      http.get(url('/v1/admin/sessions'), ({ request }) => {
        seen = request;
        return ok([]);
      }),
    );
    auth.set('tok-1');
    await api('/v1/admin/sessions', { query: { q: 'calm', limit: 20, published: false, cursor: undefined, theme: null, kind: '' } });
    const u = new URL(seen!.url);
    expect(seen!.headers.get('authorization')).toBe('Bearer tok-1');
    expect(seen!.credentials).toBe('include');
    expect(Object.fromEntries(u.searchParams)).toEqual({ q: 'calm', limit: '20', published: 'false' });
  });

  it('sends no Authorization header when signed out, and no X-CSRF on GET', async () => {
    let seen: Request | undefined;
    server.use(
      http.get(url('/v1/live'), ({ request }) => {
        seen = request;
        return ok({});
      }),
    );
    setCsrfCookie('cookie-csrf');
    await api('/v1/live');
    expect(seen!.headers.has('authorization')).toBe(false);
    expect(seen!.headers.has('x-csrf')).toBe(false);
  });

  it('sends JSON body, X-CSRF from the cookie and If-Match on writes', async () => {
    let seen: Request | undefined;
    let body: unknown;
    server.use(
      http.patch(url('/v1/admin/themes/t1'), async ({ request }) => {
        seen = request;
        body = await request.json();
        return ok({ id: 't1', version: 8 }, { version: 8 });
      }),
    );
    setCsrfCookie('cookie-csrf');
    const r = await api<{ version: number }>('/v1/admin/themes/t1', { method: 'PATCH', body: { name: 'Calm' }, ifMatch: 7 });
    expect(body).toEqual({ name: 'Calm' });
    expect(seen!.headers.get('content-type')).toBe('application/json');
    expect(seen!.headers.get('x-csrf')).toBe('cookie-csrf');
    expect(seen!.headers.get('if-match')).toBe('"v7"');
    expect(r.meta?.version).toBe(8);
  });

  it('CSRF: the cookie wins (another tab may have rotated it); the value from the auth response is the fallback', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.post(url('/v1/admin/themes'), ({ request }) => {
        seen.push(request.headers.get('x-csrf'));
        return ok({ id: 't2' }, undefined, { status: 201 });
      }),
    );
    auth.set('tok-1', 'body-csrf');
    await api('/v1/admin/themes', { method: 'POST', body: {} }); // cookie not readable (other subdomain)
    setCsrfCookie('rotated-by-other-tab');
    await api('/v1/admin/themes', { method: 'POST', body: {} });
    expect(seen).toEqual(['body-csrf', 'rotated-by-other-tab']);
  });

  it('returns undefined data on 204', async () => {
    server.use(http.delete(url('/v1/admin/themes/t1'), () => new HttpResponse(null, { status: 204 })));
    const r = await api('/v1/admin/themes/t1', { method: 'DELETE' });
    expect(r.data).toBeUndefined();
  });
});

describe('api() errors', () => {
  it('maps the error envelope to ApiError with code, status, details and traceId', async () => {
    const fields = [{ path: 'title', message: 'Required' }];
    server.use(http.post(url('/v1/admin/sessions'), () => fail(422, 'VALIDATION_FAILED', 'Check the form', { fields })));
    const e = await api('/v1/admin/sessions', { method: 'POST', body: {} }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 422,
      message: 'Check the form',
      details: { fields },
      traceId: 'trace-mock-1',
    });
  });

  it('maps 409 CONFLICT_VERSION and keeps the current entity for the diff dialog', async () => {
    const current = { id: 't1', name: 'Theirs', version: 9 };
    server.use(http.patch(url('/v1/admin/themes/t1'), () => fail(409, 'CONFLICT_VERSION', 'Changed by someone else', { current })));
    const e = await api('/v1/admin/themes/t1', { method: 'PATCH', body: { name: 'Mine' }, ifMatch: 8 }).catch((x: unknown) => x);
    expect(isConflict(e)).toBe(true);
    expect((e as ApiError).details).toEqual({ current });
  });

  it('falls back to INTERNAL when the body is not JSON', async () => {
    server.use(http.get(url('/v1/admin/sessions'), () => new HttpResponse('<html>bad gateway</html>', { status: 502 })));
    const e = await api('/v1/admin/sessions').catch((x: unknown) => x);
    expect(e).toMatchObject({ code: 'INTERNAL', status: 502 });
  });

  it('maps a network failure to ApiError NETWORK (status 0)', async () => {
    server.use(http.get(url('/v1/admin/sessions'), () => HttpResponse.error()));
    const e = await api('/v1/admin/sessions').catch((x: unknown) => x);
    expect(isNetworkError(e)).toBe(true);
    expect((e as ApiError).status).toBe(0);
  });

  it('lets an aborted request reject with AbortError (query cancellation)', async () => {
    server.use(http.get(url('/v1/admin/sessions'), () => ok([])));
    const c = new AbortController();
    c.abort();
    const e = await api('/v1/admin/sessions', { signal: c.signal }).catch((x: unknown) => x);
    expect(e).not.toBeInstanceOf(ApiError);
    expect((e as Error).name).toBe('AbortError');
  });
});

describe('silent refresh', () => {
  /** `/me` answers TOKEN_EXPIRED until the request carries the fresh token. */
  const expiring = (fresh: string, calls: { me: number }) =>
    http.get(url('/v1/admin/me'), ({ request }) => {
      calls.me += 1;
      return request.headers.get('authorization') === `Bearer ${fresh}` ? ok({ id: 'a1' }) : fail(401, 'TOKEN_EXPIRED', 'Expired');
    });

  it('refreshes once on TOKEN_EXPIRED and retries the request with the new token', async () => {
    const calls = { me: 0, refresh: 0 };
    server.use(
      expiring('fresh', calls),
      http.post(url('/v1/admin/auth/refresh'), ({ request }) => {
        calls.refresh += 1;
        expect(request.headers.get('x-csrf')).toBe('old-csrf');
        return ok({ ...mockSession(), accessToken: 'fresh', csrfToken: 'new-csrf' });
      }),
    );
    auth.set('stale', 'old-csrf');
    const seen = vi.fn();
    const off = auth.onChange(seen);
    const r = await api<{ id: string }>('/v1/admin/me');
    off();
    expect(r.data.id).toBe('a1');
    expect(calls).toEqual({ me: 2, refresh: 1 });
    expect(auth.token).toBe('fresh');
    expect(seen).toHaveBeenCalledWith('fresh');
  });

  it('is single-flight: parallel expired requests share one refresh', async () => {
    const calls = { me: 0, refresh: 0 };
    server.use(
      expiring('fresh', calls),
      http.post(url('/v1/admin/auth/refresh'), async () => {
        calls.refresh += 1;
        await new Promise((r) => setTimeout(r, 30));
        return ok({ ...mockSession(), accessToken: 'fresh' });
      }),
    );
    auth.set('stale');
    const results = await Promise.all(Array.from({ length: 6 }, () => api<{ id: string }>('/v1/admin/me')));
    expect(results.every((r) => r.data.id === 'a1')).toBe(true);
    expect(calls.refresh).toBe(1);
    expect(calls.me).toBe(12);
  });

  it('retries only once: a second TOKEN_EXPIRED is thrown, not looped', async () => {
    const calls = { me: 0, refresh: 0 };
    server.use(
      http.get(url('/v1/admin/me'), () => {
        calls.me += 1;
        return fail(401, 'TOKEN_EXPIRED', 'Expired');
      }),
      http.post(url('/v1/admin/auth/refresh'), () => {
        calls.refresh += 1;
        return ok(mockSession());
      }),
    );
    auth.set('stale');
    const e = await api('/v1/admin/me').catch((x: unknown) => x);
    expect(e).toMatchObject({ code: 'TOKEN_EXPIRED', status: 401 });
    expect(calls).toEqual({ me: 2, refresh: 1 });
  });

  it('signs out when the refresh cookie is no longer valid', async () => {
    server.use(
      http.get(url('/v1/admin/me'), () => fail(401, 'TOKEN_EXPIRED', 'Expired')),
      http.post(url('/v1/admin/auth/refresh'), () => fail(401, 'AUTH_REQUIRED', 'No session')),
    );
    auth.set('stale', 'csrf');
    const seen = vi.fn();
    const off = auth.onChange(seen);
    const e = await api('/v1/admin/me').catch((x: unknown) => x);
    off();
    expect(e).toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(auth.token).toBeNull();
    expect(seen).toHaveBeenCalledWith(null);
  });

  it('does not refresh on other 401 codes', async () => {
    let refreshed = 0;
    server.use(
      http.get(url('/v1/admin/me'), () => fail(401, 'AUTH_REQUIRED', 'Sign in')),
      http.post(url('/v1/admin/auth/refresh'), () => {
        refreshed += 1;
        return ok(mockSession());
      }),
    );
    const e = await api('/v1/admin/me').catch((x: unknown) => x);
    expect(e).toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
    expect(refreshed).toBe(0);
  });

  it('refresh() on page load uses the cookie CSRF, stores the token, and can run again afterwards', async () => {
    const csrf: (string | null)[] = [];
    server.use(
      http.post(url('/v1/admin/auth/refresh'), ({ request }) => {
        csrf.push(request.headers.get('x-csrf'));
        return ok({ ...mockSession(), accessToken: `tok-${csrf.length}`, csrfToken: `csrf-${csrf.length}` });
      }),
    );
    setCsrfCookie('cookie-csrf');
    expect(await refresh()).toBe(true);
    expect(auth.token).toBe('tok-1');
    setCsrfCookie('csrf-1'); // the real server sets the new cookie with the response
    expect(await refresh()).toBe(true);
    expect(auth.token).toBe('tok-2');
    expect(csrf).toEqual(['cookie-csrf', 'csrf-1']);
    expect(session.state).toMatchObject({ status: 'signedIn', admin: { role: 'owner' } });
  });

  it('two tabs refresh at once: the loser sees the rotated cookie and tries once more instead of ending the session', async () => {
    session.signIn(mockSession().admin);
    setCsrfCookie('old');
    let calls = 0;
    server.use(
      http.post(url('/v1/admin/auth/refresh'), ({ request }) => {
        calls += 1;
        if (request.headers.get('x-csrf') === 'old') {
          setCsrfCookie('new'); // the other tab's refresh landed first and rotated the cookie
          return fail(401, 'TOKEN_INVALID', 'Session expired. Sign in again.');
        }
        return ok({ ...mockSession(), accessToken: 'fresh' });
      }),
    );
    expect(await refresh()).toBe(true);
    expect(calls).toBe(2);
    expect(auth.token).toBe('fresh');
    expect(session.state.status).toBe('signedIn');
  });

  it('a rejected refresh while signed in marks the session expired (the screen stays); on page load it means signed out', async () => {
    server.use(http.post(url('/v1/admin/auth/refresh'), () => fail(401, 'TOKEN_INVALID', 'Session expired. Sign in again.')));
    session.signIn(mockSession().admin);
    expect(await refresh()).toBe(false);
    expect(session.state).toMatchObject({ status: 'expired', admin: { role: 'owner' } });
    session.reset();
    expect(await refresh()).toBe(false);
    expect(session.state).toMatchObject({ status: 'signedOut', admin: null });
  });

  it('a revoked access token (TOKEN_INVALID, e.g. after a role change) is renewed like an expired one, but not on sign-in endpoints', async () => {
    const calls = { users: 0, refresh: 0 };
    server.use(
      http.get(url('/v1/admin/users'), ({ request }) => {
        calls.users += 1;
        return request.headers.get('authorization') === 'Bearer fresh' ? ok([]) : fail(401, 'TOKEN_INVALID', 'Token revoked');
      }),
      http.post(url('/v1/admin/auth/reset'), () => fail(401, 'TOKEN_INVALID', 'This link is invalid or has expired')),
      http.post(url('/v1/admin/auth/refresh'), () => {
        calls.refresh += 1;
        return ok({ ...mockSession(), accessToken: 'fresh' });
      }),
    );
    auth.set('revoked');
    await api('/v1/admin/users');
    expect(calls).toEqual({ users: 2, refresh: 1 });
    const e = await api('/v1/admin/auth/reset', { method: 'POST', body: {} }).catch((x: unknown) => x);
    expect(e).toMatchObject({ code: 'TOKEN_INVALID' });
    expect(calls.refresh).toBe(1);
  });

  it('refresh() resolves false on a network failure and keeps the current token', async () => {
    server.use(http.post(url('/v1/admin/auth/refresh'), () => HttpResponse.error()));
    auth.set('tok-1');
    expect(await refresh()).toBe(false);
    expect(auth.token).toBe('tok-1');
  });
});
