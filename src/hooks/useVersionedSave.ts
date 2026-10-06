import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { isConflict } from '../lib/api';

type Versioned = { version: number };

type Options<T extends Versioned, V> = {
  /** The request. `version` goes into `If-Match`. */
  save: (values: V, version: number) => Promise<T>;
  onSaved?: (row: T, values: V) => void;
  /** Every error except the version conflict (which this hook handles). */
  onError?: (e: unknown, values: V) => void;
};

/**
 * Save an edit with optimistic locking (spec §6.1). On `409 CONFLICT_VERSION` nothing is lost and nothing is
 * overwritten: `conflict` holds my values and the server's current row for <ConflictDialog>.
 */
export function useVersionedSave<T extends Versioned, V>({ save, onSaved, onError }: Options<T, V>) {
  const [conflict, setConflict] = useState<{ mine: V; theirs: T } | null>(null);
  const m = useMutation({
    mutationFn: ({ values, version }: { values: V; version: number }) => save(values, version),
    onSuccess: (row, { values }) => {
      setConflict(null);
      onSaved?.(row, values);
    },
    onError: (e, { values }) => {
      const current = isConflict(e) ? (e.details as { current?: T } | undefined)?.current : undefined;
      if (current) setConflict({ mine: values, theirs: current });
      else onError?.(e, values);
    },
  });
  return {
    save: (values: V, version: number) => m.mutate({ values, version }),
    saveAsync: (values: V, version: number) => m.mutateAsync({ values, version }),
    saving: m.isPending,
    conflict,
    /** "Keep my changes": send my values again, based on their version. */
    keepMine: () => conflict && m.mutate({ values: conflict.mine, version: conflict.theirs.version }),
    /** "Use their version": forget the conflict and hand their row to the caller (to reset the form). */
    takeTheirs: (apply: (theirs: T) => void) => {
      if (!conflict) return;
      apply(conflict.theirs);
      setConflict(null);
    },
  };
}
