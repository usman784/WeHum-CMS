import { useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useDebounced } from '../../hooks/useDebounced';
import { useSocketEvent, useSocketStatus, useSubscribe } from '../../hooks/useLive';
import { useCan } from '../../hooks/useRole';
import { formatDate, formatNumber, formatRelative, initials } from '../../lib/format';
import { qk } from '../../lib/query';
import { Badge, type BadgeTone } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { DataTable, type Column } from '../../ui/DataTable';
import { SearchInput } from '../../ui/Input';
import { PageHeader } from '../../ui/PageHeader';
import { EmptyState } from '../../ui/States';
import { TabPills } from '../../ui/TabPills';
import { toast } from '../../ui/Toast';
import {
  countryName,
  USER_TABS,
  useUsers,
  userSubline,
  usersApi,
  type Membership,
  type UserCounts,
  type UserRow,
  type UserTab,
} from './api';

export const MEMBERSHIP_TONE: Record<Membership['plan'], BadgeTone> = {
  founding: 'ember',
  annual: 'ember',
  monthly: 'ember',
  trial: 'teal',
  cancelled: 'neutral',
  free: 'neutral',
};

/** Coloured initial, as in the design (stable per user). */
export function Avatar({ name, id, size = 40 }: { name: string | null; id: string; size?: number }) {
  const tones = ['bg-teal text-teal-text', 'bg-ember/15 text-ember-text', 'bg-info text-info-text', 'bg-lilac text-lilac-text'];
  const tone = tones[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % tones.length];
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${tone}`}
    >
      {name ? initials(name).slice(0, size > 48 ? 2 : 1) : 'G'}
    </span>
  );
}

function useFilters(): [{ tab: UserTab; q: string }, (p: Partial<{ tab: UserTab; q: string }>) => void] {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab');
  const f = { tab: USER_TABS.some((t) => t.value === tab) ? (tab as UserTab) : 'all', q: params.get('q') ?? '' };
  const set = (p: Partial<typeof f>) => {
    const next = { ...f, ...p };
    const sp = new URLSearchParams();
    if (next.tab !== 'all') sp.set('tab', next.tab);
    if (next.q) sp.set('q', next.q);
    setParams(sp, { replace: true });
  };
  return [f, set];
}

/** 16 Users & members: server search (name, email prefix or id), tabs, cursor pages; new sign-ups arrive live. */
export function UsersPage() {
  const [filters, setFilters] = useFilters();
  const [search, setSearch] = useState(filters.q);
  const q = useDebounced(search, 300);
  useEffect(() => {
    if (q !== filters.q) setFilters({ q });
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useUsers(filters);
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const counts = (list.data?.pages[0]?.meta as { counts?: UserCounts } | undefined)?.counts;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canExport = useCan('users.export');
  const live = useSocketStatus() === 'live';
  const [fresh, setFresh] = useState(0);
  const [exporting, setExporting] = useState(false);

  useSubscribe(['users']);
  useSocketEvent('users:new', (p) => setFresh((n) => n + p.count));
  const showNew = () => {
    setFresh(0);
    void qc.invalidateQueries({ queryKey: [...qk.user.all, 'list'] });
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await usersApi.exportCsv(filters);
    } catch (e) {
      toast.apiError(e);
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<UserRow>[] = [
    {
      id: 'user',
      header: 'User',
      width: '2.4fr',
      hideable: false,
      cell: (u) => (
        <Link to={`/users/${u.id}`} className="flex min-w-0 items-center gap-3">
          <Avatar name={u.name} id={u.id} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-body font-semibold">{u.name ?? 'Guest'}</span>
            <span className="truncate text-xs text-text-muted">{userSubline(u)}</span>
          </span>
        </Link>
      ),
    },
    {
      id: 'membership',
      header: 'Membership',
      width: '1.3fr',
      cell: (u) => (
        <Badge tone={MEMBERSHIP_TONE[u.membership.plan]} size="sm">
          {u.membership.label}
        </Badge>
      ),
    },
    {
      id: 'week',
      header: 'This week',
      width: '0.9fr',
      cell: (u) => <span className="tabular">{u.weekMinutes ? `${u.weekMinutes} min` : '—'}</span>,
    },
    {
      id: 'meditations',
      header: 'Meditations',
      width: '0.9fr',
      cell: (u) => <span className="tabular">{formatNumber(u.meditations)}</span>,
    },
    { id: 'country', header: 'Country', width: '1.2fr', cell: (u) => <span className="text-text-muted">{countryName(u.country)}</span> },
    {
      id: 'joined',
      header: 'Joined',
      width: '1fr',
      cell: (u) => <span className="text-sm text-text-muted">{formatDate(u.joinedAt)}</span>,
    },
    {
      id: 'active',
      header: 'Last active',
      width: '1fr',
      cell: (u) => <span className="text-sm text-text-muted">{formatRelative(u.lastActiveAt)}</span>,
    },
  ];

  const filtered = filters.tab !== 'all' || !!filters.q;
  const subtitle = counts
    ? `${formatNumber(counts.all)} people · ${formatNumber(counts.accounts)} with an account · ${formatNumber(counts.guests)} guests · ${formatNumber(counts.paying)} paying · ${formatNumber(counts.trial)} in trial`
    : 'Everyone who uses the app, with or without an account.';

  return (
    <>
      <PageHeader
        title="Users & Members"
        subtitle={subtitle}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/subscriptions')}>
              Subscriptions
            </Button>
            {canExport ? (
              <Button variant="outline" loading={exporting} onClick={() => void exportCsv()}>
                <Download size={16} aria-hidden />
                Export CSV
              </Button>
            ) : null}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          label="Search users"
          placeholder="Search name, email or user ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <TabPills label="Filter users" options={[...USER_TABS]} value={filters.tab} onChange={(tab) => setFilters({ tab })} />
      </div>
      <p className="rounded-card border border-dashed border-border-strong px-4 py-3 text-sm text-text-muted">
        A <strong className="text-text">guest</strong> uses the app without an account (Apple allows this, and they can still subscribe). If
        they later save their progress, the guest record and purchase move into the new account automatically.
      </p>
      {fresh > 0 ? (
        <Button variant="secondary" size="sm" className="self-start" onClick={showNew}>
          {fresh === 1 ? '1 new person' : `${formatNumber(fresh)} new people`} · show
        </Button>
      ) : null}
      <DataTable
        label="Users"
        columns={columns}
        rows={rows}
        rowKey={(u) => u.id}
        loading={list.isPending}
        error={list.isError ? list.error : undefined}
        onRetry={() => void list.refetch()}
        onRowClick={(u) => navigate(`/users/${u.id}`)}
        empty={
          filtered ? (
            <EmptyState
              title="Nobody matches"
              description="Search by first name, the start of an email, or a full user ID."
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setFilters({ tab: 'all', q: '' });
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState title="No users yet" description="People show here after they open the app for the first time." />
          )
        }
        summary={
          counts
            ? `Showing ${formatNumber(rows.length)}${filtered ? '' : ` of ${formatNumber(counts.all)}`} · sorted by last active${live ? '' : ' · live updates paused'}`
            : undefined
        }
      />
      {list.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          className="self-end"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
    </>
  );
}
