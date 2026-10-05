import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { LiveDot } from './LiveDot';
import { Skeleton } from './Skeleton';

type Props = {
  label: string;
  /** Already formatted (e.g. "3,180"). */
  value: ReactNode;
  hint?: ReactNode;
  hintTone?: 'muted' | 'success' | 'warning';
  live?: boolean;
  loading?: boolean;
  /** Small tiles use a 24 px number (spec §4). */
  size?: 'md' | 'sm';
  className?: string;
};

const hintTones = { muted: 'text-text-muted', success: 'text-success-text', warning: 'text-warning' };

/** KPI tile (design: Main.dc.html "Key numbers"). */
export function KpiTile({ label, value, hint, hintTone = 'muted', live, loading, size = 'md', className }: Props) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-card border border-border bg-surface px-5 py-[18px]', className)}>
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      {loading ? (
        <Skeleton className="h-9 w-24" />
      ) : (
        <div className="flex items-center gap-2.5">
          {live ? <LiveDot pulse /> : null}
          <span className={cn('tabular font-bold', size === 'md' ? 'text-kpi' : 'text-2xl')}>{value}</span>
        </div>
      )}
      {hint ? <span className={cn('text-sm', hintTones[hintTone])}>{hint}</span> : null}
    </div>
  );
}
