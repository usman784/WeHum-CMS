import { useRef, useState } from 'react';
import { useVersionedSave } from '../../hooks/useVersionedSave';

/** A settings document of the backend (`app_config`): the whole value is replaced on every save. */
export type ConfigDoc<T> = { key: string; value: T; version: number; updatedAt: string | null };

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

type Options<T extends object> = {
  doc: ConfigDoc<T> | undefined;
  /** Replaces the whole value. `version` goes into `If-Match`. */
  put: (value: T, version: number) => Promise<ConfigDoc<T>>;
  /** The saved document, or "their version" after a conflict: put it into the query cache. */
  onSaved: (doc: ConfigDoc<T>) => void;
  onError: (e: unknown) => void;
};

/**
 * Editing state of a settings document. Only the fields this admin changed are kept (`changes`): the rest follows the
 * server, so what others save shows up at once. The save sends the whole value built from the server's value plus my
 * changes, and `If-Match` carries the version the first edit was based on, so a newer save gives the 409 dialog
 * (spec §6.1) instead of being overwritten. "Keep my changes" puts my changes on top of their value.
 */
export function useConfigForm<T extends object>({ doc, put, onSaved, onError }: Options<T>) {
  const [changes, setChanges] = useState<Partial<T>>({});
  const baseVersion = useRef<number | null>(null);

  const edit = (patch: Partial<T>) => {
    baseVersion.current ??= doc?.version ?? null;
    setChanges((c) => {
      const next = { ...c, ...patch };
      // a value put back to what is saved is no change
      for (const k of Object.keys(next) as (keyof T)[]) if (doc && same(next[k], doc.value[k])) delete next[k];
      return next;
    });
  };
  const clear = () => {
    setChanges({});
    baseVersion.current = null;
  };

  const m = useVersionedSave<ConfigDoc<T>, Partial<T>>({
    save: (ch, version, theirs) => put({ ...(theirs ?? doc!).value, ...ch }, version),
    onSaved: (row) => {
      clear();
      onSaved(row);
    },
    onError: (e) => onError(e),
  });

  const dirty = !!doc && Object.keys(changes).length > 0;
  return {
    /** What the form shows: the saved value with my changes on top. */
    value: doc ? ({ ...doc.value, ...changes } as T) : undefined,
    changes,
    dirty,
    edit,
    discard: clear,
    saving: m.saving,
    save: () => {
      if (doc && dirty) m.save(changes, baseVersion.current ?? doc.version);
    },
    conflict: m.conflict,
    keepMine: m.keepMine,
    takeTheirs: () =>
      m.takeTheirs((theirs) => {
        clear();
        onSaved(theirs);
      }),
  };
}
