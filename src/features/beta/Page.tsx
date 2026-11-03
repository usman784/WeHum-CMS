import { useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDebounced } from '../../hooks/useDebounced';
import { useSocketEvent, useSocketStatus, useSubscribe } from '../../hooks/useLive';
import { useCan } from '../../hooks/useRole';
import { formatDate, formatNumber } from '../../lib/format';
import { qk } from '../../lib/query';
import { Badge, type BadgeTone } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { DataTable, type Column } from '../../ui/DataTable';
import { SearchInput } from '../../ui/Input';
import { KpiTile } from '../../ui/KpiTile';
import { PageHeader } from '../../ui/PageHeader';
import { Select } from '../../ui/Select';
import { EmptyState } from '../../ui/States';
import { toast } from '../../ui/Toast';
import { AvatarStatus, OnlineText, useUserPresence } from '../users/presence';
import { Avatar } from '../users/Page';
import {
  ACCESS_FILTERS,
  betaApi,
  PRESENCE_FILTERS,
  STATE_FILTERS,
  useBetaBatches,
  useBetaSummary,
  useBetaUsers,
  type BetaFilter,
  type BetaRow,
  type BetaSource,
  type BetaState,
  type BulkAction,
  type Selection,
} from './api';
import { BULK_LABEL, BulkDialog, GenerateDialog, ImportDialog, JobPanel, ManageDialog } from './Dialogs';

const SOURCE_TONE: Record<BetaSource, BadgeTone> = { none: 'neutral', paid: 'ember', beta: 'teal', 'paid+beta': 'ember' };
const STATE_TONE: Record<BetaState, BadgeTone> = { active: 'teal', suspended: 'warning', deleting: 'danger' };
const STATE_TEXT: Record<BetaState, string> = { active: 'Active', suspended: 'Suspended', deleting: 'Deleting' };
const BULK: BulkAction[] = ['grant', 'extend', 'remove', 'suspend', 'resume', 'delete'];

/** Beta Testers: separate test accounts in groups, with search, filters, one-by-one controls and bulk actions that run as tracked jobs. */
export function BetaTestersPage() {
  const canManage = useCan('beta.manage');
  const qc = useQueryClient();
  const [filter, setFilter] = useState<BetaFilter>({});
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  useEffect(() => {
    setFilter((f) => (f.q === (q.trim() || undefined) ? f : { ...f, q: q.trim() || undefined }));
  }, [q]);

  const users = useBetaUsers(filter);
  const summary = useBetaSummary(filter.batchId);
  const batches = useBetaBatches();
  const rows = users.data?.pages.flatMap((p) => p.data) ?? [];
  const matching = (users.data?.pages[0]?.meta as { total?: number } | undefined)?.total ?? rows.length;
  const live = useSocketStatus() === 'live';

  // selection: the ticked rows, or "everything that matches the filters" (resolved by the server into a fixed list when a job starts)
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const clearSelection = () => {
    setPicked(new Set());
    setAllMatching(false);
  };
  const filterKey = JSON.stringify(filter);
  useEffect(clearSelection, [filterKey]);
  const count = allMatching ? matching : picked.size;
  const selection: Selection = allMatching ? { all: true, filter } : { ids: [...picked] };
  const group = batches.data?.find((b) => b.id === filter.batchId);
  const scope = `${group ? group.name : 'All groups'}${allMatching ? ` · all ${formatNumber(matching)} matching accounts` : ` · ${picked.size} selected`}`;

  const [bulk, setBulk] = useState<BulkAction | null>(null);
  const [manage, setManage] = useState<BetaRow | null>(null);
  const [generate, setGenerate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [job, setJob] = useState<{ id: string; label: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  // live: presence dots, and any change of a test account or group refreshes the lists
  useSubscribe(['users', 'entities']);
  const presence = useUserPresence();
  const fetchedAt = users.dataUpdatedAt;
  useEffect(() => presence.reset(), [fetchedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useSocketEvent('entity:changed', (e) => {
    if (e.type !== 'user' && e.type !== 'betaBatch') return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void qc.invalidateQueries({ queryKey: qk.betaBatch.all }), 600);
  });
  useEffect(() => () => clearTimeout(timer.current), []);
  const onlineNow = summary.data ? Math.max(0, summary.data.online + presence.delta) : undefined;

  const columns = useMemo<Column<BetaRow>[]>(
    () => [
      {
        id: 'login',
        header: 'Test login / name',
        width: '2.2fr',
        hideable: false,
        cell: (u) => (
          <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => setManage(u)}>
            <AvatarStatus online={presence.of(u).online}>
              <Avatar name={u.name ?? u.login} id={u.id} />
            </AvatarStatus>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-mono text-body font-semibold">{u.login}</span>
              <span className="truncate text-xs text-text-muted">{[u.name, u.batch?.name].filter(Boolean).join(' · ') || 'No name'}</span>
            </span>
          </button>
        ),
      },
      {
        id: 'access',
        header: 'Access',
        width: '1.3fr',
        cell: (u) => (
          <Badge tone={SOURCE_TONE[u.access.source]} size="sm">
            {u.provisioning === 'ready' ? u.access.label : `${u.access.label} · setup ${u.provisioning}`}
          </Badge>
        ),
      },
      {
        id: 'state',
        header: 'Account',
        width: '1fr',
        cell: (u) => (
          <Badge tone={STATE_TONE[u.state]} size="sm">
            {STATE_TEXT[u.state]}
          </Badge>
        ),
      },
      { id: 'presence', header: 'Last seen', width: '1.2fr', cell: (u) => <OnlineText p={presence.of(u)} /> },
      {
        id: 'expires',
        header: 'Beta ends',
        width: '1fr',
        cell: (u) => <span className="text-sm text-text-muted">{u.access.betaExpiresAt ? formatDate(u.access.betaExpiresAt) : '—'}</span>,
      },
      {
        id: 'manage',
        header: 'Manage',
        srOnlyHeader: true,
        width: '110px',
        align: 'right',
        cell: (u) => (
          <Button size="sm" variant="outline" onClick={() => setManage(u)} aria-label={`Manage ${u.login}`}>
            Manage
          </Button>
        ),
      },
    ],
    [presence],
  );

  const s = summary.data;
  const filtered = !!(filter.q || filter.access || filter.state || filter.presence || filter.batchId);
  const groupOptions = [{ value: '', label: 'All groups' }, ...(batches.data ?? []).map((b) => ({ value: b.id, label: `${b.name} (${b.accounts})` }))];
  const set = (p: Partial<BetaFilter>) => setFilter((f) => ({ ...f, ...p }));

  const exportList = async () => {
    setExporting(true);
    try {
      await betaApi.exportList(filter);
    } catch (e) {
      toast.apiError(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Beta Testers"
        subtitle="Test accounts kept apart from your members: they are left out of revenue, sign-up and usage numbers. Each one has its own login, so you can give access, pause or remove them one by one or in groups."
        actions={
          <>
            <Button variant="outline" loading={exporting} onClick={() => void exportList()}>
              <Download size={16} aria-hidden />
              Export list
            </Button>
            {canManage ? (
              <>
                <Button variant="outline" onClick={() => setImporting(true)}>
                  <Upload size={16} aria-hidden />
                  Import CSV
                </Button>
                <Button onClick={() => setGenerate(true)}>
                  <Plus size={16} aria-hidden />
                  Create accounts
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {!live ? (
        <p role="status" className="rounded-card border border-dashed border-warning px-4 py-2 text-sm text-warning">
          Live updates are paused. Counts and the online dots may be out of date until the connection returns.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Summary">
        <KpiTile label="Test accounts" value={s ? formatNumber(s.total) : '—'} loading={summary.isPending} size="sm" />
        <KpiTile label="Beta premium" value={s ? formatNumber(s.beta) : '—'} loading={summary.isPending} size="sm" hint="With a running end date" />
        <KpiTile label="Free access" value={s ? formatNumber(s.free) : '—'} loading={summary.isPending} size="sm" />
        <KpiTile label="Suspended" value={s ? formatNumber(s.suspended) : '—'} loading={summary.isPending} size="sm" hint="Counted separately from access" />
        <KpiTile label="Online now" value={onlineNow === undefined ? '—' : formatNumber(onlineNow)} loading={summary.isPending} size="sm" live hint="Not added to the others" />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput label="Search test accounts" placeholder="Search login, name or tester ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select label="Group" size="sm" options={groupOptions} value={filter.batchId ?? ''} onChange={(e) => set({ batchId: e.target.value || undefined })} />
        <Select label="Access" size="sm" options={ACCESS_FILTERS} value={filter.access ?? ''} onChange={(e) => set({ access: (e.target.value || undefined) as BetaFilter['access'] })} />
        <Select label="Account state" size="sm" options={STATE_FILTERS} value={filter.state ?? ''} onChange={(e) => set({ state: (e.target.value || undefined) as BetaFilter['state'] })} />
        <Select label="Presence" size="sm" options={PRESENCE_FILTERS} value={filter.presence ?? ''} onChange={(e) => set({ presence: (e.target.value || undefined) as BetaFilter['presence'] })} />
      </div>

      {group ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-border px-4 py-2 text-sm" aria-label="Group">
          <strong>{group.name}</strong>
          <span className="text-text-muted">
            {group.accounts} accounts · {group.premiumCount} planned premium · created {formatDate(group.createdAt)}
          </span>
          {group.status !== 'ready' ? <Badge tone={group.status === 'creating' ? 'neutral' : 'warning'} size="sm">{group.status === 'creating' ? 'Creating' : `Setup ${group.status}: ${group.failed} need a retry`}</Badge> : null}
          <span className="flex-1" />
          {canManage && (group.status === 'partial' || group.status === 'failed') ? (
            <Button size="sm" variant="outline" onClick={() => void betaApi.retryBatch(group.id).then((r) => { toast.info('Finishing the missing steps'); setJob({ id: r.jobId, label: `Finishing ${group.name}` }); }).catch(toast.apiError)}>
              Retry setup
            </Button>
          ) : null}
          {canManage && group.credentialsAvailable ? (
            <Button size="sm" variant="outline" onClick={() => void betaApi.credentials(group.id).catch(toast.apiError)}>
              Export login details
            </Button>
          ) : null}
          {canManage ? (
            <Button size="sm" variant="danger" onClick={() => { setAllMatching(true); setBulk('delete'); }}>
              Delete group
            </Button>
          ) : null}
        </div>
      ) : null}

      {job ? <JobPanel id={job.id} label={job.label} onClose={() => setJob(null)} /> : null}

      {count > 0 ? (
        <div role="region" aria-label="Selection" className="flex flex-wrap items-center gap-2 rounded-card border border-border-strong bg-input px-4 py-2 text-sm">
          <strong>{allMatching ? `All ${formatNumber(matching)} matching accounts` : `${picked.size} selected on this page`}</strong>
          <span className="text-text-muted">· {group ? group.name : 'all groups'}</span>
          {!allMatching && picked.size === rows.length && matching > rows.length ? (
            <Button size="sm" variant="secondary" onClick={() => setAllMatching(true)}>
              Select all {formatNumber(matching)} matching accounts
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={clearSelection}>
            Clear
          </Button>
          <span className="flex-1" />
          {canManage
            ? BULK.map((a) => (
                <Button key={a} size="sm" variant={a === 'delete' ? 'danger' : 'outline'} onClick={() => setBulk(a)}>
                  {BULK_LABEL[a]}
                </Button>
              ))
            : null}
        </div>
      ) : null}

      <DataTable
        label="Beta testers"
        columns={columns}
        rows={rows}
        rowKey={(u) => u.id}
        loading={users.isPending}
        error={users.isError ? users.error : undefined}
        onRetry={() => void users.refetch()}
        selected={canManage ? picked : undefined}
        onSelectedChange={
          canManage
            ? (keys) => {
                setAllMatching(false);
                setPicked(keys);
              }
            : undefined
        }
        empty={
          filtered ? (
            <EmptyState title="Nobody matches" description="Try another group or clear a filter." />
          ) : (
            <EmptyState
              title="No test accounts yet"
              description="Create a group of testers. Each gets a login and password, and your members stay untouched."
              action={canManage ? <Button size="sm" onClick={() => setGenerate(true)}>Create accounts</Button> : undefined}
            />
          )
        }
        summary={`Showing ${formatNumber(rows.length)} of ${formatNumber(matching)} · sorted by login${live ? '' : ' · live updates paused'}`}
      />
      {users.hasNextPage ? (
        <Button variant="outline" size="sm" className="self-end" loading={users.isFetchingNextPage} onClick={() => void users.fetchNextPage()}>
          Load more
        </Button>
      ) : null}

      <GenerateDialog open={generate} onClose={() => setGenerate(false)} onStarted={(id) => setJob({ id, label: 'Creating test accounts' })} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} onStarted={(id) => setJob({ id, label: 'Importing test accounts' })} />
      <ManageDialog row={manage} canManage={canManage} onClose={() => setManage(null)} onJob={(id) => setJob({ id, label: 'Deleting the account' })} />
      <BulkDialog
        action={bulk}
        selection={selection}
        count={count}
        scope={scope}
        onClose={() => setBulk(null)}
        onJob={(id) => {
          setJob({ id, label: bulk ? `${BULK_LABEL[bulk]} · ${count} accounts` : 'Working' });
          clearSelection();
        }}
      />
    </>
  );
}
