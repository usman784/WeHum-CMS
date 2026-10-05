import { Search } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { controlClass, FieldShell, useFieldIds, type FieldProps } from './Field';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & FieldProps & { size?: 'md' | 'sm' };

/** Text input with label, help and error. Works with react-hook-form `register`. */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, help, aside, hideLabel, className, size = 'md', ...p }, ref) => {
    const ids = useFieldIds(error, help);
    return (
      <FieldShell {...{ label, hint, error, help, aside, hideLabel, className, ids }}>
        <input
          ref={ref}
          id={ids.id}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
          className={controlClass(size, !!error)}
          {...p}
        />
      </FieldShell>
    );
  },
);
Input.displayName = 'Input';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps & { value?: string };

/**
 * Textarea. With `maxLength` and a controlled `value` it shows a live "used / max" counter (push title ≤ 50, body ≤ 150).
 * The limit is not passed to the browser on purpose: a pasted text is never cut silently. Going over turns the
 * counter red and marks the field invalid; the form's zod schema blocks the save.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, help, aside, hideLabel, className, rows = 3, maxLength, value, ...p }, ref) => {
    const ids = useFieldIds(error, help);
    const used = typeof value === 'string' ? value.length : undefined;
    const counter =
      maxLength !== undefined && used !== undefined ? (
        <span className={cn('tabular text-xs', used > maxLength ? 'font-semibold text-danger-text' : 'text-text-muted')}>
          <span className="sr-only">Characters used: </span>
          {used} / {maxLength}
        </span>
      ) : null;
    return (
      <FieldShell {...{ label, hint, error, help, hideLabel, className, ids }} aside={aside ?? counter}>
        <textarea
          ref={ref}
          id={ids.id}
          rows={rows}
          value={value}
          aria-invalid={error || (used !== undefined && maxLength !== undefined && used > maxLength) ? true : undefined}
          aria-describedby={ids.describedBy}
          className={cn(controlClass('md', !!error), 'h-auto resize-y py-3 leading-normal')}
          {...p}
        />
      </FieldShell>
    );
  },
);
Textarea.displayName = 'Textarea';

type SearchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string };

/** Search box (design: Sessions.dc.html). The label is for screen readers; the placeholder is only a hint. */
export const SearchInput = forwardRef<HTMLInputElement, SearchProps>(({ label, className, ...p }, ref) => (
  <label
    className={cn(
      'flex h-11 w-80 max-w-full items-center gap-2.5 rounded-btn border border-border-strong bg-surface px-3.5 text-text-muted focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ember-soft',
      className,
    )}
  >
    <Search size={18} aria-hidden />
    <span className="sr-only">{label}</span>
    <input
      ref={ref}
      type="search"
      className="min-w-0 flex-1 border-none bg-transparent text-body text-text outline-none placeholder:text-text-faint"
      {...p}
    />
  </label>
));
SearchInput.displayName = 'SearchInput';
