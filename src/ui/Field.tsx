import { useId, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export type FieldProps = {
  label: ReactNode;
  /** Shown next to the label in regular weight, e.g. "max 160 characters". */
  hint?: ReactNode;
  /** Validation message (zod or the API's `VALIDATION_FAILED.details.fields[]`). */
  error?: string;
  /** Extra line under the control. */
  help?: ReactNode;
  /** Right side of the label row, e.g. a character counter. */
  aside?: ReactNode;
  hideLabel?: boolean;
  className?: string;
};

/** Ids that tie label, help and error text to a control. */
export function useFieldIds(error?: string, help?: ReactNode) {
  const id = useId();
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const describedBy = [error ? errorId : null, help ? helpId : null].filter(Boolean).join(' ') || undefined;
  return { id, errorId, helpId, describedBy };
}

type ShellProps = FieldProps & { ids: ReturnType<typeof useFieldIds>; children: ReactNode };

/** Label + control + help/error (design: SessionEditor.dc.html labels, 13 px / 600 / text-soft). */
export function FieldShell({ label, hint, error, help, aside, hideLabel, className, ids, children }: ShellProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className={cn('flex items-baseline gap-2', hideLabel && 'sr-only')}>
        <label htmlFor={ids.id} className="text-sm font-semibold text-text-soft">
          {label}
        </label>
        {hint ? <span className="text-sm text-text-muted">{hint}</span> : null}
        {aside ? <span className="ml-auto">{aside}</span> : null}
      </div>
      {children}
      {help ? (
        <p id={ids.helpId} className="text-xs text-text-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={ids.errorId} role="alert" className="text-xs font-semibold text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Shared look of text-like controls. `md` = 46 px (editors), `sm` = 40 px (filters, side cards). */
export const controlClass = (size: 'md' | 'sm' = 'md', invalid = false) =>
  cn(
    'w-full border bg-input text-text placeholder:text-text-faint transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-60 read-only:text-text-muted',
    size === 'md' ? 'h-[46px] rounded-btn px-3.5 text-[15px]' : 'h-10 rounded-input px-3 text-body',
    invalid ? 'border-danger' : 'border-border-strong hover:border-outline',
  );
