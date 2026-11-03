import { http } from 'msw';
import type { BetaBatch, BetaJob, BetaRow, BetaSummary, DeleteReview } from '../features/beta/api';
import { session } from '../lib/session';
import { body, fail, ok } from './overview';

/** In-memory API for Beta Testers, for tests and `VITE_MOCKS=1 pnpm dev`. `resetBeta()` puts the seed data back. */
const API = import.meta.env.VITE_API_URL as string;
const u = (path: string) => `${API}/v1/admin/beta${path}`;
const MANAGERS = ['owner', 'admin'];
const CONTENT = ['owner', 'admin', 'editor'];
const allowed = (roles: string[]) => !!session.admin && roles.includes(session.admin.role);
const denied = () => fail(403, 'FORBIDDEN', 'Your role cannot do this');
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

export const beta = {
  rows: [] as BetaRow[],
  batches: [] as BetaBatch[],
  jobs: new Map<string, BetaJob>(),
  /** Requests the mock saw, for assertions. */
  calls: [] as { method: string; path: string; body?: unknown }[],
};

const row = (n: number, over: Partial<BetaRow> = {}): BetaRow => {
  const login = `beta${String(n).padStart(3, '0')}`;
  const premium = n <= 2;
  return {
    id: `0198b000-0000-7000-8000-${String(n).padStart(12, '0')}`,
    login,
    email: `${login}@testers.example`,
    name: null,
    batch: { id: 'batch-1', name: 'Beta Round 1' },
    state: 'active',
    suspendedReason: null,
    access: { source: premium ? 'beta' : 'none', paidExpiresAt: null, betaExpiresAt: premium ? inDays(20) : null, label: premium ? 'Beta premium' : 'Free' },
    online: n === 1,
    lastActiveAt: new Date(Date.now() - n * 3_600_000).toISOString(),
    createdAt: new Date().toISOString(),
    provisioning: 'ready',
    provisioningError: null,
    seedPreset: 'blank',
    ...over,
  };
};

export function resetBeta() {
  beta.rows = [row(1), row(2), row(3), row(4, { state: 'suspended', suspendedReason: 'Round over' })];
  beta.batches = [
    { id: 'batch-1', name: 'Beta Round 1', prefix: 'beta', total: 4, premiumCount: 2, grantExpiresAt: inDays(20), seedPreset: 'blank', source: 'generate', status: 'ready', jobId: 'job-gen', createdAt: new Date().toISOString(), accounts: 4, ready: 4, failed: 0, suspended: 1, deleting: 0, credentialsAvailable: true },
  ];
  beta.jobs.clear();
  beta.calls.length = 0;
}
resetBeta();

const summary = (): BetaSummary => ({
  total: beta.rows.length,
  beta: beta.rows.filter((r) => r.access.source === 'beta').length,
  paid: 0,
  free: beta.rows.filter((r) => r.access.source === 'none').length,
  suspended: beta.rows.filter((r) => r.state === 'suspended').length,
  deleting: 0,
  online: beta.rows.filter((r) => r.online).length,
});

const job = (id: string, over: Partial<BetaJob>): BetaJob => ({ id, type: 'beta_bulk', status: 'done', progress: 100, error: null, action: 'grant', total: 0, ok: 0, failed: 0, skipped: [], failures: [], ...over });

export const betaHandlers = [
  http.get(u('/summary'), () => (allowed(CONTENT) ? ok(summary()) : denied())),
  http.get(u('/users'), ({ request }) => {
    if (!allowed(CONTENT)) return denied();
    const sp = new URL(request.url).searchParams;
    const q = sp.get('q')?.toLowerCase();
    let rows = beta.rows;
    if (q) rows = rows.filter((r) => r.login.includes(q));
    if (sp.get('state')) rows = rows.filter((r) => r.state === sp.get('state'));
    if (sp.get('access') === 'beta') rows = rows.filter((r) => r.access.source === 'beta');
    if (sp.get('access') === 'free') rows = rows.filter((r) => r.access.source === 'none');
    return ok(rows, { total: rows.length, nextCursor: null });
  }),
  http.get(u('/batches'), () => (allowed(CONTENT) ? ok(beta.batches) : denied())),
  http.post(u('/batches/preview'), async ({ request }) => {
    if (!allowed(MANAGERS)) return denied();
    const b = await body(request);
    const premium = b.access === 'premium' ? Number(b.count) : b.access === 'free' ? 0 : Number(b.premiumCount ?? 0);
    return ok({ total: b.count, premium, free: Number(b.count) - premium, premiumExpiresAt: premium ? inDays(Number(b.premiumDays ?? 30)) : null, domain: 'testers.example', seedPreset: b.seedPreset, passwordStyle: 'Username + we (example: beta001we)', examples: [1, 2, 3].map((n) => ({ login: `${b.prefix}00${n}`, email: `${b.prefix}00${n}@testers.example`, password: `${b.prefix}00${n}we` })) });
  }),
  http.post(u('/batches'), async ({ request }) => {
    if (!allowed(MANAGERS)) return denied();
    beta.calls.push({ method: 'POST', path: '/batches', body: await body(request) });
    beta.jobs.set('job-create', job('job-create', { type: 'beta_generate', action: 'generate', total: 150, ok: 150 }));
    return ok({ batchId: 'batch-2', jobId: 'job-create', firstLogin: 'beta151', lastLogin: 'beta300' }, undefined, { status: 202 });
  }),
  http.post(u('/import/preview'), async ({ request }) => {
    if (!allowed(MANAGERS)) return denied();
    const { csv = '' } = (await body(request)) as { csv?: string };
    const lines = csv.trim().split('\n').slice(1);
    const rows = lines.map((l, i) => { const [login = ''] = l.split(','); const bad = login.length < 3; return { line: i + 2, login, displayName: null, premium: false, days: null, errors: bad ? ['Login must be 3–20 lowercase letters or digits, starting with a letter'] : [], ok: !bad }; });
    return ok({ domain: 'testers.example', rows, valid: rows.filter((r) => r.ok).length, invalid: rows.filter((r) => !r.ok).length });
  }),
  http.post(u('/import'), async ({ request }) => {
    if (!allowed(MANAGERS)) return denied();
    beta.calls.push({ method: 'POST', path: '/import', body: await body(request) });
    beta.jobs.set('job-import', job('job-import', { type: 'beta_generate', action: 'generate', total: 2, ok: 2 }));
    return ok({ batchId: 'batch-3', jobId: 'job-import', imported: 2, skipped: 0 }, undefined, { status: 202 });
  }),
  http.post(u('/bulk/review'), async ({ request }) => {
    if (!allowed(MANAGERS)) return denied();
    const review: DeleteReview = { count: 3, selected: 4, phrase: 'DELETE Beta Round 1', groups: [{ name: 'Beta Round 1', count: 3 }], blocked: [{ id: 'x', login: 'beta004', reason: 'Has a paid store subscription: review billing first (deleting the account does not cancel it)' }] };
    void body(request);
    return ok(review);
  }),
  http.post(u('/bulk'), async ({ request }) => {
    if (!allowed(MANAGERS)) return denied();
    const b = await body(request);
    beta.calls.push({ method: 'POST', path: '/bulk', body: b });
    if (b.action === 'delete' && (b.params as { confirm?: string })?.confirm !== 'DELETE Beta Round 1') return fail(400, 'VALIDATION_FAILED', 'The confirmation does not match');
    const failing = b.action === 'suspend';
    beta.jobs.set('job-bulk', job('job-bulk', { action: String(b.action), total: 3, ok: failing ? 2 : 3, failed: failing ? 1 : 0, status: failing ? 'failed' : 'done', error: failing ? '1 of 3 accounts failed' : null, failures: failing ? [{ id: 'f1', login: 'beta003', error: 'Try again' }] : [] }));
    return ok({ jobId: 'job-bulk', count: 3, skipped: [] }, undefined, { status: 202 });
  }),
  http.get(u('/jobs/:id'), ({ params }) => {
    const j = beta.jobs.get(String(params.id));
    return j ? ok(j) : fail(404, 'NOT_FOUND', 'Job not found');
  }),
  http.post(u('/jobs/:id/retry'), ({ params }) => {
    if (!allowed(MANAGERS)) return denied();
    const j = beta.jobs.get(String(params.id));
    if (j) beta.jobs.set(j.id, { ...j, status: 'done', failed: 0, ok: j.total, failures: [], error: null });
    return ok({ jobId: String(params.id) }, undefined, { status: 202 });
  }),
  http.get(u('/users/:id/sample'), () => ok({ items: [], total: 0 })),
  http.post(u('/users/:id/action'), async ({ request, params }) => {
    if (!allowed(MANAGERS)) return denied();
    const b = await body(request);
    beta.calls.push({ method: 'POST', path: `/users/${String(params.id)}/action`, body: b });
    const r = beta.rows.find((x) => x.id === params.id);
    if (!r) return fail(404, 'NOT_FOUND', 'Test account not found');
    if (b.action === 'suspend') { r.state = 'suspended'; r.suspendedReason = String((b.params as { reason?: string })?.reason ?? ''); }
    if (b.action === 'resume') { r.state = 'active'; r.suspendedReason = null; }
    if (b.action === 'grant') r.access = { source: 'beta', paidExpiresAt: null, betaExpiresAt: inDays(Number((b.params as { days?: number })?.days ?? 30)), label: 'Beta premium' };
    if (b.action === 'remove') r.access = { source: 'none', paidExpiresAt: null, betaExpiresAt: null, label: 'Free' };
    if (b.action === 'reset_password') return ok({ login: r.login, password: 'Zx81QpLm20aBcd' });
    return ok({ changed: true });
  }),
  http.get(u('/users/export'), () => (allowed(MANAGERS) ? new Response('login,email\n', { headers: { 'content-type': 'text/csv' } }) : denied())),
  http.get(u('/batches/:id/credentials'), () => (allowed(MANAGERS) ? new Response('login,email,password\n', { headers: { 'content-type': 'text/csv' } }) : denied())),
  http.get(u('/import/template'), () => new Response('login,display_name,access,premium_days\n', { headers: { 'content-type': 'text/csv' } })),
];
