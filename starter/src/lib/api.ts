/**
 * Fetch wrapper (spec §6.1–6.2): access token in memory, silent refresh via httpOnly cookie (single-flight),
 * CSRF double-submit, envelope unwrapping, typed ApiError with traceId.
 */
const BASE = import.meta.env.VITE_API_URL as string;

export class ApiError extends Error {
  constructor(public code: string, public status: number, message: string, public details?: unknown, public traceId?: string) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<(t: string | null) => void>();

export const auth = {
  get token() { return accessToken; },
  set(t: string | null) { accessToken = t; listeners.forEach((l) => l(t)); },
  onChange(l: (t: string | null) => void) { listeners.add(l); return () => listeners.delete(l); },
};

const csrf = () => document.cookie.match(/(?:^|; )wh_csrf=([^;]+)/)?.[1] ?? '';

export function refresh(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/v1/admin/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF': csrf() } })
    .then(async (r) => {
      if (!r.ok) { auth.set(null); return false; }
      const { data } = await r.json();
      auth.set(data.accessToken);
      return true;
    })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

type Opts = Omit<RequestInit, 'body'> & { body?: unknown; ifMatch?: number; query?: Record<string, string | number | boolean | undefined> };

export async function api<T>(path: string, opts: Opts = {}, retried = false): Promise<{ data: T; meta?: { nextCursor?: string | null; version?: number } }> {
  const url = new URL(BASE + path);
  Object.entries(opts.query ?? {}).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, String(v)));
  const headers = new Headers(opts.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (opts.body !== undefined) headers.set('Content-Type', 'application/json');
  if (opts.ifMatch !== undefined) headers.set('If-Match', `"v${opts.ifMatch}"`);
  if (opts.method && opts.method !== 'GET') headers.set('X-CSRF', csrf());

  const res = await fetch(url, { ...opts, headers, credentials: 'include', body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  if (res.status === 204) return { data: undefined as T };
  const json = await res.json().catch(() => ({}));
  if (res.ok) return json;

  const e = json.error ?? { code: 'INTERNAL', message: res.statusText };
  if (e.code === 'TOKEN_EXPIRED' && !retried && (await refresh())) return api<T>(path, opts, true);
  throw new ApiError(e.code, res.status, e.message, e.details, e.traceId);
}
