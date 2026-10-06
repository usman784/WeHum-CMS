import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useSocketEvent, useSubscribe } from '../../hooks/useLive';
import { useCan } from '../../hooks/useRole';
import { ApiError } from '../../lib/api';
import { formatDate, formatNumber, formatRelative } from '../../lib/format';
import { qk } from '../../lib/query';
import { Badge, StatusText } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { SectionCard } from '../../ui/Card';
import { StatBar } from '../../ui/Charts';
import { ConfirmDialog } from '../../ui/Dialog';
import { IconButton } from '../../ui/IconButton';
import { KpiTile } from '../../ui/KpiTile';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { toast } from '../../ui/Toast';
import { planName } from '../subscriptions/api';
import { Avatar, MEMBERSHIP_TONE } from './Page';
import { countryName, deleteConfirmText, providerNames, useJob, useUser, usersApi, type ExportResult, type UserDetail } from './api';

const STORE = { app_store: 'App Store', play_store: 'Google Play', promotional: 'Gift (promotional)', stripe: 'Web' } as Record<
  string,
  string
>;
const KIND = { solo: 'Solo', group: 'Group', motd: 'Daily', custom: 'Custom', sos: 'SoS', program: 'Program' } as Record<string, string>;
const GIFT_DAYS = 30;

const shortId = (id: string) => `${id.slice(0, 4)}…${id.slice(-3)}`;
const dayTime = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = same(d, today) ? 'Today' : same(d, yesterday) ? 'Yesterday' : formatDate(d).replace(/, \d{4}$/, '');
  return `${day} · ${d.toTimeString().slice(0, 5)}`;
};

function headerLine(u: UserDetail) {
  const parts = [u.email ?? 'Guest · no account yet', `User ID ${shortId(u.id)}`];
  if (u.accountSavedAt)
    parts.push(
      `account saved with ${providerNames(u.providers) || 'email'}${u.wasGuestDays ? ` (was a guest for ${u.wasGuestDays} ${u.wasGuestDays === 1 ? 'day' : 'days'})` : ''}`,
    );
  const dev = u.devices[0];
  if (dev) parts.push(dev.model ?? (dev.platform === 'ios' ? 'iPhone' : 'Android'));
  return parts.join(' · ');
}

function Membership({ u, onGift, gifting, canGift }: { u: UserDetail; onGift: () => void; gifting: boolean; canGift: boolean }) {
  const m = u.membership;
  const status =
    m.status === 'free'
      ? { text: 'No membership', tone: 'muted' as const }
      : m.billingIssue
        ? { text: 'Payment problem · grace period', tone: 'warning' as const }
        : m.status === 'cancelling'
          ? { text: 'Active · auto-renew off', tone: 'warning' as const }
          : m.status === 'cancelled'
            ? { text: 'Ended', tone: 'muted' as const }
            : m.status === 'trial'
              ? { text: 'Trial', tone: 'teal' as const }
              : { text: 'Active · auto-renew on', tone: 'success' as const };
  const rows: [string, React.ReactNode][] = [
    ['Plan', m.productId ? planName(m.productId, m.plan === 'founding') : m.label],
    ['Store', m.store ? (STORE[m.store] ?? m.store) : '—'],
    ['Started', m.startedAt ? formatDate(m.startedAt) : '—'],
    [m.willRenew ? 'Renews' : 'Ends', m.expiresAt ? formatDate(m.expiresAt) : '—'],
    [
      'Status',
      <StatusText key="s" tone={status.tone}>
        {status.text}
      </StatusText>,
    ],
    [
      'RevenueCat ID',
      <span key="r" className="font-mono text-sm">
        {shortId(m.revenueCatId)}
      </span>,
    ],
  ];
  return (
    <SectionCard title="Membership">
      <dl className="flex flex-col gap-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 text-body">
            <dt className="text-text-muted">{k}</dt>
            <dd className="text-right font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <Link to="/subscriptions" className="text-sm font-semibold text-text-muted hover:text-text">
        See all subscription events →
      </Link>
      <p className="text-xs text-text-faint">Billing is handled by Apple and Google. Refunds happen in the store, not here.</p>
      {canGift ? (
        <Button variant="outline" loading={gifting} onClick={onGift}>
          Gift {GIFT_DAYS} days premium
        </Button>
      ) : null}
    </SectionCard>
  );
}

const DATA = [
  ['Name', 'First name from onboarding'],
  ['Email', 'Only if they saved an account'],
  ['Sign-in method', 'Apple · Google · Email'],
  ['Country', 'From device settings, for the world map'],
  ['Meditations & minutes', 'To show progress and history'],
  ['Goals & reminder time', 'From onboarding'],
  ['Posts', 'Dedications and gratitude'],
  ['Purchase status', 'From RevenueCat (plan, renew date)'],
];

function DataWeCollect() {
  return (
    <SectionCard title="Data we collect" description="The same list the app shows in Privacy. Nothing else is stored.">
      <dl className="flex flex-col">
        {DATA.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-t border-border py-2 text-sm">
            <dt className="font-semibold">{k}</dt>
            <dd className="text-right text-text-muted">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-text-faint">No payment card details. No location beyond country. No contacts, no health data.</p>
    </SectionCard>
  );
}

/** Progress of an export or delete job (pushed over the socket, polled while offline). */
function JobProgress({ id, label, onDone }: { id: string; label: string; onDone?: (result: unknown) => void }) {
  const job = useJob(id);
  const st = job.data?.status;
  useEffect(() => {
    if (st === 'done') onDone?.(job.data?.result);
  }, [st]); // eslint-disable-line react-hooks/exhaustive-deps
  if (st === 'failed')
    return (
      <p role="alert" className="text-sm text-danger-text">
        {label} failed: {job.data?.error ?? 'unknown error'}. Try again.
      </p>
    );
  if (st === 'done') return null;
  return (
    <div role="status" className="flex flex-col gap-1.5">
      <span className="text-sm text-text-muted">
        {label}… {job.data ? `${job.data.progress}%` : ''}
      </span>
      <StatBar value={(job.data?.progress ?? 0) / 100} label={`${label} progress`} />
    </div>
  );
}

function SupportActions({ u }: { u: UserDetail }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canExport = useCan('users.export');
  const canDelete = useCan('users.delete');
  const canMute = useCan('moderation.act');
  const [exportJob, setExportJob] = useState<string | null>(null);
  const [links, setLinks] = useState<ExportResult | null>(null);
  const [deleteJob, setDeleteJob] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<'export' | 'mute' | 'delete' | null>(null);
  const confirmText = deleteConfirmText(u);
  const hasStoreSub = u.membership.willRenew && !!u.membership.store && u.membership.store !== 'promotional';

  const run = async (kind: 'export' | 'mute' | 'delete', fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      toast.apiError(e);
    } finally {
      setBusy(null);
    }
  };
  if (!canExport && !canDelete && !canMute) return null;
  return (
    <SectionCard title="Support actions">
      {canExport ? (
        <Button
          variant="outline"
          loading={busy === 'export'}
          disabled={!!exportJob && !links}
          onClick={() =>
            void run('export', async () => {
              setLinks(null);
              setExportJob((await usersApi.exportData(u.id)).jobId);
            })
          }
        >
          Export user data (JSON + CSV)
        </Button>
      ) : null}
      {exportJob && !links ? (
        <JobProgress
          id={exportJob}
          label="Preparing the export"
          onDone={(r) => {
            setLinks(r as ExportResult);
            toast.success('Export ready', 'The download links work for 24 hours.');
          }}
        />
      ) : null}
      {links ? (
        <p className="flex flex-wrap gap-3 text-sm">
          <a className="font-semibold underline underline-offset-2" href={links.json} target="_blank" rel="noreferrer">
            Download JSON
          </a>
          <a className="font-semibold underline underline-offset-2" href={links.csv} target="_blank" rel="noreferrer">
            Download meditations CSV
          </a>
          <span className="text-text-muted">Links work for {links.expiresInHours} hours.</span>
        </p>
      ) : null}
      {canMute ? (
        <Button
          variant="outline"
          loading={busy === 'mute'}
          onClick={() =>
            void run('mute', async () => {
              await usersApi.mute(u.id, !u.muted);
              toast.success(
                u.muted ? 'Can post again' : 'Muted in the Together feed',
                u.muted ? undefined : 'Their posts are hidden from others.',
              );
              await qc.invalidateQueries({ queryKey: qk.user.detail(u.id) });
            })
          }
        >
          {u.muted ? 'Unmute in Together feed' : 'Mute in Together feed'}
        </Button>
      ) : null}
      {canDelete ? (
        <Button variant="danger" disabled={!!deleteJob} onClick={() => setConfirmDelete(true)}>
          Delete account and data
        </Button>
      ) : null}
      {deleteJob ? (
        <JobProgress
          id={deleteJob}
          label="Deleting the account"
          onDone={() => {
            toast.success('Account and data deleted');
            void qc.invalidateQueries({ queryKey: qk.user.all });
            navigate('/users', { replace: true });
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${u.name ?? 'this guest'} and all their data?`}
        description="Meditations, posts, devices and the account are removed for good. This cannot be undone."
        confirmLabel="Delete account and data"
        danger
        typeToConfirm={confirmText}
        loading={busy === 'delete'}
        onConfirm={() =>
          void run('delete', async () => {
            setDeleteJob((await usersApi.remove(u.id, confirmText)).jobId);
            setConfirmDelete(false);
          })
        }
      >
        {hasStoreSub ? (
          <p role="alert" className="rounded-tile bg-warning/15 px-3.5 py-3 text-sm text-warning">
            Their {STORE[u.membership.store!] ?? 'store'} subscription is not cancelled by this. They must cancel it in the store, or they
            keep being charged.
          </p>
        ) : null}
      </ConfirmDialog>
    </SectionCard>
  );
}

/** 17 User detail: what support needs about one person, and the support actions. */
export function UserDetailPage() {
  const { id } = useParams();
  const user = useUser(id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const canGift = useCan('users.gift');
  const [gone, setGone] = useState(false);
  const [gifting, setGifting] = useState(false);
  useSubscribe(['jobs']);
  useSocketEvent('entity:changed', (e) => {
    if (e.type !== 'user' || e.id !== id) return;
    if (e.op === 'delete') setGone(true);
    else void qc.invalidateQueries({ queryKey: qk.user.detail(id!) });
  });
  const notFound = user.error instanceof ApiError && user.error.status === 404;

  const gift = async () => {
    setGifting(true);
    try {
      const r = await usersApi.gift(id!, GIFT_DAYS);
      toast.success(`${GIFT_DAYS} days premium given`, r.expiresAt ? `Premium until ${formatDate(r.expiresAt)}.` : undefined);
      await qc.invalidateQueries({ queryKey: qk.user.detail(id!) });
    } catch (e) {
      toast.apiError(e);
    } finally {
      setGifting(false);
    }
  };

  const back = (
    <IconButton label="Back to users" variant="solid" size="md" onClick={() => navigate('/users')}>
      <ArrowLeft size={18} aria-hidden />
    </IconButton>
  );

  if (notFound || (gone && !user.data))
    return (
      <>
        {back}
        <EmptyState title="This user no longer exists" description="The account was deleted. Their data is gone." />
      </>
    );
  if (user.isError) return <ErrorState error={user.error} onRetry={() => void user.refetch()} />;
  if (user.isPending) return <SkeletonRows rows={8} label="Loading the user" />;
  const u = user.data;
  const memberBadge =
    u.membership.plan === 'free'
      ? null
      : u.membership.plan === 'trial'
        ? 'In trial'
        : u.membership.plan === 'cancelled'
          ? 'Former member'
          : `${u.membership.plan === 'monthly' ? 'Monthly' : 'Annual'} member`;
  return (
    <>
      {gone ? (
        <p role="alert" className="rounded-btn border border-danger-border bg-danger/10 px-4 py-3 text-sm text-danger-text">
          This user was just deleted by another admin. What you see is no longer stored.
        </p>
      ) : null}
      <header className="flex flex-wrap items-center gap-4">
        {back}
        <Avatar name={u.name} id={u.id} size={56} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-h1">{u.name ?? 'Guest'}</h1>
            {memberBadge ? (
              <Badge tone={MEMBERSHIP_TONE[u.membership.plan]} caps size="sm">
                {memberBadge}
              </Badge>
            ) : null}
            {u.muted ? (
              <Badge tone="warning" size="sm">
                Muted
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-text-muted">{headerLine(u)}</p>
        </div>
      </header>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile
              size="sm"
              label="This week"
              value={`${u.stats.weekDays} ${u.stats.weekDays === 1 ? 'day' : 'days'}`}
              hint={`${formatNumber(u.stats.weekMinutes)} min meditated`}
            />
            <KpiTile
              size="sm"
              label="Meditations"
              value={formatNumber(u.stats.meditations)}
              hint={`${formatNumber(u.stats.groupMeditations)} in groups`}
            />
            <KpiTile
              size="sm"
              label="Minutes"
              value={formatNumber(u.stats.minutes)}
              hint={u.stats.avgMinutes === null ? 'No meditations yet' : `avg ${u.stats.avgMinutes} min each`}
            />
            <KpiTile
              size="sm"
              label="Daily reminder"
              value={u.reminder.enabled ? u.reminder.time : 'Off'}
              hint={`${u.reminder.enabled ? 'Reminder on' : 'Reminder off'} · ${u.reminder.timezone.split('/').pop()?.replace(/_/g, ' ')}`}
            />
          </div>
          <SectionCard title="Recent meditations">
            {u.recentMeditations.length === 0 ? (
              <p className="text-sm text-text-muted">No meditations yet.</p>
            ) : (
              <ul aria-label="Recent meditations" className="flex flex-col">
                {u.recentMeditations.map((m) => (
                  <li
                    key={m.id}
                    className="grid grid-cols-[130px_minmax(0,1fr)_80px_60px] items-center gap-3 border-t border-border py-3 first:border-t-0"
                  >
                    <span className="text-sm text-text-muted">{dayTime(m.startedAt)}</span>
                    <span className="truncate text-body">{m.session ?? 'Silence timer'}</span>
                    <span className="text-xs text-text-muted">{KIND[m.kind] ?? m.kind}</span>
                    <span className="tabular text-right text-body">{m.durationSec ? `${Math.round(m.durationSec / 60)} min` : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Dedications by this user">
            {u.dedications.length === 0 ? (
              <p className="text-sm text-text-muted">No dedications yet.</p>
            ) : (
              <ul aria-label="Dedications by this user" className="flex flex-col gap-2.5">
                {u.dedications.map((d) => (
                  <li key={d.id} className="flex items-start gap-3 rounded-tile bg-input px-3.5 py-3">
                    <span className="flex-1 text-body">“{d.text}”</span>
                    <span className="shrink-0 text-right text-xs text-text-muted">
                      {formatRelative(d.createdAt)} · {formatNumber(d.holdingCount)} holding
                      {d.status !== 'visible' ? (
                        <>
                          <br />
                          <span className="font-semibold capitalize">{d.status}</span>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
        <div className="flex flex-col gap-5">
          <Membership u={u} onGift={() => void gift()} gifting={gifting} canGift={canGift} />
          <DataWeCollect />
          <SupportActions u={u} />
          <p className="text-xs text-text-faint">
            {countryName(u.country)} · joined {formatDate(u.joinedAt)} · last active {formatRelative(u.lastActiveAt)}
          </p>
        </div>
      </div>
    </>
  );
}
