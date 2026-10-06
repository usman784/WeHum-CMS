import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, download } from '../../lib/api';
import { qk } from '../../lib/query';

/** Membership as the backend words it (`membershipOf` in `users.admin.ts`), so every client says the same. */
export type Membership = {
  plan: 'trial' | 'monthly' | 'founding' | 'annual' | 'cancelled' | 'free';
  label: string;
  status: 'trial' | 'active' | 'cancelling' | 'cancelled' | 'free';
};

export type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  isGuest: boolean;
  providers: string[];
  country: string | null;
  joinedAt: string;
  lastActiveAt: string;
  muted: boolean;
  membership: Membership;
  weekMinutes: number;
  meditations: number;
};
export type UserCounts = { all: number; guests: number; accounts: number; paying: number; trial: number };

export type UserDetail = {
  id: string;
  name: string | null;
  email: string | null;
  isGuest: boolean;
  country: string | null;
  timezone: string;
  joinedAt: string;
  lastActiveAt: string;
  muted: boolean;
  providers: string[];
  accountSavedAt: string | null;
  wasGuestDays: number | null;
  devices: { platform: string; model: string | null; appVersion: string | null; lastSeenAt: string }[];
  reminder: { enabled: boolean; time: string; timezone: string; groupWarning: boolean; dailyMessagePush: boolean };
  stats: {
    weekDays: number;
    weekMinutes: number;
    meditations: number;
    minutes: number;
    groupMeditations: number;
    avgMinutes: number | null;
  };
  recentMeditations: { id: string; session: string | null; kind: string; startedAt: string; durationSec: number | null }[];
  dedications: { id: string; text: string; status: string; holdingCount: number; createdAt: string; session: string }[];
  membership: Membership & {
    productId: string | null;
    store: string | null;
    startedAt: string | null;
    expiresAt: string | null;
    willRenew: boolean;
    billingIssue: boolean;
    revenueCatId: string;
  };
};

export type Job = {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'done' | 'failed' | string;
  progress: number;
  result?: unknown;
  error?: string | null;
};
export type ExportResult = { json: string; csv: string; meditations: number; expiresInHours: number };

export const USER_TABS = [
  { value: 'all', label: 'All' },
  { value: 'guests', label: 'Guests' },
  { value: 'free', label: 'Free account' },
  { value: 'trial', label: 'Trial' },
  { value: 'annual', label: 'Annual' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;
export type UserTab = (typeof USER_TABS)[number]['value'];
export type UserFilters = { tab: UserTab; q: string };

const PAGE = 30;

export function useUsers(f: UserFilters) {
  return useInfiniteQuery({
    queryKey: qk.user.list(f),
    queryFn: ({ pageParam }) =>
      api<UserRow[]>('/v1/admin/users', { query: { tab: f.tab, q: f.q.trim() || undefined, limit: PAGE, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: qk.user.detail(id ?? ''),
    queryFn: () => api<UserDetail>(`/v1/admin/users/${id}`).then((r) => r.data),
    enabled: !!id,
    retry: (n, e) => (e as { status?: number }).status !== 404 && n < 2,
  });
}

export function useJob(id: string | null) {
  return useQuery({
    queryKey: qk.job(id ?? ''),
    queryFn: () => api<Job>(`/v1/admin/jobs/${id}`).then((r) => r.data),
    enabled: !!id,
    // the socket pushes `job:progress`; polling is the fallback while it is not live
    refetchInterval: (q) => (q.state.data && ['done', 'failed'].includes(q.state.data.status) ? false : 3000),
  });
}

export const usersApi = {
  exportCsv: (f: UserFilters) => download('/v1/admin/users/export', `wehum-users-${f.tab}.csv`, { tab: f.tab, q: f.q.trim() || undefined }),
  exportData: (id: string) => api<{ jobId: string }>(`/v1/admin/users/${id}/export`, { method: 'POST' }).then((r) => r.data),
  remove: (id: string, confirm: string) =>
    api<{ jobId: string }>(`/v1/admin/users/${id}`, { method: 'DELETE', body: { confirm } }).then((r) => r.data),
  gift: (id: string, days: number) =>
    api<{ active: boolean; expiresAt: string | null }>(`/v1/admin/users/${id}/gift`, { method: 'POST', body: { days } }).then(
      (r) => r.data,
    ),
  mute: (id: string, muted: boolean) => api(`/v1/admin/users/${id}/mute`, { method: 'POST', body: { muted } }).then((r) => r.data),
};

const PROVIDER = { apple: 'Apple', google: 'Google', email: 'Email' } as Record<string, string>;
export const providerNames = (p: string[]) => p.map((x) => PROVIDER[x] ?? x).join(' · ');

/** "elena@gmail.com · Google" or "Guest · no account yet" (design: Users.dc.html user column). */
export const userSubline = (u: { email: string | null; isGuest: boolean; providers: string[] }) =>
  u.isGuest ? 'Guest · no account yet' : [u.email, providerNames(u.providers)].filter(Boolean).join(' · ');

const regions = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
export const countryName = (code: string | null) => (code ? (regions?.of(code.toUpperCase()) ?? code) : 'Worldwide');

/** What the delete dialog asks to type: the email, or the first 8 characters of the id for guests (backend rule). */
export const deleteConfirmText = (u: { id: string; email: string | null }) => u.email ?? u.id.slice(0, 8);
