import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import { renderUi } from '../test/render';
import { Sparkline, StatBar } from './Charts';
import { DataTable, type Column, type Sort } from './DataTable';
import { KpiTile } from './KpiTile';
import { EmptyState, ErrorState, NoPermission } from './States';

type Row = { id: string; name: string; minutes: number; plays: number | null };

const rows: Row[] = [
  { id: 'a', name: 'Calm', minutes: 15, plays: 300 },
  { id: 'b', name: 'Anchor', minutes: 40, plays: null },
  { id: 'c', name: 'Breathe', minutes: 5, plays: 900 },
];

const columns: Column<Row>[] = [
  { id: 'name', header: 'Session', width: '2fr', sortable: true, sortValue: (r) => r.name, hideable: false, cell: (r) => r.name },
  { id: 'length', header: 'Length', sortable: true, sortValue: (r) => r.minutes, cell: (r) => `${r.minutes} min` },
  { id: 'plays', header: 'Plays', sortable: true, sortValue: (r) => r.plays, cell: (r) => r.plays ?? '—' },
  {
    id: 'actions',
    header: 'Actions',
    srOnlyHeader: true,
    hideable: false,
    width: '48px',
    cell: (r) => <button type="button">Edit {r.name}</button>,
  },
];

const table = () => screen.getByRole('table', { name: 'Sessions' });
/** First-column text of each body row, in display order. */
const order = () =>
  within(table())
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0]?.textContent);

describe('DataTable', () => {
  it('renders a labelled table with headers and one row per item', () => {
    renderUi(<DataTable label="Sessions" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(
      within(table())
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Session', 'Length', 'Plays', 'Actions']);
    expect(order()).toEqual(['Calm', 'Anchor', 'Breathe']);
    expect(table()).toHaveAttribute('aria-rowcount', '4');
  });

  it('sorts the loaded rows: ascending, descending, then back to the given order', async () => {
    renderUi(<DataTable label="Sessions" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const header = () => screen.getByRole('columnheader', { name: /Session/ });
    await userEvent.click(screen.getByRole('button', { name: 'Session' }));
    expect(order()).toEqual(['Anchor', 'Breathe', 'Calm']);
    expect(header()).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(screen.getByRole('button', { name: 'Session' }));
    expect(order()).toEqual(['Calm', 'Breathe', 'Anchor']);
    expect(header()).toHaveAttribute('aria-sort', 'descending');
    await userEvent.click(screen.getByRole('button', { name: 'Session' }));
    expect(order()).toEqual(['Calm', 'Anchor', 'Breathe']);
    expect(header()).toHaveAttribute('aria-sort', 'none');
  });

  it('sorts numbers as numbers and keeps empty values last', async () => {
    renderUi(<DataTable label="Sessions" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    await userEvent.click(screen.getByRole('button', { name: 'Length' }));
    expect(order()).toEqual(['Breathe', 'Calm', 'Anchor']); // 5, 15, 40: the first click is ascending for numbers too
    await userEvent.click(screen.getByRole('button', { name: 'Length' }));
    expect(order()).toEqual(['Anchor', 'Calm', 'Breathe']);
    // the row without plays stays at the end in both directions
    await userEvent.click(screen.getByRole('button', { name: 'Plays' }));
    expect(order()).toEqual(['Calm', 'Breathe', 'Anchor']);
    await userEvent.click(screen.getByRole('button', { name: 'Plays' }));
    expect(order()).toEqual(['Breathe', 'Calm', 'Anchor']);
  });

  it('server-side sort: reports the request and does not reorder rows itself', async () => {
    const onSortChange = vi.fn();
    function Server() {
      const [sort, setSort] = useState<Sort>(null);
      return (
        <DataTable
          label="Sessions"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          sort={sort}
          onSortChange={(s) => {
            setSort(s);
            onSortChange(s);
          }}
        />
      );
    }
    renderUi(<Server />);
    await userEvent.click(screen.getByRole('button', { name: 'Session' }));
    expect(onSortChange).toHaveBeenLastCalledWith({ id: 'name', desc: false });
    expect(order()).toEqual(['Calm', 'Anchor', 'Breathe']);
    expect(screen.getByRole('columnheader', { name: /Session/ })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('row click and Enter on a focused row open it; a button inside the row keeps its own action', async () => {
    const onRowClick = vi.fn();
    renderUi(<DataTable label="Sessions" columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} />);
    const row = screen.getByRole('row', { name: /Anchor/ });
    await userEvent.click(within(row).getByText('Anchor'));
    expect(onRowClick).toHaveBeenLastCalledWith(rows[1]);
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledTimes(2);
    within(row).getByRole('button', { name: 'Edit Anchor' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it('selection: one row, all rows, none; ticking a box does not open the row', async () => {
    const onRowClick = vi.fn();
    function Sel() {
      const [sel, setSel] = useState<Set<string>>(new Set());
      return (
        <DataTable
          label="Sessions"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          selected={sel}
          onSelectedChange={setSel}
          onRowClick={onRowClick}
          summary={`${sel.size} selected`}
        />
      );
    }
    renderUi(<Sel />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select row 2' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Anchor/ })).toHaveAttribute('aria-selected', 'true');
    expect(onRowClick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('column menu hides and shows optional columns, never the main one', async () => {
    renderUi(<DataTable label="Sessions" columns={columns} rows={rows} rowKey={(r) => r.id} columnMenu />);
    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    expect(screen.queryByRole('menuitem', { name: /session/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Hide plays' }));
    expect(screen.queryByRole('columnheader', { name: /Plays/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Show plays' }));
    expect(screen.getByRole('columnheader', { name: /Plays/ })).toBeInTheDocument();
  });

  it('loading, empty and error states replace the rows', async () => {
    const onRetry = vi.fn();
    const { rerender } = renderUi(<DataTable label="Sessions" columns={columns} rows={[]} rowKey={(r) => r.id} loading />);
    expect(screen.getByRole('status', { name: 'Loading sessions' })).toBeInTheDocument();
    expect(table()).toHaveAttribute('aria-busy', 'true');

    rerender(
      <DataTable label="Sessions" columns={columns} rows={[]} rowKey={(r) => r.id} empty={<EmptyState title="No sessions match" />} />,
    );
    expect(screen.getByText('No sessions match')).toBeInTheDocument();

    const error = new ApiError('INTERNAL', 500, 'The server could not load sessions.', undefined, 'trace-9');
    rerender(<DataTable label="Sessions" columns={columns} rows={rows} rowKey={(r) => r.id} error={error} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The server could not load sessions.');
    expect(screen.getByRole('alert')).toHaveTextContent('Reference: trace-9');
    expect(order()).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('pagination buttons follow the cursors', async () => {
    const onNext = vi.fn();
    renderUi(<DataTable label="Sessions" columns={columns} rows={rows} rowKey={(r) => r.id} summary="Showing 3 of 142" onNext={onNext} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('virtual mode renders only the rows near the viewport, out of 1,000', () => {
    // jsdom has no layout, so give the scroll area the height the browser would report.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1000);
    const many = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}`, name: `Session ${i + 1}`, minutes: 10, plays: i }));
    renderUi(<DataTable label="Sessions" columns={columns} rows={many} rowKey={(r) => r.id} virtualHeight={320} rowHeight={64} />);
    const rendered = within(table()).getAllByRole('row').length - 1;
    expect(rendered).toBeGreaterThanOrEqual(5);
    expect(rendered).toBeLessThan(40);
    expect(table()).toHaveAttribute('aria-rowcount', '1001');
    expect(screen.getByText('Session 1')).toBeInTheDocument();
    expect(screen.queryByText('Session 500')).not.toBeInTheDocument();
  });

  it('marks highlighted rows (live change flash)', () => {
    renderUi(<DataTable label="Sessions" columns={columns} rows={rows} rowKey={(r) => r.id} highlight={new Set(['c'])} />);
    expect(screen.getByRole('row', { name: /Breathe/ })).toHaveClass('bg-ember/10');
    expect(screen.getByRole('row', { name: /Calm/ })).not.toHaveClass('bg-ember/10');
  });
});

describe('charts and tiles', () => {
  it('Sparkline is an image with a text alternative and one line through every point', () => {
    renderUi(<Sparkline label="Meditations per day: rising" data={[1, 5, 3, 9]} />);
    const svg = screen.getByRole('img', { name: 'Meditations per day: rising' });
    expect(svg.querySelector('polyline')?.getAttribute('points')?.split(' ')).toHaveLength(4);
  });

  it('Sparkline with flat or too little data does not break', () => {
    renderUi(
      <>
        <Sparkline label="flat" data={[4, 4, 4]} />
        <Sparkline label="single" data={[4]} />
      </>,
    );
    expect(screen.getByRole('img', { name: 'flat' }).querySelector('polyline')?.getAttribute('points')).not.toContain('NaN');
    expect(screen.getByRole('img', { name: 'single' }).querySelector('polyline')).toBeNull();
  });

  it('StatBar reports its value and clamps out-of-range input', () => {
    renderUi(
      <>
        <StatBar label="Completion" value={0.82} showValue />
        <StatBar label="Over" value={1.7} />
        <StatBar label="Under" value={-1} />
      </>,
    );
    expect(screen.getByRole('progressbar', { name: 'Completion' })).toHaveAttribute('aria-valuenow', '82');
    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Over' })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('progressbar', { name: 'Under' })).toHaveAttribute('aria-valuenow', '0');
  });

  it('KpiTile shows the value, or a skeleton while loading', () => {
    const { rerender } = renderUi(<KpiTile label="Meditations today" value="3,180" hint="+12% vs last Thursday" hintTone="success" />);
    expect(screen.getByText('3,180')).toHaveClass('tabular');
    expect(screen.getByText('+12% vs last Thursday')).toHaveClass('text-success-text');
    rerender(<KpiTile label="Meditations today" value="3,180" loading />);
    expect(screen.queryByText('3,180')).not.toBeInTheDocument();
  });
});

describe('states', () => {
  it('ErrorState: network errors get the offline copy, API errors show message and traceId', () => {
    const { rerender } = renderUi(<ErrorState error={new ApiError('NETWORK', 0, 'Cannot reach the server.')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    rerender(<ErrorState error={new ApiError('FORBIDDEN', 403, 'Not allowed', undefined, 'trace-3')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Not allowed');
    expect(screen.getByRole('alert')).toHaveTextContent('Reference: trace-3');
    rerender(<ErrorState />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('EmptyState and NoPermission render their copy and action', () => {
    renderUi(
      <>
        <EmptyState title="No daily message" description="Write one" action={<button type="button">Write message</button>} />
        <NoPermission />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Write message' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No permission');
  });
});
