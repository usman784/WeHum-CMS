import { Link } from 'react-router';
import { Plus, ShieldAlert, Clock, Star, MessageSquareWarning } from 'lucide-react';
import { useCan, useAdmin } from '../../hooks/useRole';
import { cn } from '../../lib/cn';
import { formatDate, formatNumber, formatUsd } from '../../lib/format';
import { Badge, StatusText, type BadgeTone } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { SectionCard } from '../../ui/Card';
import { KpiTile } from '../../ui/KpiTile';
import { PageHeader } from '../../ui/PageHeader';
import { StatBar } from '../../ui/Charts';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { dayTitle } from '../daily/api';
import { isFull, shortDay, useDashboard, type Attention, type Dashboard } from './api';
import { useSubscribe } from '../../hooks/useLive';

const MSG_TONE: Record<string, { label: string; tone: BadgeTone }> = {
  live: { label: 'Live', tone: 'success' },
  scheduled: { label: 'Scheduled', tone: 'teal' },
  draft: { label: 'Draft', tone: 'warning' },
  archived: { label: 'Archived', tone: 'neutral' },
  missing: { label: 'Missing', tone: 'danger' },
};
const TYPE_LABEL = { audio: 'Audio', video: 'Video', text: 'Text' } as const;

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** One "needs attention" row: what, why it matters, where to fix it. */
function attentionRow(a: Attention): {
  icon: typeof ShieldAlert;
  title: string;
  text: string;
  to: string;
  tone: 'ember' | 'neutral' | 'teal';
} {
  switch (a.kind) {
    case 'reported_dedications':
      return {
        icon: ShieldAlert,
        title: `${a.count} ${a.count === 1 ? 'dedication needs' : 'dedications need'} review`,
        text: 'Review before they stay public',
        to: '/moderation',
        tone: 'ember',
      };
    case 'missing_daily_message':
      return {
        icon: MessageSquareWarning,
        title: `${dayTitle(a.date)}’s Daily Message is missing`,
        text: 'Users get it at their reminder time',
        to: '/daily-messages',
        tone: 'neutral',
      };
    case 'motd_missing_variant':
      return {
        icon: Clock,
        title: `${a.lengths.map((l) => `${l}-min`).join(', ')} version missing for ${dayTitle(a.date)}`,
        text: `${a.title} needs 10, 30 and 45 min`,
        to: '/today',
        tone: 'neutral',
      };
    case 'motd_missing':
      return {
        icon: Clock,
        title: `No Meditation of the Day for ${dayTitle(a.date)}`,
        text: 'The app falls back to the most played meditation',
        to: '/today',
        tone: 'neutral',
      };
    case 'founding':
      return {
        icon: Star,
        title: `Founding ${formatNumber(a.cap)}: ${formatNumber(a.taken)} taken`,
        text: `Closes at ${formatNumber(a.cap)} members`,
        to: '/subscriptions',
        tone: 'teal',
      };
  }
}

function Attention({ items }: { items: Attention[] }) {
  return (
    <SectionCard title="Needs attention">
      {items.length === 0 ? (
        <p className="text-body text-text-muted">Nothing needs you right now.</p>
      ) : (
        <ul aria-label="Needs attention" className="flex flex-col gap-2.5">
          {items.map((a, i) => {
            const r = attentionRow(a);
            return (
              <li key={`${a.kind}-${i}`}>
                <Link
                  to={r.to}
                  className={cn(
                    'flex items-center gap-3 rounded-tile px-3.5 py-3 hover:bg-surface-alt',
                    r.tone === 'ember' ? 'bg-ember/10' : 'bg-input',
                  )}
                >
                  <r.icon
                    size={18}
                    aria-hidden
                    className={r.tone === 'ember' ? 'text-ember-text' : r.tone === 'teal' ? 'text-teal-text' : 'text-text-muted'}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-semibold">{r.title}</span>
                    <span className="truncate text-sm text-text-muted">{r.text}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function FullDashboard({ d }: { d: Dashboard }) {
  const k = d.kpis;
  const delta = k.meditationsDeltaPct;
  const items = d.needsAttention.map((a) => (a.kind === 'reported_dedications' ? { ...a, count: k.moderationOpen ?? a.count } : a));
  return (
    <>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Meditating right now"
          value={formatNumber(k.liveNow)}
          live
          hint={k.liveCountries ? `Across ${k.liveCountries} ${k.liveCountries === 1 ? 'country' : 'countries'}` : 'Nobody right now'}
        />
        <KpiTile
          label="Meditations today"
          value={formatNumber(k.meditationsToday)}
          hint={
            delta === null
              ? 'No data for last week'
              : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}% vs last ${new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date())}`
          }
          hintTone={delta === null ? 'muted' : delta >= 0 ? 'success' : 'warning'}
        />
        <KpiTile
          label="Paying members"
          value={formatNumber(k.payingMembers)}
          hint={`${formatNumber(k.inTrial)} in trial · ${formatUsd(k.mrrUsd)} / month`}
        />
        <KpiTile
          label="Library"
          value={formatNumber(k.library.sessions)}
          hint={`sessions · ${k.library.programs} programs · ${k.library.themes} themes`}
        />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <SectionCard
            title="Daily Messages this week"
            action={
              <Link to="/daily-messages" className="text-sm font-semibold text-text-muted hover:text-text">
                Open calendar
              </Link>
            }
          >
            <ul aria-label="Daily messages this week" className="flex flex-col">
              {d.dailyMessages.map((m) => (
                <li
                  key={m.date}
                  className="grid min-h-12 grid-cols-[110px_minmax(0,1fr)_70px_110px] items-center gap-3 border-t border-border first:border-t-0"
                >
                  <span className="text-sm text-text-muted">{shortDay(m.date)}</span>
                  <span className={cn('truncate text-body', !m.title && 'text-text-muted')}>{m.title ?? 'No message yet'}</span>
                  <span className="text-xs text-text-muted">{m.type ? TYPE_LABEL[m.type] : '—'}</span>
                  <Badge tone={MSG_TONE[m.status]!.tone} caps size="sm" className="justify-self-end">
                    {MSG_TONE[m.status]!.label}
                  </Badge>
                </li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard
            title="Top sessions, last 7 days"
            action={
              <Link to="/sessions" className="text-sm font-semibold text-text-muted hover:text-text">
                All sessions
              </Link>
            }
          >
            {d.topSessions.length === 0 ? (
              <EmptyState title="No meditations yet" description="The most played sessions of the week show here." />
            ) : (
              <table className="w-full text-left">
                <thead className="text-xs font-semibold uppercase tracking-[0.8px] text-text-faint">
                  <tr>
                    <th className="py-2 font-semibold">Session</th>
                    <th className="py-2 font-semibold">Theme</th>
                    <th className="py-2 font-semibold">Plays</th>
                    <th className="py-2 font-semibold">Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {d.topSessions.map((s) => (
                    <tr key={s.id} className="border-t border-border text-body">
                      <td className="py-3 pr-3 font-medium">{s.title}</td>
                      <td className="py-3 pr-3 text-text-muted">{s.theme ?? '—'}</td>
                      <td className="tabular py-3 pr-3">{formatNumber(s.plays)}</td>
                      <td className="py-3">
                        {s.completion === null ? '—' : <StatBar value={s.completion} label={`${s.title} completion`} showValue />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>
        <div className="flex flex-col gap-5">
          <Attention items={items} />
          <SectionCard title="Next group meditation" action={<StatusText tone="muted">{d.nextGroup.state}</StatusText>}>
            <div className="flex items-center gap-4">
              <span className="tabular text-h2">{new Date(d.nextGroup.startsAt).toISOString().slice(11, 16)}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-semibold">{d.nextGroup.title ?? 'Meditation of the Day'}</span>
                <span className="text-sm text-text-muted">
                  {d.nextGroup.lengthMin} min · UTC · {formatDate(d.nextGroup.startsAt)}
                </span>
              </span>
              <span className="tabular text-sm text-text-muted">
                {d.nextGroup.waiting ? `${formatNumber(d.nextGroup.waiting)} waiting` : ''}
              </span>
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

/** 01 Dashboard: what is happening now and what needs you. Live numbers come over the socket; the rest on load and on change. */
export function DashboardPage() {
  const admin = useAdmin();
  const canCreate = useCan('content.edit');
  const { data, isPending, error, refetch } = useDashboard();
  useSubscribe(['dashboard']);
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  const first = admin?.name.split(' ')[0] ?? '';
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${greeting()}, ${first} · ${today}`}
        actions={
          canCreate ? (
            <Link to="/sessions/new">
              <Button>
                <Plus size={16} aria-hidden />
                New session
              </Button>
            </Link>
          ) : undefined
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <SkeletonRows rows={6} label="Loading the dashboard" />
      ) : isFull(data) ? (
        <FullDashboard d={data} />
      ) : (
        <div className="max-w-xl">
          <Attention
            items={data.needsAttention.map((a) => (a.kind === 'reported_dedications' ? { ...a, count: data.moderationOpen } : a))}
          />
          <p className="mt-4 text-sm text-text-muted">
            Moderators see the moderation numbers here. The{' '}
            <Link to="/moderation" className="font-semibold underline underline-offset-2">
              queue
            </Link>{' '}
            has the posts.
          </p>
        </div>
      )}
    </>
  );
}
