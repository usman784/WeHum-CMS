/**
 * Fetch wrapper (spec §6.1–6.2): access token in memory, silent refresh via httpOnly cookie (single-flight),
 * CSRF double-submit, envelope unwrapping, typed ApiError with traceId.
 */
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

/** Double-submit value: the one from the last auth response, else the readable `wh_csrf` cookie (page reload). */
const csrf = () => csrfToken ?? document.cookie.match(/(?:^|; )wh_csrf=([^;]+)/)?.[1] ?? '';

/** Single-flight: every caller that hits TOKEN_EXPIRED at the same time shares one refresh request. */
export function refresh(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/v1/admin/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF': csrf() },
  })
    .then(async (r) => {
      if (!r.ok) {
        auth.set(null);
        return false;
      }
      const { data } = (await r.json()) as { data: { accessToken: string; csrfToken?: string } };
      auth.set(data.accessToken, data.csrfToken);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

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
  if (e.code === 'TOKEN_EXPIRED' && !retried && (await refresh())) return api<T>(path, opts, true);
  throw new ApiError(e.code, res.status, e.message, e.details, e.traceId ?? res.headers.get('x-trace-id') ?? undefined);
}
