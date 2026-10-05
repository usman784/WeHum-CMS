/**
 * Fetch wrapper (spec §6.1–6.2): access token in memory, silent refresh via httpOnly cookie (single-flight),
 * CSRF double-submit, envelope unwrapping, typed ApiError with traceId.
 */
import { session, type Admin } from './session';

const BASE = import.meta.env.VITE_API_URL as string;

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public details?: unknown,
    public traceId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** `409 CONFLICT_VERSION`: `details` carries the current entity for the diff dialog (spec §6.1). */
export const isConflict = (e: unknown): e is ApiError => e instanceof ApiError && e.code === 'CONFLICT_VERSION';
/** The request never reached the API (offline, DNS, CORS). */
export const isNetworkError = (e: unknown): e is ApiError => e instanceof ApiError && e.code === 'NETWORK';

let accessToken: string | null = null;
let csrfToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<(t: string | null) => void>();

export const auth = {
  get token() {
    return accessToken;
  },
  /** Called after login / MFA / refresh. The CSRF token comes in the same response body as the access token. */
  set(t: string | null, csrf?: string | null) {
    accessToken = t;
    if (csrf !== undefined) csrfToken = csrf;
    if (t === null) csrfToken = null;
    listeners.forEach((l) => l(t));
  },
  onChange(l: (t: string | null) => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

const csrfCookie = () => document.cookie.match(/(?:^|; )wh_csrf=([^;]+)/)?.[1] ?? null;

/**
 * Double-submit value. The readable `wh_csrf` cookie wins, because the server compares the header with that cookie
 * and another tab may have rotated it. The value from the last auth response is the fallback for when the cookie
 * cannot be read from this origin.
 */
const csrf = () => csrfCookie() ?? csrfToken ?? '';

/** What every auth endpoint returns once the admin is fully signed in. */
export type SessionPayload = { accessToken: string; expiresIn: number; csrfToken?: string; admin: Admin };

/** Store the tokens in memory and mark the admin as signed in. Used by sign-in, MFA, enrollment and refresh. */
export function startSession(p: SessionPayload) {
  auth.set(p.accessToken, p.csrfToken);
  session.signIn(p.admin);
}

/** The refresh cookie was rejected: keep the screen and ask to sign in again if someone was signed in, else just be signed out. */
function endSession() {
  auth.set(null);
  if (session.state.status === 'signedIn') session.expire();
  else if (session.state.status === 'loading') session.signOut();
}

const postRefresh = () => fetch(`${BASE}/v1/admin/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF': csrf() } });

async function doRefresh(): Promise<boolean> {
  try {
    const before = csrfCookie();
    let r = await postRefresh();
    // Two tabs can refresh at the same moment with the same cookie; only one wins. If the cookie changed while
    // we were waiting, the other tab rotated it: try once more with the new one.
    if (!r.ok && r.status === 401 && before !== null && csrfCookie() !== before) r = await postRefresh();
    if (!r.ok) {
      endSession();
      return false;
    }
    const { data } = (await r.json()) as { data: SessionPayload };
    startSession(data);
    return true;
  } catch {
    return false; // network problem: the session may still be fine, so change nothing
  }
}

/**
 * Single-flight: every caller that hits TOKEN_EXPIRED at the same time shares one refresh request.
 * Across tabs a Web Lock makes refreshes take turns, so two tabs never spend the same one-time cookie.
 */
export function refresh(): Promise<boolean> {
  if (!refreshing) {
    const run: Promise<boolean> = navigator.locks ? navigator.locks.request('wh-refresh', doRefresh).then((ok) => ok) : doRefresh();
    refreshing = run.finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/**
 * End the server session that the refresh cookie belongs to, without signing in on this page.
 * Used on page load to finish a sign-out that could not reach the server earlier.
 * True when the session is gone (or was already); false when the server still cannot be reached.
 */
export async function endServerSession(): Promise<boolean> {
  try {
    const r = await postRefresh();
    if (!r.ok) return r.status < 500; // 401: the cookie is already dead
    const { data } = (await r.json()) as { data: SessionPayload };
    const out = await fetch(`${BASE}/v1/admin/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${data.accessToken}`, 'X-CSRF': csrfCookie() ?? data.csrfToken ?? '' },
    });
    return out.ok;
  } catch {
    return false;
  }
}

/** Auth endpoints that are called without an access token. */
const PUBLIC_AUTH = /^\/v1\/admin\/auth\/(login|mfa\/|refresh|forgot|reset|accept-invite)/;

export type ApiMeta = { nextCursor?: string | null; version?: number };
export type ApiResult<T> = { data: T; meta?: ApiMeta };

type Opts = Omit<RequestInit, 'body'> & {
  body?: unknown;
  ifMatch?: number;
  query?: Record<string, string | number | boolean | undefined | null>;
};

export async function api<T>(path: string, opts: Opts = {}, retried = false): Promise<ApiResult<T>> {
  const url = new URL(BASE + path);
  Object.entries(opts.query ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  const headers = new Headers(opts.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (opts.body !== undefined) headers.set('Content-Type', 'application/json');
  if (opts.ifMatch !== undefined) headers.set('If-Match', `"v${opts.ifMatch}"`);
  if (opts.method && opts.method.toUpperCase() !== 'GET') headers.set('X-CSRF', csrf());

  const { body, ifMatch: _ifMatch, query: _query, ...init } = opts;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    // Cancelled by TanStack Query: not a network problem, so pass it through as an AbortError.
    if (opts.signal?.aborted || (e as Error | undefined)?.name === 'AbortError') {
      throw (e as Error | undefined)?.name === 'AbortError' ? e : new DOMException('Request aborted', 'AbortError');
    }
    throw new ApiError('NETWORK', 0, 'Cannot reach the server. Check your connection.');
  }
  if (res.status === 204) return { data: undefined as T };
  const json = (await res.json().catch(() => ({}))) as ApiResult<T> & {
    error?: { code: string; message: string; details?: unknown; traceId?: string };
  };
  if (res.ok) return json;

  const e = json.error ?? { code: 'INTERNAL', message: res.statusText || 'Something went wrong' };
  // Expired access token (normal, every 10 min) or one revoked by a role change: get a new one and repeat once.
  // Not for the sign-in endpoints: they take no access token, and there TOKEN_INVALID means "this link or step is
  // no longer valid". Sign-out DOES take a token and must be renewed, or the server session would stay open.
  const renewable = (e.code === 'TOKEN_EXPIRED' || e.code === 'TOKEN_INVALID') && !PUBLIC_AUTH.test(path);
  if (renewable && !retried && (await refresh())) return api<T>(path, opts, true);
  throw new ApiError(e.code, res.status, e.message, e.details, e.traceId ?? res.headers.get('x-trace-id') ?? undefined);
}
