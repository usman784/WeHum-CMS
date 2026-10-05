import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode;
  description?: ReactNode;
  /** Hide the text but keep it for screen readers (table row selection). */
  hideLabel?: boolean;
};

/** Native checkbox, ember accent (design: `accent-color: #FF7A45`). Works with react-hook-form `register`. */
export const Checkbox = forwardRef<HTMLInputElement, Props>(({ label, description, hideLabel, className, disabled, ...p }, ref) => (
  <label className={cn('inline-flex items-start gap-2.5 text-body', disabled && 'cursor-not-allowed opacity-60', className)}>
    <input ref={ref} type="checkbox" disabled={disabled} className="mt-0.5 size-5 shrink-0 rounded accent-ember" {...p} />
    <span className={cn('flex flex-col', hideLabel && 'sr-only')}>
      <span>{label}</span>
      {description ? <span className="text-xs text-text-muted">{description}</span> : null}
    </span>
  </label>
));
Checkbox.displayName = 'Checkbox';
