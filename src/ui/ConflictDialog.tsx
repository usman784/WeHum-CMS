import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

export type ConflictField<T> = {
  key: keyof T & string;
  label: string;
  /** How to show a value. Default: text, "—" for empty, "Yes"/"No" for booleans. */
  format?: (value: T[keyof T], row: T) => ReactNode;
};

const plain = (v: unknown): ReactNode => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  return String(v);
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The fields where my unsaved values differ from what is saved on the server now. */
export function conflictingFields<T extends object>(mine: Partial<T>, theirs: T, fields: ConflictField<T>[]) {
  return fields.filter((f) => f.key in mine && !same(mine[f.key], theirs[f.key]));
}

type Props<T extends object> = {
  open: boolean;
  /** What this admin was trying to save. */
  mine: Partial<T>;
  /** The entity as it is on the server now (from the 409 answer). */
  theirs: T;
  fields: ConflictField<T>[];
  /** Who saved in the meantime, when known. */
  by?: string | null;
  saving?: boolean;
  /** Save my values on top of theirs (uses their version, so it succeeds unless it changes yet again). */
  onKeepMine: () => void;
  /** Drop my changes and load theirs into the form. */
  onTakeTheirs: () => void;
};

/**
 * 409 CONFLICT_VERSION (spec §6.1, §10): someone saved while this form was open. Nothing is overwritten silently:
 * the admin sees both versions of each differing field and picks one.
 */
export function ConflictDialog<T extends object>({ open, mine, theirs, fields, by, saving, onKeepMine, onTakeTheirs }: Props<T>) {
  const diff = conflictingFields(mine, theirs, fields);
  return (
    <Dialog
      open={open}
      // Closing without choosing keeps the form as it is; the next save shows this dialog again.
      onOpenChange={() => {}}
      title="This was changed while you were editing"
      description={`${by ?? 'Someone else'} saved a newer version. Choose which one to keep.`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onTakeTheirs} disabled={saving}>
            Use their version
          </Button>
          <Button onClick={onKeepMine} loading={saving}>
            Keep my changes
          </Button>
        </>
      }
    >
      {diff.length ? (
        <table className="w-full border-separate border-spacing-0 text-body">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.8px] text-text-faint">
              <th scope="col" className="w-1/4 py-2 pr-3">
                Field
              </th>
              <th scope="col" className="w-[37.5%] py-2 pr-3">
                Their version
              </th>
              <th scope="col" className="py-2">
                Your version
              </th>
            </tr>
          </thead>
          <tbody>
            {diff.map((f) => (
              <tr key={f.key}>
                <th scope="row" className="border-t border-border py-2.5 pr-3 text-left align-top font-semibold text-text-soft">
                  {f.label}
                </th>
                <td className="break-words border-t border-border py-2.5 pr-3 align-top text-text-body">
                  {(f.format ?? plain)(theirs[f.key], theirs)}
                </td>
                <td className="break-words border-t border-border py-2.5 align-top text-text">
                  {(f.format ?? plain)(mine[f.key] as T[keyof T], { ...theirs, ...mine })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-body text-text-body">
          Your changes and theirs do not touch the same fields. “Keep my changes” saves yours on top of theirs.
        </p>
      )}
    </Dialog>
  );
}
