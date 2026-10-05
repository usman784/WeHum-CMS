import { ChevronDown } from 'lucide-react';
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { controlClass, FieldShell, useFieldIds, type FieldProps } from './Field';

export type SelectOption = { value: string; label: string; disabled?: boolean };

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> &
  FieldProps & {
    options: SelectOption[];
    placeholder?: string;
    size?: 'md' | 'sm';
    /** Label left of the control instead of above (design: Sessions.dc.html filters "Theme [All 8]"). */
    inline?: boolean;
  };

/**
 * Native <select>, styled. The design uses native selects, and the native control gives the best keyboard,
 * screen-reader and mobile behaviour for plain lists. Works with react-hook-form `register`.
 */
export const Select = forwardRef<HTMLSelectElement, Props>(
  ({ label, hint, error, help, aside, hideLabel, className, options, placeholder, size = 'md', inline, ...p }, ref) => {
    const ids = useFieldIds(error, help);
    const control = (
      <span className="relative block">
        <select
          ref={ref}
          id={ids.id}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
          className={cn(controlClass(size, !!error), 'appearance-none pr-9', inline && 'bg-surface')}
          {...p}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
      </span>
    );
    if (inline) {
      return (
        <div className={cn('flex items-center gap-2', className)}>
          <label htmlFor={ids.id} className="text-sm text-text-muted">
            {label}
          </label>
          {control}
        </div>
      );
    }
    return <FieldShell {...{ label, hint, error, help, aside, hideLabel, className, ids }}>{control}</FieldShell>;
  },
);
Select.displayName = 'Select';
