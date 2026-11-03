import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, download } from '../../lib/api';
import { qk } from '../../lib/query';

/** Account state, access, presence and provisioning are four separate things (never one status). */
export type BetaState = 'active' | 'suspended' | 'deleting';
export type BetaSource = 'none' | 'paid' | 'beta' | 'paid+beta';
export type Provisioning = 'ready' | 'creating' | 'partial' | 'failed';

export type BetaRow = {
  id: string;
  login: string;
  email: string | null;
  name: string | null;
  batch: { id: string; name: string } | null;
  state: BetaState;
  suspendedReason: string | null;
  access: { source: BetaSource; paidExpiresAt: string | null; betaExpiresAt: string | null; label: string };
  online: boolean;
  lastActiveAt: string;
  createdAt: string;
  provisioning: Provisioning;
  provisioningError: string | null;
  seedPreset: string | null;
};
export type BetaSummary = { total: number; beta: number; paid: number; free: number; suspended: number; deleting: number; online: number };
export type BetaBatch = {
  id: string;
  name: string;
  prefix: string;
  total: number;
  premiumCount: number;
  grantExpiresAt: string | null;
  seedPreset: 'blank' | 'profile' | 'light';
  source: 'generate' | 'import';
  status: 'creating' | 'ready' | 'partial' | 'failed';
  jobId: string | null;
  createdAt: string;
  accounts: number;
  ready: number;
  failed: number;
  suspended: number;
  deleting: number;
  credentialsAvailable: boolean;
};
export type BetaFilter = {
  batchId?: string;
  q?: string;
  access?: 'free' | 'beta' | 'paid';
  state?: BetaState;
  presence?: 'online' | 'offline';
};
export type BetaJob = {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'done' | 'failed' | string;
  progress: number;
  error: string | null;
  action: string;
  total: number;
  ok: number;
  failed: number;
  skipped: { id: string; login: string | null; reason: string }[];
  failures: { id: string; login: string | null; error: string }[];
};
export type CreateForm = {
  name: string;
  count: number;
  prefix: string;
  access: 'free' | 'premium' | 'mixed';
  premiumCount?: number;
  freeCount?: number;
  premiumDays?: number;
  premiumExpiresAt?: string;
  seedPreset: 'blank' | 'profile' | 'light';
};
export type CreatePreview = {
  total: number;
  premium: number;
  free: number;
  premiumExpiresAt: string | null;
  domain: string;
  seedPreset: string;
  passwordStyle: string;
  examples: { login: string; email: string; password: string }[];
};
export type ImportPreview = {
  domain: string;
  valid: number;
  invalid: number;
  rows: { line: number; login: string; displayName: string | null; premium: boolean; days: number | null; errors: string[]; ok: boolean }[];
};
export type DeleteReview = {
  count: number;
  selected: number;
  phrase: string;
  groups: { name: string; count: number }[];
  blocked: { id: string; login: string | null; reason: string }[];
};
export type Selection = { ids: string[] } | { all: true; filter: BetaFilter };
export type BulkAction = 'grant' | 'extend' | 'remove' | 'suspend' | 'resume' | 'delete' | 'reset_sample';
export type ActionParams = { days?: number; expiresAt?: string; reason?: string; confirm?: string };

export const ACCESS_FILTERS = [
  { value: '', label: 'Any access' },
  { value: 'beta', label: 'Beta premium' },
  { value: 'paid', label: 'Paid' },
  { value: 'free', label: 'Free' },
];
export const STATE_FILTERS = [
  { value: '', label: 'Any account state' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'deleting', label: 'Deleting' },
];
export const PRESENCE_FILTERS = [
  { value: '', label: 'Online or offline' },
  { value: 'online', label: 'Online now' },
  { value: 'offline', label: 'Offline' },
];

const PAGE = 50;
const clean = (f: BetaFilter) => ({ ...f, q: f.q?.trim() || undefined });

export function useBetaUsers(f: BetaFilter) {
  return useInfiniteQuery({
    queryKey: qk.betaBatch.list({ kind: 'users', ...f }),
    queryFn: ({ pageParam }) => api<BetaRow[]>('/v1/admin/beta/users', { query: { ...clean(f), limit: PAGE, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useBetaSummary(batchId?: string) {
  return useQuery({
    queryKey: qk.betaBatch.list({ kind: 'summary', batchId }),
    queryFn: () => api<BetaSummary>('/v1/admin/beta/summary', { query: { batchId } }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
}

export function useBetaBatches() {
  return useQuery({
    queryKey: qk.betaBatch.list({ kind: 'batches' }),
    queryFn: () => api<BetaBatch[]>('/v1/admin/beta/batches').then((r) => r.data),
  });
}

/** Progress comes over the socket (`job:progress`); this polls only as a fallback and reads the per-account detail. */
export function useBetaJob(id: string | null) {
  return useQuery({
    queryKey: ['betaJob', id ?? ''],
    queryFn: () => api<BetaJob>(`/v1/admin/beta/jobs/${id}`).then((r) => r.data),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && ['done', 'failed'].includes(q.state.data.status) ? false : 2500),
  });
}

const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body }).then((r) => r.data);

export const betaApi = {
  preview: (f: CreateForm) => post<CreatePreview>('/v1/admin/beta/batches/preview', f),
  create: (f: CreateForm) => post<{ batchId: string; jobId: string; firstLogin: string; lastLogin: string }>('/v1/admin/beta/batches', f),
  retryBatch: (id: string) => post<{ jobId: string }>(`/v1/admin/beta/batches/${id}/retry`),
  importPreview: (csv: string) => post<ImportPreview>('/v1/admin/beta/import/preview', { csv }),
  importCsv: (csv: string, name: string, skipInvalid: boolean, seedPreset: CreateForm['seedPreset']) =>
    post<{ batchId: string; jobId: string; imported: number; skipped: number }>('/v1/admin/beta/import', { csv, name, skipInvalid, seedPreset }),
  one: (id: string, action: BulkAction | 'reset_password' | 'reset_progress', params: ActionParams = {}) =>
    post<unknown>(`/v1/admin/beta/users/${id}/action`, { action, params }),
  review: (selection: Selection) => post<DeleteReview>('/v1/admin/beta/bulk/review', { selection }),
  bulk: (action: BulkAction, selection: Selection, params: ActionParams, expectedCount?: number) =>
    post<{ jobId: string; count: number; skipped: { id: string; login: string | null; reason: string }[] }>('/v1/admin/beta/bulk', {
      action,
      selection,
      params,
      expectedCount,
    }),
  retryJob: (id: string) => post<{ jobId: string }>(`/v1/admin/beta/jobs/${id}/retry`),
  sample: (id: string) => api<{ items: { kind: string; count: number }[]; total: number }>(`/v1/admin/beta/users/${id}/sample`).then((r) => r.data),
  exportList: (f: BetaFilter) => download('/v1/admin/beta/users/export', 'wehum-beta-testers.csv', clean(f)),
  credentials: (batchId: string) => download(`/v1/admin/beta/batches/${batchId}/credentials`, 'wehum-beta-credentials.csv'),
  template: () => download('/v1/admin/beta/import/template', 'wehum-beta-import-template.csv'),
};

export const SOURCE_LABEL: Record<BetaSource, string> = { none: 'Free', paid: 'Paid', beta: 'Beta premium', 'paid+beta': 'Paid + beta premium' };
export const STATE_LABEL: Record<BetaState, string> = { active: 'Active', suspended: 'Suspended', deleting: 'Deleting' };
export const PRESET_LABEL = { blank: 'Blank (no sample data)', profile: 'Profile only', light: 'Light sample data' } as const;
