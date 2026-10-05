import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type PillOption<T extends string> = { value: T; label: ReactNode; count?: number };

type Props<T extends string> = {
  options: PillOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Names the group for screen readers, e.g. "Filter sessions". */
  label: string;
  className?: string;
};

/**
 * Filter pills (design: Sessions.dc.html tabs). A single-choice filter, so it is a radio group:
 * arrow keys move the choice, Tab leaves the group.
 */
export function TabPills<T extends string>({ options, value, onChange, label, className }: Props<T>) {
  const move = (dir: 1 | -1) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    if (next) onChange(next.value);
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-wrap items-center gap-2', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move(1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(-1);
              }
            }}
            ref={(el) => {
              // Keep keyboard focus on the chosen pill after an arrow key moved the choice.
              if (on && el && el.parentElement?.contains(document.activeElement) && document.activeElement !== el) el.focus();
            }}
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors',
              on ? 'border-ember bg-ember text-ember-on' : 'border-border-strong bg-surface text-text-soft hover:border-outline',
            )}
          >
            {o.label}
            {o.count !== undefined ? <span className="tabular text-xs font-normal">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Small removable or static label, e.g. theme chips on a daily message. */
export function Chip({ children, onRemove, className }: { children: ReactNode; onRemove?: () => void; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border border-border-strong bg-surface-alt px-3 text-sm text-text-soft',
        className,
      )}
    >
      {children}
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label="Remove" className="-mr-1 rounded-full px-1 text-text-muted hover:text-text">
          ×
        </button>
      ) : null}
    </span>
  );
}
