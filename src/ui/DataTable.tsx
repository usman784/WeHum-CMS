import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { Menu } from './Menu';
import { SkeletonRows } from './Skeleton';
import { EmptyState, ErrorState } from './States';

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** CSS grid track, e.g. "2.8fr" or "48px" (design: Sessions.dc.html grid-template-columns). */
  width?: string;
  /** Enables the sort button. With `onSortChange` the server sorts; otherwise `sortValue` sorts the loaded rows. */
  sortable?: boolean;
  sortValue?: (row: T) => string | number | null;
  align?: 'left' | 'right';
  /** Can be hidden from the column menu. Default true; set false for the main column. */
  hideable?: boolean;
  /** Header text is only for screen readers (e.g. the actions column). */
  srOnlyHeader?: boolean;
};

export type Sort = { id: string; desc: boolean } | null;

type Props<T> = {
  /** Names the table for screen readers, e.g. "Sessions". */
  label: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Controlled sort for server-side sorting. */
  sort?: Sort;
  onSortChange?: (s: Sort) => void;
  /** Row keys to flash for 2 s after a live change (spec §6.3). The parent removes the key when the time is up. */
  highlight?: ReadonlySet<string>;
  /** Selected row keys. Passing this adds the checkbox column (bulk actions). */
  selected?: ReadonlySet<string>;
  onSelectedChange?: (keys: Set<string>) => void;
  /** Show the "Columns" menu. */
  columnMenu?: boolean;
  /** Render only the visible rows inside a scroll area of this height (px). Use for long lists (1,000+ rows). */
  virtualHeight?: number;
  rowHeight?: number;
  /** Virtual mode: called when the last rows scroll into view, to load the next page. */
  onEndReached?: () => void;
  /** Footer: summary text and cursor pagination. */
  summary?: ReactNode;
  onPrevious?: () => void;
  onNext?: () => void;
  className?: string;
};

const SELECT_COL = '44px';

/** Data table: sort, column visibility, selection, row click, virtual rows, loading / empty / error states. */
export function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  empty,
  onRowClick,
  sort,
  onSortChange,
  highlight,
  selected,
  onSelectedChange,
  columnMenu,
  virtualHeight,
  rowHeight = 64,
  onEndReached,
  summary,
  onPrevious,
  onNext,
  className,
}: Props<T>) {
  const manual = !!onSortChange;
  const [localSort, setLocalSort] = useState<SortingState>([]);
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const sorting: SortingState = manual ? (sort ? [sort] : []) : localSort;

  const defs = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        header: c.header,
        // `undefined` (not null) is what the table treats as "no value" and keeps at the end.
        accessorFn: (row: T) => c.sortValue?.(row) ?? undefined,
        enableSorting: !!c.sortable,
        enableHiding: c.hideable !== false,
        sortUndefined: 'last',
      })),
    [columns],
  );

  const table = useReactTable({
    data: rows,
    columns: defs,
    state: { sorting, columnVisibility: visibility },
    getRowId: rowKey,
    manualSorting: manual,
    enableSortingRemoval: true,
    // Same click order for every column: ascending, descending, off (the library starts numbers descending).
    sortDescFirst: false,
    onColumnVisibilityChange: setVisibility,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      if (manual) onSortChange?.(next[0] ?? null);
      else setLocalSort(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const visible = columns.filter((c) => visibility[c.id] !== false);
  const template = [selected ? SELECT_COL : null, ...visible.map((c) => c.width ?? '1fr')].filter(Boolean).join(' ');
  const model = table.getRowModel().rows;

  const scroller = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: virtualHeight ? model.length : 0,
    getScrollElement: () => scroller.current,
    estimateSize: () => rowHeight,
    overscan: 8,
    initialRect: { width: 0, height: virtualHeight ?? 0 },
  });
  // Near the end of what is loaded: ask for more (the parent ignores it while a page is already loading).
  const lastVisible = virtualizer.getVirtualItems().at(-1)?.index ?? -1;
  const endReached = useRef(onEndReached);
  endReached.current = onEndReached;
  useEffect(() => {
    if (virtualHeight && model.length > 0 && lastVisible >= model.length - 5) endReached.current?.();
  }, [virtualHeight, lastVisible, model.length]);

  const allSelected = !!selected && model.length > 0 && model.every((r) => selected.has(r.id));
  const toggleAll = () => onSelectedChange?.(allSelected ? new Set() : new Set(model.map((r) => r.id)));
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange?.(next);
  };

  const renderRow = (index: number, style?: CSSProperties) => {
    const r = model[index];
    if (!r) return null;
    const row = r.original;
    const clickable = !!onRowClick;
    const onKey = (e: KeyboardEvent) => {
      // Only when the row itself has focus, so Enter on a button or link inside a cell keeps its own meaning.
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onRowClick?.(row);
      }
    };
    return (
      // A clickable row is focusable and opens with Enter or Space (see onKey), so it is operable without a mouse.
      // A clickable row is focusable and opens with Enter or Space (see onKey), so it works without a mouse.
      <div
        key={r.id}
        role="row"
        aria-rowindex={index + 2}
        aria-selected={selected ? selected.has(r.id) : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={
          clickable
            ? (e) => {
                // A button, link, checkbox or field inside the row does its own job and must not also open the row.
                const inner = (e.target as HTMLElement).closest('button, a, input, label, select, textarea, [role="menuitem"]');
                if (!inner || inner === e.currentTarget) onRowClick(row);
              }
            : undefined
        }
        onKeyDown={clickable ? onKey : undefined}
        style={{ gridTemplateColumns: template, minHeight: rowHeight, ...style }}
        className={cn(
          'grid items-center gap-3 border-b border-border px-5 text-body transition-colors duration-700',
          clickable && 'cursor-pointer hover:bg-surface-alt/60',
          highlight?.has(r.id) && 'bg-ember/10',
          selected?.has(r.id) && 'bg-ember/10',
        )}
      >
        {selected ? (
          <div role="cell">
            <Checkbox label={`Select row ${index + 1}`} hideLabel checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} />
          </div>
        ) : null}
        {visible.map((c) => (
          <div key={c.id} role="cell" className={cn('min-w-0', c.align === 'right' && 'text-right')}>
            {c.cell(row)}
          </div>
        ))}
      </div>
    );
  };

  const showBody = !loading && !error && model.length > 0;

  return (
    <section className={cn('overflow-hidden rounded-card border border-border bg-surface', className)}>
      {columnMenu ? (
        <div className="flex justify-end border-b border-border px-3 py-2">
          <Menu
            label="Choose columns"
            trigger={
              <Button variant="ghost" size="sm">
                <Columns3 size={16} aria-hidden />
                Columns
              </Button>
            }
            items={columns
              .filter((c) => c.hideable !== false)
              .map((c) => ({
                key: c.id,
                label: `${visibility[c.id] === false ? 'Show' : 'Hide'} ${c.header.toLowerCase()}`,
                onSelect: () => setVisibility((v) => ({ ...v, [c.id]: v[c.id] === false })),
              }))}
          />
        </div>
      ) : null}

      <div role="table" aria-label={label} aria-rowcount={model.length + 1} aria-busy={loading || undefined}>
        <div role="rowgroup">
          <div
            role="row"
            aria-rowindex={1}
            style={{ gridTemplateColumns: template }}
            className="grid items-center gap-3 border-b border-border px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.8px] text-text-faint"
          >
            {selected ? (
              <div role="columnheader">
                <Checkbox label="Select all rows" hideLabel checked={allSelected} onChange={toggleAll} disabled={!model.length} />
              </div>
            ) : null}
            {visible.map((c) => {
              const col = table.getColumn(c.id);
              const dir = col?.getIsSorted() || false;
              return (
                <div
                  key={c.id}
                  role="columnheader"
                  aria-sort={c.sortable ? (dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none') : undefined}
                  className={cn('min-w-0', c.align === 'right' && 'text-right')}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => col?.toggleSorting()}
                      className="inline-flex items-center gap-1 rounded uppercase tracking-[0.8px] hover:text-text"
                    >
                      {c.header}
                      {dir === 'asc' ? (
                        <ArrowUp size={13} aria-hidden />
                      ) : dir === 'desc' ? (
                        <ArrowDown size={13} aria-hidden />
                      ) : (
                        <ChevronsUpDown size={13} aria-hidden />
                      )}
                    </button>
                  ) : (
                    <span className={c.srOnlyHeader ? 'sr-only' : undefined}>{c.header}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {showBody && !virtualHeight ? <div role="rowgroup">{model.map((_, i) => renderRow(i))}</div> : null}
        {showBody && virtualHeight ? (
          <div
            ref={scroller}
            role="rowgroup"
            style={{ height: Math.min(virtualHeight, model.length * rowHeight) }}
            className="overflow-y-auto"
          >
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((v) =>
                renderRow(v.index, {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: v.size,
                  transform: `translateY(${v.start}px)`,
                }),
              )}
            </div>
          </div>
        ) : null}
      </div>

      {loading ? <SkeletonRows label={`Loading ${label.toLowerCase()}`} /> : null}
      {!loading && error ? <ErrorState error={error} onRetry={onRetry} /> : null}
      {!loading && !error && model.length === 0 ? (empty ?? <EmptyState title="Nothing here yet" />) : null}

      {summary || onPrevious || onNext ? (
        <div className="flex items-center gap-3 px-5 py-3.5 text-sm text-text-muted">
          <span className="flex-1" aria-live="polite">
            {summary}
          </span>
          <Button variant="outline" size="sm" className="h-9" disabled={!onPrevious} onClick={onPrevious}>
            Previous
          </Button>
          <Button variant="outline" size="sm" className="h-9" disabled={!onNext} onClick={onNext}>
            Next
          </Button>
        </div>
      ) : null}
    </section>
  );
}
