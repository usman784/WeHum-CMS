import { AudioLines, Plus, Upload as UploadIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAvailableHeight, useDebounced } from '../../hooks/useDebounced';
import { useRecentChanges } from '../../hooks/useEntity';
import { useSocketStatus } from '../../hooks/useLive';
import { useCan } from '../../hooks/useRole';
import { formatNumber } from '../../lib/format';
import { Badge, StatusText } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { DataTable, type Column } from '../../ui/DataTable';
import { ConfirmDialog } from '../../ui/Dialog';
import { SearchInput } from '../../ui/Input';
import { Menu, type MenuItem } from '../../ui/Menu';
import { PageHeader } from '../../ui/PageHeader';
import { Select } from '../../ui/Select';
import { EmptyState } from '../../ui/States';
import { TabPills } from '../../ui/TabPills';
import { toast } from '../../ui/Toast';
import { useTeachers } from '../teachers/api';
import { useThemes } from '../themes/api';
import { NO_FILTERS, sessionApi, TABS, useSessionCache, useSessions, type Session, type SessionFilters, type Tab } from './api';
import { BulkUploadDialog } from './BulkUpload';
import { goesLive, lengthLabel, sessionNote, STATUS, TYPE_LABEL } from './display';

const TYPES = [
  { value: '', label: 'All types' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'youtube', label: 'YouTube' },
];

/** Filters live in the address bar, so a filtered list can be linked, reloaded and reached with Back. */
function useFilters(): [SessionFilters, (patch: Partial<SessionFilters>) => void] {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab');
  const type = params.get('type');
  const filters: SessionFilters = {
    tab: TABS.some((t) => t.value === tab) ? (tab as Tab) : 'all',
    q: params.get('q') ?? '',
    theme: params.get('theme') ?? '',
    teacher: params.get('teacher') ?? '',
    type: type === 'audio' || type === 'video' || type === 'youtube' ? type : '',
  };
  const set = (patch: Partial<SessionFilters>) => {
    const next = { ...filters, ...patch };
    const out = new URLSearchParams();
    (Object.keys(next) as (keyof SessionFilters)[]).forEach((k) => next[k] && next[k] !== NO_FILTERS[k] && out.set(k, next[k]));
    setParams(out, { replace: true });
  };
  return [filters, set];
}

/** 03 Sessions: every meditation in the app. */
export function SessionsPage() {
  const navigate = useNavigate();
  const canDelete = useCan('content.delete');
  const [filters, setFilters] = useFilters();
  const [search, setSearch] = useState(filters.q);
  const q = useDebounced(search);
  useEffect(() => {
    if (q !== filters.q) setFilters({ q });
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = useSocketStatus() === 'live';
  const list = useSessions(filters);
  const themes = useThemes();
  const teachers = useTeachers();
  const cache = useSessionCache();
  const recent = useRecentChanges('session');
  const height = useAvailableHeight(400);

  // Socket down: fall back to a refetch every 30 s (spec §6.3).
  const { refetch } = list;
  useEffect(() => {
    if (live) return;
    const t = setInterval(() => void refetch(), 30_000);
    return () => clearInterval(t);
  }, [live, refetch]);

  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.data) ?? [], [list.data]);
  const total = (list.data?.pages[0]?.meta as { total?: number } | undefined)?.total;
  const themeName = useMemo(() => new Map(themes.data?.map((t) => [t.id, t.name])), [themes.data]);
  const teacherName = useMemo(() => new Map(teachers.data?.map((t) => [t.id, t.name])), [teachers.data]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [filters.tab, filters.q, filters.theme, filters.teacher, filters.type]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Session | null>(null);
  const [deleting, setDeleting] = useState(false);

  const act = async (run: () => Promise<unknown>, done: string, failed: string) => {
    try {
      await run();
      toast.success(done);
      await cache.changed();
    } catch (e) {
      toast.apiError(e, failed);
    }
  };

  const bulk = async (action: 'publish' | 'archive') => {
    setBulkBusy(true);
    try {
      const r = await sessionApi.bulk(action, [...selected]);
      const verb = action === 'publish' ? 'published' : 'archived';
      if (r.failed === 0) toast.success(`${r.ok} ${verb}`);
      else {
        // Say why, with the first reason: the rest usually have the same one.
        const first = r.results.find((x) => !x.ok)?.error?.message;
        toast.error(`${r.ok} ${verb}, ${r.failed} could not be ${verb}`, first);
      }
      setSelected(new Set(r.results.filter((x) => !x.ok).map((x) => x.id))); // what failed stays selected
      await cache.changed();
    } catch (e) {
      toast.apiError(e, 'The bulk action failed.');
    } finally {
      setBulkBusy(false);
    }
  };

  const menu = (s: Session): MenuItem[] => [
    { key: 'edit', label: 'Edit', onSelect: () => navigate(`/sessions/${s.id}`) },
    {
      key: 'dup',
      label: 'Duplicate',
      onSelect: () => void act(() => sessionApi.duplicate(s.id), 'Duplicated as a draft', 'Could not duplicate.'),
    },
    ...(s.status === 'live' || s.status === 'archived'
      ? []
      : [
          { key: 'pub', label: 'Publish now', onSelect: () => void act(() => sessionApi.publish(s.id), 'Published', 'Could not publish.') },
        ]),
    ...(s.status === 'archived'
      ? []
      : [{ key: 'arch', label: 'Archive', onSelect: () => void act(() => sessionApi.archive(s.id), 'Archived', 'Could not archive.') }]),
    ...(canDelete && s.status === 'draft' ? [{ key: 'del', label: 'Delete draft', danger: true, onSelect: () => setToDelete(s) }] : []),
  ];

  const columns: Column<Session>[] = [
    {
      id: 'title',
      header: 'Session',
      width: '2.8fr',
      hideable: false,
      cell: (s) => (
        <Link to={`/sessions/${s.id}`} className="flex min-w-0 items-center gap-3 rounded-input">
          {s.cover ? (
            <img src={s.cover.url} alt="" loading="lazy" className="size-11 shrink-0 rounded-input object-cover" />
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-input bg-surface-alt text-text-faint" aria-hidden>
              <AudioLines size={18} />
            </span>
          )}
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">{s.title}</span>
            <span className="truncate text-xs text-text-muted">
              {sessionNote(s, s.teacherId ? teacherName.get(s.teacherId) : undefined)}
            </span>
          </span>
        </Link>
      ),
    },
    {
      id: 'theme',
      header: 'Theme',
      width: '1.2fr',
      cell: (s) => <span className="text-text-muted">{(s.themeId && themeName.get(s.themeId)) || '—'}</span>,
    },
    { id: 'type', header: 'Type', width: '0.8fr', cell: (s) => <span className="text-text-muted">{TYPE_LABEL[s.type]}</span> },
    { id: 'length', header: 'Length', width: '0.7fr', cell: (s) => <span className="tabular">{lengthLabel(s.durationSec)}</span> },
    {
      id: 'access',
      header: 'Access',
      width: '0.9fr',
      cell: (s) => (
        <Badge tone={s.access === 'premium' ? 'ember' : 'success'} caps>
          {s.access === 'premium' ? 'Premium' : 'Free'}
        </Badge>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      width: '0.9fr',
      cell: (s) => <StatusText tone={STATUS[s.status].tone}>{STATUS[s.status].label}</StatusText>,
    },
    {
      id: 'plays',
      header: 'Plays',
      width: '0.7fr',
      cell: (s) => <span className="tabular">{s.status === 'live' || s.plays ? formatNumber(s.plays) : '—'}</span>,
    },
    { id: 'live', header: 'Goes live', width: '1fr', cell: (s) => <span className="tabular text-sm text-text-muted">{goesLive(s)}</span> },
    {
      id: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      hideable: false,
      width: '44px',
      cell: (s) => <Menu label={`More actions for ${s.title}`} items={menu(s)} />,
    },
  ];

  const filtered = filters.tab !== 'all' || !!filters.q || !!filters.theme || !!filters.teacher || !!filters.type;

  return (
    <>
      <PageHeader
        title="Sessions"
        badge={
          total !== undefined ? <Badge caps>{`${formatNumber(total)} ${total === 1 ? 'meditation' : 'meditations'}`}</Badge> : undefined
        }
        subtitle="Every practice in the app: audio, video and free YouTube links, incl. SoS and program days. Bulk upload = drop many finished files at once, fill in the details after."
        actions={
          <>
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <UploadIcon size={16} aria-hidden />
              Bulk upload
            </Button>
            <Button onClick={() => navigate('/sessions/new')}>
              <Plus size={16} aria-hidden />
              New session
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          label="Search sessions"
          placeholder="Search title or tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <TabPills label="Filter sessions" options={[...TABS]} value={filters.tab} onChange={(tab) => setFilters({ tab })} />
        <div className="flex-1" />
        <Select
          inline
          size="sm"
          label="Theme"
          value={filters.theme}
          onChange={(e) => setFilters({ theme: e.target.value })}
          options={[
            { value: '', label: themes.data ? `All ${themes.data.length}` : 'All' },
            ...(themes.data ?? []).map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
        <Select
          inline
          size="sm"
          label="Teacher"
          value={filters.teacher}
          onChange={(e) => setFilters({ teacher: e.target.value })}
          options={[{ value: '', label: 'All' }, ...(teachers.data ?? []).map((t) => ({ value: t.id, label: t.name }))]}
        />
        <Select
          inline
          size="sm"
          label="Type"
          value={filters.type}
          onChange={(e) => setFilters({ type: e.target.value as SessionFilters['type'] })}
          options={TYPES}
        />
      </div>

      {selected.size ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="flex flex-wrap items-center gap-3 rounded-btn border border-ember bg-ember/10 px-4 py-2.5"
        >
          <span className="text-body font-semibold">{selected.size} selected</span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          <Button size="sm" variant="outline" loading={bulkBusy} onClick={() => void bulk('archive')}>
            Archive
          </Button>
          <Button size="sm" loading={bulkBusy} onClick={() => void bulk('publish')}>
            Publish
          </Button>
        </div>
      ) : null}

      <DataTable
        label="Sessions"
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        loading={list.isPending}
        error={list.isError ? list.error : undefined}
        onRetry={() => void list.refetch()}
        selected={selected}
        onSelectedChange={setSelected}
        highlight={recent}
        virtualHeight={height}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        empty={
          filtered ? (
            <EmptyState
              title="No sessions match these filters"
              description="Clear the search or pick another tab."
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setFilters(NO_FILTERS);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No sessions yet"
              description="Create the first meditation, or drop a batch of finished files with Bulk upload."
            />
          )
        }
        summary={
          total !== undefined
            ? `Showing ${formatNumber(rows.length)} of ${formatNumber(total)}${list.isFetchingNextPage ? ' · loading more…' : ''}${live ? '' : ' · live updates paused, refreshing every 30 s'}`
            : undefined
        }
      />

      <BulkUploadDialog open={bulkOpen} onOpenChange={setBulkOpen} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        danger
        title={`Delete the draft “${toDelete?.title ?? ''}”?`}
        description="This cannot be undone. Only drafts can be deleted; published meditations are archived instead."
        confirmLabel="Delete draft"
        loading={deleting}
        onConfirm={async () => {
          if (!toDelete) return;
          setDeleting(true);
          await act(() => sessionApi.remove(toDelete.id), 'Draft deleted', 'Could not delete the draft.');
          setDeleting(false);
          setToDelete(null);
        }}
      />
    </>
  );
}
