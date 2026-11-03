import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useSocketEvent } from '../../hooks/useLive';
import { formatDate } from '../../lib/format';
import { qk } from '../../lib/query';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';
import { Input } from '../../ui/Input';
import { NumberInput } from '../../ui/NumberInput';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { toast } from '../../ui/Toast';
import {
  betaApi,
  PRESET_LABEL,
  useBetaJob,
  type ActionParams,
  type BetaRow,
  type BulkAction,
  type CreateForm,
  type CreatePreview,
  type DeleteReview,
  type ImportPreview,
  type Selection,
} from './api';

const PRESETS = Object.entries(PRESET_LABEL).map(([value, label]) => ({ value, label }));

function useRefreshBeta() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.betaBatch.all });
}

// ───────────── generate ─────────────

const EMPTY: CreateForm = { name: 'Beta Round 1', count: 150, prefix: 'beta', access: 'mixed', premiumCount: 100, premiumDays: 30, seedPreset: 'blank' };

/** Create accounts: the form, then a review of exactly what will be made (counts, expiry, password style) before anything is created. */
export function GenerateDialog({ open, onClose, onStarted }: { open: boolean; onClose: () => void; onStarted: (jobId: string) => void }) {
  const [f, setF] = useState<CreateForm>(EMPTY);
  const [review, setReview] = useState<CreatePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useRefreshBeta();
  const set = (p: Partial<CreateForm>) => {
    setReview(null);
    setF((x) => ({ ...x, ...p }));
  };
  const premium = f.access === 'premium' ? f.count : f.access === 'free' ? 0 : (f.premiumCount ?? 0);
  const body = (): CreateForm => ({
    ...f,
    premiumCount: f.access === 'mixed' ? premium : undefined,
    freeCount: f.access === 'mixed' ? f.count - premium : undefined,
    premiumDays: premium > 0 ? f.premiumDays : undefined,
  });
  const close = () => {
    setReview(null);
    onClose();
  };
  const next = async () => {
    setBusy(true);
    try {
      setReview(await betaApi.preview(body()));
    } catch (e) {
      toast.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    setBusy(true);
    try {
      const r = await betaApi.create(body());
      toast.success('Creating the accounts', `${r.firstLogin} to ${r.lastLogin}`);
      void refresh();
      onStarted(r.jobId);
      close();
    } catch (e) {
      toast.apiError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title="Create test accounts"
      description="Each tester gets their own login and password. No personal email address is needed."
      size="lg"
      footer={
        review ? (
          <>
            <Button variant="outline" onClick={() => setReview(null)}>
              Back
            </Button>
            <Button loading={busy} onClick={() => void create()}>
              Create {review.total} accounts
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button loading={busy} disabled={!f.name.trim() || !f.prefix || !f.count} onClick={() => void next()}>
              Review
            </Button>
          </>
        )
      }
    >
      {review ? (
        <div className="flex flex-col gap-3" data-testid="generate-review">
          <p className="text-body">
            <strong>{review.total}</strong> accounts in <strong>{f.name}</strong>: <strong>{review.premium}</strong> with beta premium
            {review.premiumExpiresAt ? ` until ${formatDate(review.premiumExpiresAt)}` : ''} and <strong>{review.free}</strong> free.
          </p>
          <p className="text-sm text-text-muted">
            Sample data: {PRESET_LABEL[review.seedPreset as keyof typeof PRESET_LABEL]}. Logins end in @{review.domain}. Nobody is emailed.
          </p>
          <div className="rounded-card border border-border bg-input p-3 text-sm">
            <div className="font-semibold">Password style: {review.passwordStyle}</div>
            <ul className="mt-1.5 text-text-muted">
              {review.examples.map((x) => (
                <li key={x.login}>
                  Example login <span className="font-mono">{x.login}</span> → password <span className="font-mono">{x.password}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-text-muted">
              Fictional examples. The real numbers continue after the highest login already used. Testers can change their password in the app.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Group name" value={f.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} />
          <Input
            label="Login prefix"
            hint="Lowercase letters and digits, at least 3"
            value={f.prefix}
            onChange={(e) => set({ prefix: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
            maxLength={14}
          />
          <NumberInput label="How many accounts" value={f.count} min={1} max={200} onChange={(v) => set({ count: v ?? 1 })} />
          <Select label="Sample data" options={PRESETS} value={f.seedPreset} onChange={(e) => set({ seedPreset: e.target.value as CreateForm['seedPreset'] })} />
          <div className="sm:col-span-2">
            <Segmented
              label="Initial access"
              value={f.access}
              onChange={(access) => set({ access })}
              options={[
                { value: 'free', label: 'All free' },
                { value: 'premium', label: 'All premium' },
                { value: 'mixed', label: 'Mixed' },
              ]}
            />
          </div>
          {f.access === 'mixed' ? (
            <>
              <NumberInput label="Premium accounts" value={f.premiumCount ?? 0} min={1} max={Math.max(1, f.count - 1)} onChange={(v) => set({ premiumCount: v ?? 1 })} />
              <NumberInput label="Free accounts" value={Math.max(0, f.count - (f.premiumCount ?? 0))} disabled onChange={() => undefined} />
            </>
          ) : null}
          {premium > 0 ? <NumberInput label="Premium lasts" unit="days" value={f.premiumDays ?? 30} min={1} max={365} onChange={(v) => set({ premiumDays: v ?? 30 })} /> : null}
          <div className="rounded-card border border-border bg-input p-3 text-sm sm:col-span-2">
            <div className="font-semibold">Password style</div>
            <div>
              Username + we <span className="text-text-muted">(example: beta001we)</span>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ───────────── import ─────────────

export function ImportDialog({ open, onClose, onStarted }: { open: boolean; onClose: () => void; onStarted: (jobId: string) => void }) {
  const [csv, setCsv] = useState('');
  const [name, setName] = useState('Imported testers');
  const [preset, setPreset] = useState<CreateForm['seedPreset']>('blank');
  const [prev, setPrev] = useState<ImportPreview | null>(null);
  const [skip, setSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = useRefreshBeta();
  const close = () => {
    setCsv('');
    setPrev(null);
    setSkip(false);
    onClose();
  };
  const read = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setBusy(true);
    try {
      setPrev(await betaApi.importPreview(text));
    } catch (e) {
      setPrev(null);
      toast.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  const go = async () => {
    setBusy(true);
    try {
      const r = await betaApi.importCsv(csv, name.trim() || 'Imported testers', skip, preset);
      toast.success(`Importing ${r.imported} accounts`, r.skipped ? `${r.skipped} rows skipped` : undefined);
      void refresh();
      onStarted(r.jobId);
      close();
    } catch (e) {
      toast.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  const canGo = !!prev && prev.valid > 0 && (prev.invalid === 0 || skip);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title="Import test accounts from CSV"
      description="One row per tester: login, display name, free or premium, premium days. Use synthetic logins, not personal emails."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!canGo} loading={busy} onClick={() => void go()}>
            Import {prev ? (skip ? prev.valid : prev.valid + prev.invalid) : ''} accounts
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            CSV file
            <input type="file" accept=".csv,text/csv" onChange={(e) => void read(e.target.files?.[0])} className="text-sm font-normal" />
          </label>
          <Button variant="outline" size="sm" onClick={() => void betaApi.template().catch(toast.apiError)}>
            Download template
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Group name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <Select label="Sample data" options={PRESETS} value={preset} onChange={(e) => setPreset(e.target.value as CreateForm['seedPreset'])} />
        </div>
        {prev ? (
          <div className="flex flex-col gap-2" data-testid="import-preview">
            <p className="text-sm">
              <strong>{prev.valid}</strong> valid · <strong>{prev.invalid}</strong> with errors
            </p>
            <ul className="max-h-56 overflow-auto rounded-card border border-border text-sm">
              {prev.rows.map((r) => (
                <li key={r.line} className="flex items-start gap-2 border-b border-border px-3 py-1.5 last:border-0">
                  <span className="w-10 shrink-0 text-text-muted">#{r.line}</span>
                  <span className="w-28 shrink-0 font-mono">{r.login || '—'}</span>
                  {r.ok ? <Badge tone="teal" size="sm">OK{r.premium ? ` · premium ${r.days}d` : ''}</Badge> : <span className="text-danger-text">{r.errors.join('; ')}</span>}
                </li>
              ))}
            </ul>
            {prev.invalid > 0 ? <Checkbox label="Import only the valid rows" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

// ───────────── one account ─────────────

type Busy = null | string;

/** Manage one tester: every action says what it does to the person and what stays the same. */
export function ManageDialog({ row, canManage, onClose, onJob }: { row: BetaRow | null; canManage: boolean; onClose: () => void; onJob: (id: string) => void }) {
  const [busy, setBusy] = useState<Busy>(null);
  const [days, setDays] = useState<number | null>(30);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [cred, setCred] = useState<{ login: string; password: string } | null>(null);
  const [sample, setSample] = useState<number | null>(null);
  const refresh = useRefreshBeta();
  useEffect(() => {
    setCred(null);
    setSample(null);
    setTyped('');
    setReason('');
    if (row && canManage) void betaApi.sample(row.id).then((s) => setSample(s.total)).catch(() => setSample(null));
  }, [row?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!row) return null;
  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      const r = await fn();
      toast.success(done);
      void refresh();
      return r;
    } catch (e) {
      toast.apiError(e);
    } finally {
      setBusy(null);
    }
  };
  const phrase = `DELETE ${row.login}`;
  const hasBeta = !!row.access.betaExpiresAt;
  const blocked = row.state !== 'active';
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Manage ${row.login}`}
      description={row.email ?? undefined}
      size="lg"
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}
    >
      <div className="flex flex-col gap-5 overflow-auto">
        <div className="flex flex-wrap gap-2" aria-label="Status">
          <Badge tone={row.state === 'active' ? 'teal' : row.state === 'suspended' ? 'warning' : 'danger'} size="sm">{row.state === 'active' ? 'Active' : row.state === 'suspended' ? 'Suspended' : 'Deleting'}</Badge>
          <Badge tone="ember" size="sm">{row.access.label}</Badge>
          <Badge tone="neutral" size="sm">{row.online ? 'Online now' : 'Offline'}</Badge>
          {row.provisioning !== 'ready' ? <Badge tone="warning" size="sm">Setup {row.provisioning}</Badge> : null}
        </div>
        {row.state === 'suspended' && row.suspendedReason ? <p className="text-sm text-text-muted">Suspended: {row.suspendedReason}</p> : null}
        {hasBeta ? <p className="text-sm text-text-muted">Beta premium ends {formatDate(row.access.betaExpiresAt!)}.</p> : null}
        {!canManage ? (
          <p className="text-sm text-text-muted">Your role can look at test accounts but not change them.</p>
        ) : (
          <>
            <section className="flex flex-col gap-2" aria-label="Premium access">
              <h3 className="text-h3">Premium access</h3>
              <p className="text-sm text-text-muted">Changes reach the tester's open app within seconds; they do not need to sign in again. A paid subscription is never touched.</p>
              <div className="flex flex-wrap items-end gap-3">
                <NumberInput label="Days" value={days} min={1} max={365} onChange={setDays} />
                <Button loading={busy === 'grant'} disabled={blocked && row.state === 'deleting'} onClick={() => void run('grant', () => betaApi.one(row.id, 'grant', { days: days ?? 30 }), 'Beta premium granted')}>
                  {hasBeta ? 'Set end date from today' : 'Grant beta premium'}
                </Button>
                <Button variant="outline" loading={busy === 'extend'} disabled={!hasBeta} onClick={() => void run('extend', () => betaApi.one(row.id, 'extend', { days: days ?? 30 }), 'Beta premium extended')}>
                  Extend
                </Button>
                <Button variant="outline" loading={busy === 'remove'} disabled={!hasBeta} onClick={() => void run('remove', () => betaApi.one(row.id, 'remove'), 'Beta access removed')}>
                  Remove beta access
                </Button>
              </div>
            </section>
            <section className="flex flex-col gap-2" aria-label="Account state">
              <h3 className="text-h3">Account</h3>
              {row.state === 'suspended' ? (
                <>
                  <p className="text-sm text-text-muted">Resuming allows a new sign-in. Old sessions stay signed out and the beta end date does not move.</p>
                  <Button variant="outline" className="self-start" loading={busy === 'resume'} onClick={() => void run('resume', () => betaApi.one(row.id, 'resume'), 'Account resumed')}>
                    Resume account
                  </Button>
                </>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <Input label="Reason (only admins see it)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
                  <Button variant="outline" disabled={row.state !== 'active'} loading={busy === 'suspend'} onClick={() => void run('suspend', () => betaApi.one(row.id, 'suspend', { reason: reason.trim() || 'Suspended by an admin' }), 'Account suspended')}>
                    Suspend
                  </Button>
                </div>
              )}
              <p className="text-sm text-text-muted">Suspending signs the tester out on every device and blocks sign-in until you resume. Their beta time keeps running.</p>
            </section>
            <section className="flex flex-col gap-2" aria-label="Password and data">
              <h3 className="text-h3">Password and sample data</h3>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" loading={busy === 'pw'} disabled={row.state === 'deleting'} onClick={() => void run('pw', async () => setCred((await betaApi.one(row.id, 'reset_password')) as { login: string; password: string }), 'New password created')}>
                  Reset password
                </Button>
                <Button variant="outline" loading={busy === 'sample'} disabled={sample === 0} onClick={() => void run('sample', () => betaApi.one(row.id, 'reset_sample'), 'Sample data removed')}>
                  Reset sample data{sample ? ` (${sample})` : ''}
                </Button>
              </div>
              {cred ? (
                <p role="status" className="rounded-card border border-border bg-input p-3 text-sm">
                  New credentials for <strong>{cred.login}</strong>: <span className="font-mono">{cred.password}</span>
                  <br />
                  <span className="text-text-muted">Shown once. The tester is signed out everywhere. Share it privately.</span>
                </p>
              ) : null}
              <p className="text-sm text-text-muted">Reset sample data removes only the fictional profile and history added at creation, never what the tester did.</p>
            </section>
            <section className="flex flex-col gap-2" aria-label="Delete">
              <h3 className="text-h3">Delete account</h3>
              <p className="text-sm text-text-muted">Access stops immediately; the data is then removed in the background. Deleting does not cancel any store subscription.</p>
              <div className="flex flex-wrap items-end gap-3">
                <Input label={`Type ${phrase}`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
                <Button variant="danger" disabled={typed.trim() !== phrase || row.state === 'deleting'} loading={busy === 'delete'}
                  onClick={() => void run('delete', async () => { const r = (await betaApi.one(row.id, 'delete', { confirm: phrase })) as { jobId: string }; onJob(r.jobId); onClose(); }, 'Deleting the account')}>
                  Delete
                </Button>
              </div>
            </section>
          </>
        )}
      </div>
    </Dialog>
  );
}

// ───────────── bulk ─────────────

export const BULK_LABEL: Record<BulkAction, string> = {
  grant: 'Grant beta premium',
  extend: 'Extend beta premium',
  remove: 'Remove beta access',
  suspend: 'Suspend',
  resume: 'Resume',
  delete: 'Delete',
  reset_sample: 'Reset sample data',
};

const EXPLAIN: Record<BulkAction, string> = {
  grant: 'Gives beta premium until the chosen end date. Their open apps update within seconds.',
  extend: 'Adds days to each current end date (or starts from today when it has ended).',
  remove: 'Ends beta premium only. Paid subscriptions stay as they are.',
  suspend: 'Signs the testers out on every device and blocks sign-in until you resume them.',
  resume: 'Allows a new sign-in. Old sessions stay signed out.',
  delete: 'Blocks access at once, then removes the accounts and their data in the background.',
  reset_sample: 'Removes only the fictional sample data added at creation.',
};

/** Confirm a bulk action for a fixed selection. The scope and count are shown first; delete also needs the typed phrase. */
export function BulkDialog({ action, selection, count, scope, onClose, onJob }: { action: BulkAction | null; selection: Selection; count: number; scope: string; onClose: () => void; onJob: (id: string) => void }) {
  const [days, setDays] = useState<number | null>(30);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [review, setReview] = useState<DeleteReview | null>(null);
  const [busy, setBusy] = useState(false);
  const sel = useRef(selection);
  sel.current = selection;
  useEffect(() => {
    setReview(null);
    setTyped('');
    if (action === 'delete') void betaApi.review(sel.current).then(setReview).catch((e) => { toast.apiError(e); onClose(); });
  }, [action]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!action) return null;
  const params = (): ActionParams => (action === 'grant' || action === 'extend' ? { days: days ?? 30 } : action === 'suspend' ? { reason: reason.trim() || 'Suspended by an admin' } : action === 'delete' ? { confirm: typed.trim() } : {});
  const go = async (a: BulkAction = action, p: ActionParams = params()) => {
    setBusy(true);
    try {
      const r = await betaApi.bulk(a, selection, p, a === 'delete' ? count : count);
      onJob(r.jobId);
      onClose();
    } catch (e) {
      toast.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  const ready = action !== 'delete' || (!!review && review.count > 0 && typed.trim() === review.phrase);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${BULK_LABEL[action]} · ${count} account${count === 1 ? '' : 's'}`}
      description={scope}
      footer={
        <>
          {action === 'delete' ? (
            <Button variant="outline" loading={busy} onClick={() => void go('suspend', { reason: 'Suspended instead of deleted' })}>
              Suspend instead
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={action === 'delete' ? 'danger' : 'primary'} disabled={!ready} loading={busy} onClick={() => void go()}>
            {BULK_LABEL[action]}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-muted">{EXPLAIN[action]}</p>
        {action === 'grant' || action === 'extend' ? <NumberInput label={action === 'grant' ? 'Premium lasts (days)' : 'Add days'} value={days} min={1} max={365} onChange={setDays} /> : null}
        {action === 'suspend' ? <Input label="Reason (only admins see it)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /> : null}
        {action === 'delete' ? (
          review ? (
            <div className="flex flex-col gap-2" data-testid="delete-review">
              <p className="text-body">
                <strong>{review.count}</strong> of {review.selected} selected accounts will be deleted{review.groups.length ? `: ${review.groups.map((g) => `${g.name} (${g.count})`).join(', ')}` : ''}.
              </p>
              {review.blocked.length ? (
                <div className="rounded-card border border-border p-3 text-sm">
                  <div className="font-semibold">Not deleted ({review.blocked.length})</div>
                  <ul className="mt-1 list-disc pl-5 text-text-muted">
                    {review.blocked.slice(0, 5).map((b) => (
                      <li key={b.id}>
                        {b.login ?? 'Unknown'}: {b.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <Input label={`Type ${review.phrase} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
            </div>
          ) : (
            <p className="text-sm text-text-muted">Checking the selection…</p>
          )
        ) : null}
      </div>
    </Dialog>
  );
}

// ───────────── progress ─────────────

/** Live progress of a generate / bulk job with per-account failures and a retry that only re-runs what failed. */
export function JobPanel({ id, label, onClose }: { id: string; label: string; onClose: () => void }) {
  const job = useBetaJob(id);
  const qc = useQueryClient();
  const refresh = useRefreshBeta();
  useSocketEvent('job:progress', (p) => {
    if (p.id === id) void qc.invalidateQueries({ queryKey: ['betaJob', id] });
  });
  const j = job.data;
  const finished = j && ['done', 'failed'].includes(j.status);
  useEffect(() => {
    if (finished) void refresh();
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section aria-label="Progress" className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4" data-testid="job-panel">
      <div className="flex items-center gap-3">
        <h2 className="text-h3">{label}</h2>
        <Badge tone={j?.status === 'failed' ? 'danger' : j?.status === 'done' ? 'teal' : 'neutral'} size="sm">
          {j ? (j.status === 'done' ? 'Finished' : j.status === 'failed' ? 'Needs attention' : 'Working') : 'Starting'}
        </Badge>
        <span className="flex-1" />
        <Link to="/audit" className="text-sm underline underline-offset-2">
          Activity history
        </Link>
        <Button size="sm" variant="outline" onClick={onClose} disabled={!finished}>
          Dismiss
        </Button>
      </div>
      <progress className="h-2 w-full" value={j?.progress ?? 0} max={100} aria-label={`${label} progress`} />
      {j ? (
        <p className="text-sm text-text-muted">
          {j.progress}%{j.total ? ` · ${j.ok} of ${j.total} done` : ''}
          {j.failed ? ` · ${j.failed} failed` : ''}
          {j.skipped.length ? ` · ${j.skipped.length} left out` : ''}
        </p>
      ) : null}
      {j?.skipped.length ? (
        <ul className="list-disc pl-5 text-sm text-text-muted">
          {j.skipped.slice(0, 5).map((s) => (
            <li key={s.id}>
              {s.login ?? 'Account'} was left out: {s.reason}
            </li>
          ))}
        </ul>
      ) : null}
      {j?.failures.length ? (
        <div className="flex flex-col gap-2">
          <ul className="list-disc pl-5 text-sm text-danger-text">
            {j.failures.slice(0, 8).map((x) => (
              <li key={x.id}>
                {x.login ?? x.id}: {x.error}
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            className="self-start"
            onClick={() => void betaApi.retryJob(id).then(() => { toast.info('Retrying the failed accounts'); void qc.invalidateQueries({ queryKey: ['betaJob', id] }); }).catch(toast.apiError)}
          >
            Retry failed accounts
          </Button>
        </div>
      ) : null}
    </section>
  );
}
