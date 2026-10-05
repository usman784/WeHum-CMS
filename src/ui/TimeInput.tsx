import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { localPreviews, todayUtc } from '../lib/tz';
import { controlClass, FieldShell, useFieldIds, type FieldProps } from './Field';

type TimeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'size'> &
  FieldProps & {
    /** `HH:mm` in UTC. */
    value: string;
    onChange: (hhmm: string) => void;
    /** UTC day (`yyyy-MM-dd`) used for the local previews, because DST changes them. Default: today. */
    utcDate?: string;
  };

const shift = { '-1': 'the day before', '0': '', '1': 'next day' } as const;

/** Time of day in UTC with local previews for Berlin, New York, Lahore and Sydney (spec §6.1, screen 13). */
export const TimeInput = forwardRef<HTMLInputElement, TimeProps>(
  ({ label, hint, error, help, aside, hideLabel, className, value, onChange, utcDate = todayUtc(), ...p }, ref) => {
    const ids = useFieldIds(error, help);
    const previews = localPreviews(value, utcDate);
    return (
      <FieldShell {...{ label, error, help, aside, hideLabel, className, ids }} hint={hint ?? 'UTC'}>
        <input
          ref={ref}
          id={ids.id}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
          className={cn(controlClass('md', !!error), 'tabular')}
          {...p}
        />
        {previews.length ? (
          <ul aria-label="Local times" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {previews.map((l) => (
              <li key={l.zone} className="flex flex-col rounded-input bg-input px-3 py-2">
                <span className="text-xs text-text-muted">{l.city}</span>
                <span className="tabular text-body font-semibold">
                  {l.time}
                  {l.dayShift ? <span className="ml-1.5 text-xs font-normal text-text-muted">{shift[l.dayShift]}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </FieldShell>
    );
  },
);
TimeInput.displayName = 'TimeInput';

type DateProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & FieldProps & { size?: 'md' | 'sm' };

/** Calendar day (`yyyy-MM-dd`) using the browser's date picker: keyboard and screen-reader support come built in. */
export const DatePicker = forwardRef<HTMLInputElement, DateProps>(
  ({ label, hint, error, help, aside, hideLabel, className, size = 'md', ...p }, ref) => {
    const ids = useFieldIds(error, help);
    return (
      <FieldShell {...{ label, hint, error, help, aside, hideLabel, className, ids }}>
        <input
          ref={ref}
          id={ids.id}
          type="date"
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
          className={cn(controlClass(size, !!error), 'tabular')}
          {...p}
        />
      </FieldShell>
    );
  },
);
DatePicker.displayName = 'DatePicker';
