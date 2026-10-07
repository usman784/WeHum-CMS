import * as RadixSwitch from '@radix-ui/react-switch';
import { useId, type ReactNode } from 'react';
import { cn } from '../lib/cn';

type Props = {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: ReactNode;
  /** Second line under the label. */
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
};

/** Labelled on/off row (design: Settings.dc.html toggles). The whole row text is the label. */
export function Switch({ checked, onCheckedChange, label, description, disabled, className }: Props) {
  const id = useId();
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      {/* the label names the switch; the second line describes it (not part of the name) */}
      <label htmlFor={id} className={cn('flex min-w-0 flex-col text-body', disabled && 'opacity-60')}>
        <span id={`${id}-label`} className="font-semibold">
          {label}
        </span>
        {description ? (
          <span id={`${id}-desc`} className="text-xs font-normal text-text-muted">
            {description}
          </span>
        ) : null}
      </label>
      <RadixSwitch.Root
        id={id}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative h-6 w-11 shrink-0 rounded-full border border-border-strong bg-input transition-colors disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:border-ember data-[state=checked]:bg-ember"
      >
        <RadixSwitch.Thumb className="block size-[18px] translate-x-0.5 rounded-full bg-text-muted transition-transform data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-ember-on" />
      </RadixSwitch.Root>
    </div>
  );
}
