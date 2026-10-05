import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../lib/cn';
import { controlClass, FieldShell, useFieldIds, type FieldProps } from './Field';

type Props = FieldProps & {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Shown after the number, e.g. "min" or "posts per day". */
  unit?: string;
  disabled?: boolean;
  name?: string;
};

const clamp = (n: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

/** Whole-number input with − / + buttons. Typing is free; the value is clamped to min/max when the field loses focus. */
export function NumberInput({
  label,
  hint,
  error,
  help,
  aside,
  hideLabel,
  className,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled,
  name,
}: Props) {
  const ids = useFieldIds(error, help);
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);

  const commit = (raw: string) => {
    if (raw.trim() === '') return onChange(null);
    const n = Number(raw);
    if (!Number.isFinite(n)) return setText(value === null ? '' : String(value));
    const next = clamp(Math.round(n), min, max);
    setText(String(next));
    onChange(next);
  };
  const bump = (dir: 1 | -1) => commit(String(clamp((value ?? min ?? 0) + dir * step, min, max)));

  const stepBtn =
    'flex size-9 shrink-0 items-center justify-center rounded-input text-text-muted hover:bg-surface-alt hover:text-text disabled:opacity-40';
  return (
    <FieldShell {...{ label, hint, error, help, aside, hideLabel, className, ids }}>
      <div
        className={cn(
          controlClass('md', !!error),
          'flex items-center gap-1 px-1.5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ember-soft',
        )}
      >
        <button
          type="button"
          aria-label="Decrease"
          className={stepBtn}
          disabled={disabled || (min !== undefined && value !== null && value <= min)}
          onClick={() => bump(-1)}
        >
          <Minus size={16} aria-hidden />
        </button>
        <input
          id={ids.id}
          name={name}
          inputMode="numeric"
          role="spinbutton"
          aria-valuenow={value ?? undefined}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
          disabled={disabled}
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d-]/g, ''))}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              bump(1);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              bump(-1);
            } else if (e.key === 'Enter') commit(e.currentTarget.value);
          }}
          className="tabular min-w-0 flex-1 border-none bg-transparent text-center text-[15px] text-text outline-none"
        />
        {unit ? <span className="pr-1 text-sm text-text-muted">{unit}</span> : null}
        <button
          type="button"
          aria-label="Increase"
          className={stepBtn}
          disabled={disabled || (max !== undefined && value !== null && value >= max)}
          onClick={() => bump(1)}
        >
          <Plus size={16} aria-hidden />
        </button>
      </div>
    </FieldShell>
  );
}
