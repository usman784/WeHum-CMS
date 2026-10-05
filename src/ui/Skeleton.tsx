import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/** Loading placeholder. Hidden from screen readers: the parent announces "Loading" once (see `SkeletonRows`). */
export function Skeleton({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('animate-pulse rounded-input bg-surface-alt', className)} {...p} />;
}

/** A block of list rows while a table or list loads. */
export function SkeletonRows({ rows = 5, label = 'Loading', className }: { rows?: number; label?: string; className?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy className={cn('flex flex-col', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-16 items-center gap-3 border-b border-border px-5">
          <Skeleton className="size-11 rounded-input" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}
