import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Download } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSocketEvent, useSubscribe } from '../../hooks/useLive';
import { useCan } from '../../hooks/useRole';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDate, formatNumber, formatPercent, formatRelative, formatUsd } from '../../lib/format';
import { qk } from '../../lib/query';
import { Badge, StatusText } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { SectionCard } from '../../ui/Card';
import { StatBar } from '../../ui/Charts';
import { ConfirmDialog } from '../../ui/Dialog';
import { KpiTile } from '../../ui/KpiTile';
import { PageHeader } from '../../ui/PageHeader';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { TabPills } from '../../ui/TabPills';
import { toast } from '../../ui/Toast';
import {
  eventLine,
  MEMBER_TABS,
  planName,
  priceLabel,
  subsApi,
  useMembers,
  useSubsEvents,
  useSubsSummary,
  type Member,
  type MemberTab,
  type SubsSummary,
} from './api';

const REVENUECAT_URL = 'https://app.revenuecat.com';
const STORE = { app_store: 'App Store', play_store: 'Google Play', promotional: 'Gift', stripe: 'Web' } as Record<string, string>;
const storeName = (s: string | null) => (s ? (STORE[s] ?? s) : '—');

/** Price of the regular annual plan once Founding ends (spec §1: $79). Taken from the plan row when RevenueCat reported one. */
function regularAnnual(s: SubsSummary) {
  const p = s.plans.find((x) => x.productId && !/monthly|founding/i.test(x.productId));
  return p?.priceUsd ?? 79;
}

function FoundingCard({ s, canEnd }: { s: SubsSummary; canEnd: boolean }) {
  const f = s.founding;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const price = s.plans.find((p) => p.productId === f.productId)?.priceUsd ?? 59;
  const end = async () => {
    setBusy(true);
    try {
      await subsApi.closeFounding();
      toast.success('Founding offer ended', `New members now see ${formatUsd(regularAnnual(s))}/year.`);
      setConfirm(false);
      await qc.invalidateQueries({ queryKey: qk.subscriptions.summary });
    } catch (e) {
      toast.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      aria-labelledby="founding-title"
      className={cn('flex flex-col gap-4 rounded-card border bg-surface p-5', f.open ? 'border-ember' : 'border-border')}
    >
      <div className="flex items-center gap-3">
        <h2 id="founding-title" className="flex-1 text-h3">
          Founding {formatNumber(f.cap)} · {formatUsd(price)}/year
        </h2>
        <Badge tone={f.open ? 'success' : 'neutral'} caps size="sm">
          {f.open ? 'Live' : 'Ended'}
        </Badge>
      </div>
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="tabular text-kpi font-bold">{formatNumber(f.taken)}</span>
        <span className="text-body text-text-muted">
          of {formatNumber(f.cap)} spots taken
          {f.open ? ` · the app shows “${formatNumber(f.left)} spots left”` : ''}
        </span>
      </p>
      <StatBar value={f.cap ? Math.min(1, f.taken / f.cap) : 0} label="Founding spots taken" />
      <dl className="grid gap-2.5 sm:grid-cols-3">
        {[
          ['Status', f.open ? 'Open' : `Ended ${f.closedAt ? formatDate(f.closedAt) : ''}`],
          ['Ends', `At ${formatNumber(f.cap)} members`],
          ['After it ends', `${formatUsd(regularAnnual(s))}/year`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-tile bg-input px-3.5 py-3">
            <dt className="text-sm text-text-muted">{k}</dt>
            <dd className="text-sm font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-text-muted">
        The cap is hard: at {formatNumber(f.cap)} the app switches to {formatUsd(regularAnnual(s))}/year by itself.
        {f.taken > f.cap ? ' The count can pass the cap for a moment, because the stores report purchases a little later.' : ''}
      </p>
      <div className="flex flex-wrap gap-2.5">
        {f.open && canEnd ? (
          <Button variant="outline" className="text-ember-text" onClick={() => setConfirm(true)}>
            End offer now
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => navigate('/notifications?new=1&audience=founding')}>
          Message Founding members
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="End the Founding offer now?"
        description={`No new Founding spots are sold. New members see the regular plan (${formatUsd(regularAnnual(s))}/year) from now on. The ${formatNumber(f.taken)} Founding members keep their price.`}
        confirmLabel="End offer"
        danger
        loading={busy}
        onConfirm={() => void end()}
      />
    </section>
  );
}

/** Free vs member content, with the real counts of published meditations. */
function Unlocks() {
  const count = (access: 'free' | 'premium') =>
    api<unknown[]>('/v1/admin/sessions', { query: { access, status: 'live', limit: 1 } }).then(
      (r) => (r.meta as { total?: number } | undefined)?.total ?? null,
    );
  const free = useQuery({ queryKey: qk.session.list({ count: 'free' }), queryFn: () => count('free') });
  const premium = useQuery({ queryKey: qk.session.list({ count: 'premium' }), queryFn: () => count('premium') });
  const n = (v: number | null | undefined) => (typeof v === 'number' ? formatNumber(v) : '…');
  return (
    <SectionCard title="What membership unlocks">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-tile bg-input p-3.5">
          <p className="text-overline font-semibold uppercase tracking-wide text-success-text">Free</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            <li>“Free for you”: {n(free.data)} meditations</li>
            <li>SoS sessions</li>
            <li>Daily message</li>
          </ul>
        </div>
        <div className="rounded-tile bg-input p-3.5">
          <p className="text-overline font-semibold uppercase tracking-wide text-ember-text">Members</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            <li>Extended library · {n(premium.data)} premium meditations</li>
            <li>Meditation of the Day · 10, 30, 45 min</li>
            <li>Group meditations · programs</li>
            <li>Dedications · downloads</li>
          </ul>
        </div>
      </div>
      <p className="text-sm text-text-muted">
        Each session’s Free / Premium switch is in the{' '}
        <Link to="/sessions" className="font-semibold text-text underline underline-offset-2">
          session editor
        </Link>
        .
      </p>
    </SectionCard>
  );
}

function Plans({ s }: { s: SubsSummary }) {
  const shown = (productId: string | null) => {
    if (!productId) return { text: '—', tone: 'muted' as const };
    if (/founding/i.test(productId))
      return s.founding.open ? { text: 'Yes · pre-selected', tone: 'success' as const } : { text: 'No · ended', tone: 'muted' as const };
    if (/monthly/i.test(productId)) return { text: 'Yes', tone: 'success' as const };
    return s.founding.open ? { text: 'After the offer', tone: 'muted' as const } : { text: 'Yes · pre-selected', tone: 'success' as const };
  };
  return (
    <SectionCard
      title="Plans"
      action={<span className="text-sm text-text-muted">Product IDs must match App Store Connect, Google Play and RevenueCat</span>}
    >
      {s.plans.length === 0 ? (
        <EmptyState title="No plans yet" description="Plans show here after the first purchase arrives from RevenueCat." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="text-xs font-semibold uppercase tracking-[0.8px] text-text-faint">
              <tr>
                {['Plan', 'Price', 'Product ID', 'Trial', 'Active', 'Shown in app'].map((h) => (
                  <th key={h} className="py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.plans.map((p) => {
                const sh = shown(p.productId);
                return (
                  <tr key={p.productId ?? 'none'} className="border-t border-border text-body">
                    <td className="py-3.5 pr-3 font-semibold">{planName(p.productId)}</td>
                    <td className="py-3.5 pr-3">{priceLabel(p.productId, p.priceUsd)}</td>
                    <td className="py-3.5 pr-3 font-mono text-sm">{p.productId}</td>
                    <td className="py-3.5 pr-3 text-text-muted">{p.trialDays} days</td>
                    <td className="tabular py-3.5 pr-3">{formatNumber(p.active)}</td>
                    <td className="py-3.5">
                      <StatusText tone={sh.tone}>{sh.text}</StatusText>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function memberStatus(m: Member): { text: string; tone: 'success' | 'teal' | 'warning' | 'muted'; when: string } {
  const exp = m.expiresAt ? formatDate(m.expiresAt) : null;
  if (m.billingIssue) return { text: 'Payment problem', tone: 'warning', when: exp ? `Access until ${exp}` : '' };
  if (!m.active) return { text: 'Ended', tone: 'muted', when: exp ? `Ended ${exp}` : '' };
  if (!m.willRenew) return { text: 'Cancelled', tone: 'muted', when: exp ? `Access ends ${exp}` : '' };
  if (m.periodType === 'trial') return { text: 'Trial', tone: 'teal', when: exp ? `Charges ${exp}` : '' };
  return { text: /monthly/i.test(m.productId ?? '') ? 'Monthly' : 'Annual', tone: 'success', when: exp ? `Renews ${exp}` : '' };
}

function Members() {
  const [tab, setTab] = useState<MemberTab>('all');
  const list = useMembers(tab);
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <section aria-labelledby="members-title" className="flex min-w-0 flex-col gap-3.5 rounded-card border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="members-title" className="text-h3">
          Members
        </h2>
        <TabPills label="Filter members" options={[...MEMBER_TABS]} value={tab} onChange={setTab} />
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <SkeletonRows rows={5} label="Loading members" />
      ) : rows.length === 0 ? (
        <EmptyState title="Nobody here yet" description="Members show here as RevenueCat reports their purchases." />
      ) : (
        <ul aria-label="Members" className="flex flex-col">
          {rows.map((m) => {
            const st = memberStatus(m);
            return (
              <li key={m.userId} className="border-t border-border first:border-t-0">
                <Link
                  to={`/users/${m.userId}`}
                  className="grid min-h-14 grid-cols-[minmax(0,1.4fr)_1fr_1fr_1.2fr] items-center gap-3 py-2 hover:bg-surface-alt"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body font-semibold">{m.name ?? 'Guest'}</span>
                    <span className="truncate text-xs text-text-muted">
                      {m.email ?? 'Guest'} · {storeName(m.store)}
                    </span>
                  </span>
                  <span className="text-body">{planName(m.productId, m.isFounding)}</span>
                  <StatusText tone={st.tone}>{st.text}</StatusText>
                  <span className="text-sm text-text-muted">{st.when}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {list.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
    </section>
  );
}

const DOT = { success: 'bg-success', teal: 'bg-teal-text', warning: 'bg-ember', muted: 'bg-text-faint' };

function LatestEvents() {
  const ev = useSubsEvents();
  return (
    <SectionCard title="Latest events">
      {ev.isError ? (
        <ErrorState error={ev.error} onRetry={() => void ev.refetch()} />
      ) : ev.isPending ? (
        <SkeletonRows rows={4} label="Loading events" />
      ) : ev.data.length === 0 ? (
        <p className="text-sm text-text-muted">No subscription events yet.</p>
      ) : (
        <ul aria-label="Latest subscription events" className="flex flex-col">
          {ev.data.map((e) => {
            const l = eventLine(e);
            const who = e.name ?? (e.userId ? 'Guest user' : 'Unknown user');
            return (
              <li key={e.id} className="flex gap-3 border-t border-border py-2.5 first:border-t-0">
                <span aria-hidden className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', DOT[l.tone])} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-body font-semibold">{l.title}</span>
                  <span className="truncate text-xs text-text-muted">
                    {who}
                    {e.priceUsd ? ` · ${formatUsd(e.priceUsd)}` : ''} · {formatRelative(e.eventAt)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

/** 15 Subscriptions: live from RevenueCat via webhooks; prices are set in RevenueCat and the stores. */
export function SubscriptionsPage() {
  const s = useSubsSummary();
  const qc = useQueryClient();
  const canEnd = useCan('settings.manage');
  const canExport = useCan('users.export');
  const [exporting, setExporting] = useState(false);
  useSubscribe(['subscriptions']);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['subs'] });
  };
  useSocketEvent('subs:event', refresh);
  useSocketEvent('config:changed', (p) => p.key === 'founding' && refresh());

  const exportCsv = async () => {
    setExporting(true);
    try {
      await subsApi.exportMembers('all');
    } catch (e) {
      toast.apiError(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Subscriptions"
        subtitle="Live from RevenueCat (App Store + Google Play). Prices are set in RevenueCat and the stores, so the app updates without a new release."
        actions={
          <>
            {canExport ? (
              <Button variant="outline" loading={exporting} onClick={() => void exportCsv()}>
                <Download size={16} aria-hidden />
                Export CSV
              </Button>
            ) : null}
            <a href={REVENUECAT_URL} target="_blank" rel="noreferrer">
              <Button tabIndex={-1}>
                Open RevenueCat
                <ExternalLink size={16} aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </Button>
            </a>
          </>
        }
      />
      {s.isError ? (
        <ErrorState error={s.error} onRetry={() => void s.refetch()} />
      ) : s.isPending ? (
        <SkeletonRows rows={6} label="Loading subscriptions" />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
            <KpiTile
              size="sm"
              label="Paying members"
              value={formatNumber(s.data.payingMembers.total)}
              hint={`Founding ${formatNumber(s.data.payingMembers.founding)} · Annual ${formatNumber(s.data.payingMembers.annual)} · Monthly ${formatNumber(s.data.payingMembers.monthly)}`}
            />
            <KpiTile size="sm" label="In free trial" value={formatNumber(s.data.inTrial)} hint="Annual and monthly, 7 days" />
            <KpiTile size="sm" label="Monthly revenue" value={formatUsd(s.data.mrrUsd)} hint="Before store fees" />
            <KpiTile
              size="sm"
              label="Trial → paid"
              value={s.data.trialToPaid === null ? '—' : formatPercent(s.data.trialToPaid)}
              hint={
                s.data.trialsStarted30d ? `Last 30 days · ${formatNumber(s.data.trialsStarted30d)} trials` : 'No trials in the last 30 days'
              }
            />
            <KpiTile
              size="sm"
              label="Cancelled"
              value={formatNumber(s.data.cancelled)}
              hint={s.data.paymentProblems ? `${formatNumber(s.data.paymentProblems)} with a payment problem` : 'Auto-renew off'}
              hintTone={s.data.paymentProblems ? 'warning' : 'muted'}
            />
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <FoundingCard s={s.data} canEnd={canEnd} />
            <Unlocks />
          </div>
          <Plans s={s.data} />
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Members />
            <LatestEvents />
          </div>
        </>
      )}
    </>
  );
}
