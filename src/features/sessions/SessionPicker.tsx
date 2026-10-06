import { useEffect, useState } from 'react';
import { useDebounced } from '../../hooks/useDebounced';
import { StatusText } from '../../ui/Badge';
import { Dialog } from '../../ui/Dialog';
import { SearchInput } from '../../ui/Input';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { useSessionSearch, type Session } from './api';
import { lengthLabel, STATUS, TYPE_LABEL } from './display';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** Only these can be chosen; the others are listed greyed out with the reason. */
  allow?: (s: Session) => string | null;
  onPick: (s: Session) => void;
};

/** "Choose a meditation" dialog with search (program days now; the Today screen later). */
export function SessionPicker({ open, onOpenChange, title = 'Choose a meditation', allow, onPick }: Props) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  // Every time the dialog opens, the search starts empty.
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);
  const { data, isPending, error, refetch } = useSessionSearch(q, open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} size="md">
      <div className="flex flex-col gap-3">
        <SearchInput
          label="Search meditations"
          placeholder="Search title or tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog exists to search
          autoFocus
        />
        {error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isPending ? (
          <SkeletonRows rows={4} label="Loading meditations" />
        ) : data.length === 0 ? (
          <EmptyState title="No meditation found" description="Try another word, or create the meditation in Sessions first." />
        ) : (
          <ul aria-label="Meditations" className="flex max-h-[50vh] flex-col overflow-y-auto">
            {data.map((s) => {
              const blocked = allow?.(s) ?? null;
              return (
                <li key={s.id} className="border-t border-border first:border-t-0">
                  <button
                    type="button"
                    disabled={!!blocked}
                    onClick={() => {
                      onPick(s);
                      onOpenChange(false);
                    }}
                    className="flex min-h-14 w-full items-center gap-3 rounded-input p-2 text-left hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body font-semibold">{s.title}</span>
                      <span className="text-xs text-text-muted">
                        {TYPE_LABEL[s.type]} · {lengthLabel(s.durationSec)}
                        {blocked ? ` · ${blocked}` : ''}
                      </span>
                    </span>
                    <StatusText tone={STATUS[s.status].tone}>{STATUS[s.status].label}</StatusText>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
