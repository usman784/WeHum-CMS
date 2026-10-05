import { cn } from '../lib/cn';

const tones = { live: 'bg-success', warning: 'bg-warning', off: 'bg-text-faint' } as const;

/** Small status dot. `pulse` adds a soft ping for "live now" (turned off by prefers-reduced-motion). */
export function LiveDot({ tone = 'live', pulse = false, className }: { tone?: keyof typeof tones; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2.5 shrink-0', className)} aria-hidden>
      {pulse ? <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', tones[tone])} /> : null}
      <span className={cn('relative inline-flex size-2.5 rounded-full', tones[tone])} />
    </span>
  );
}
