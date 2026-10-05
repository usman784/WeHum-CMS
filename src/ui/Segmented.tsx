import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

type Option<T extends string> = { value: T; label: ReactNode; disabled?: boolean };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
  className?: string;
};

/** Two-to-four way switch in one track (design: SessionEditor.dc.html "Access" Free / Premium). Radio group semantics. */
export function Segmented<T extends string>({ options, value, onChange, label, disabled, className }: Props<T>) {
  const enabled = options.filter((o) => !o.disabled);
  const move = (dir: 1 | -1) => {
    const i = enabled.findIndex((o) => o.value === value);
    const next = enabled[(i + dir + enabled.length) % enabled.length];
    if (next) onChange(next.value);
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn('grid auto-cols-fr grid-flow-col gap-1.5 rounded-btn border border-border-strong bg-input p-1', className)}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled || o.disabled}
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
              if (on && el && el.parentElement?.contains(document.activeElement) && document.activeElement !== el) el.focus();
            }}
            className={cn(
              'h-10 rounded-[9px] px-3 text-body transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              on ? 'bg-ember font-bold text-ember-on' : 'bg-transparent font-semibold text-text-muted hover:text-text',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
