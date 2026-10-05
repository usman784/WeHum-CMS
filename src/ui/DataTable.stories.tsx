import { useMemo, useState } from 'react';
import { ApiError } from '../lib/api';
import { formatNumber } from '../lib/format';
import { Badge, StatusText } from './Badge';
import { DataTable, type Column } from './DataTable';
import { Menu } from './Menu';
import { EmptyState } from './States';

export default { title: 'ui/DataTable' };

type Row = {
  id: string;
  name: string;
  note: string;
  theme: string;
  minutes: number;
  access: 'Premium' | 'Free';
  status: 'Published' | 'Draft' | 'Scheduled';
  plays: number | null;
};

const rows: Row[] = [
  {
    id: 's1',
    name: 'Steady Under Pressure',
    note: 'Meditation of the Day on Oct 12',
    theme: 'Breathing',
    minutes: 15,
    access: 'Premium',
    status: 'Published',
    plays: 4120,
  },
  {
    id: 's2',
    name: 'Unconditional Love & Healing',
    note: 'youtube.com link',
    theme: 'Loving Kindness',
    minutes: 40,
    access: 'Free',
    status: 'Published',
    plays: 3880,
  },
  {
    id: 's3',
    name: 'Vagus Nerve Reset',
    note: '7-Day Reset · Day 5',
    theme: 'Breathing',
    minutes: 15,
    access: 'Premium',
    status: 'Scheduled',
    plays: null,
  },
  {
    id: 's4',
    name: 'Open Awareness & Silence',
    note: 'Cover missing',
    theme: 'Transcendent',
    minutes: 18,
    access: 'Premium',
    status: 'Draft',
    plays: null,
  },
];

const statusTone = { Published: 'success', Draft: 'warning', Scheduled: 'teal' } as const;

const columns: Column<Row>[] = [
  {
    id: 'name',
    header: 'Session',
    width: '2.8fr',
    sortable: true,
    sortValue: (r) => r.name,
    hideable: false,
    cell: (r) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{r.name}</span>
        <span className="truncate text-xs text-text-muted">{r.note}</span>
      </span>
    ),
  },
  { id: 'theme', header: 'Theme', width: '1.2fr', cell: (r) => <span className="text-text-muted">{r.theme}</span> },
  {
    id: 'length',
    header: 'Length',
    width: '0.7fr',
    sortable: true,
    sortValue: (r) => r.minutes,
    cell: (r) => <span className="tabular">{r.minutes} min</span>,
  },
  {
    id: 'access',
    header: 'Access',
    width: '0.9fr',
    cell: (r) => (
      <Badge tone={r.access === 'Premium' ? 'ember' : 'success'} caps>
        {r.access}
      </Badge>
    ),
  },
  { id: 'status', header: 'Status', width: '1fr', cell: (r) => <StatusText tone={statusTone[r.status]}>{r.status}</StatusText> },
  {
    id: 'plays',
    header: 'Plays',
    width: '0.8fr',
    sortable: true,
    sortValue: (r) => r.plays,
    cell: (r) => <span className="tabular">{r.plays === null ? '—' : formatNumber(r.plays)}</span>,
  },
  {
    id: 'actions',
    header: 'Actions',
    srOnlyHeader: true,
    hideable: false,
    width: '48px',
    cell: (r) => (
      <Menu
        label={`More actions for ${r.name}`}
        items={[
          { key: 'dup', label: 'Duplicate', onSelect: () => {} },
          { key: 'arch', label: 'Archive', danger: true, onSelect: () => {} },
        ]}
      />
    ),
  },
];

export const SortSelectAndColumns = () => {
  const [selected, setSelected] = useState<Set<string>>(new Set(['s2']));
  const [opened, setOpened] = useState('nothing yet');
  return (
    <div className="flex flex-col gap-2">
      <DataTable
        label="Sessions"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        selected={selected}
        onSelectedChange={setSelected}
        onRowClick={(r) => setOpened(r.name)}
        highlight={new Set(['s3'])}
        columnMenu
        summary={`Showing ${rows.length} of 142 · ${selected.size} selected`}
        onNext={() => {}}
      />
      <p className="text-sm text-text-muted">Last row opened: {opened}</p>
    </div>
  );
};

export const LoadingState = () => <DataTable label="Sessions" columns={columns} rows={[]} rowKey={(r) => r.id} loading />;

export const EmptyTable = () => (
  <DataTable
    label="Sessions"
    columns={columns}
    rows={[]}
    rowKey={(r) => r.id}
    empty={<EmptyState title="No sessions match these filters" description="Clear the search or pick another tab." />}
  />
);

export const ErrorTable = () => (
  <DataTable
    label="Sessions"
    columns={columns}
    rows={[]}
    rowKey={(r) => r.id}
    error={new ApiError('INTERNAL', 500, 'The server could not load sessions.', undefined, 'trace-7f3a91')}
    onRetry={() => {}}
  />
);

export const VirtualRows = () => {
  const many = useMemo(
    () =>
      Array.from({ length: 1000 }, (_, i) => ({
        ...rows[i % rows.length]!,
        id: `row-${i}`,
        name: `Session ${i + 1}`,
        plays: (i * 37) % 5000,
      })),
    [],
  );
  return (
    <DataTable
      label="All sessions"
      columns={columns}
      rows={many}
      rowKey={(r) => r.id}
      virtualHeight={320}
      summary="1,000 rows, only the visible ones are rendered"
    />
  );
};
