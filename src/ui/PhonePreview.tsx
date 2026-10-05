import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

type Props = {
  /** Small caption above the frame, e.g. "PREVIEW · THU, OCT 1". */
  caption?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Phone frame that shows how a card will look in the app (design: TodayScreen.dc.html "App preview").
 * The app is dark only, so the inside is pinned to the dark tokens even when the CMS is in light theme.
 */
export function PhonePreview({ caption, children, className }: Props) {
  return (
    <aside aria-label="App preview" className={cn('flex flex-col items-center gap-3', className)}>
      {caption ? <span className="text-xs font-bold uppercase tracking-[1.2px] text-text-muted">{caption}</span> : null}
      <div
        data-theme="dark"
        className="flex h-[660px] w-80 flex-col gap-3.5 overflow-hidden rounded-[44px] border-8 border-border bg-bg px-4 py-[26px] text-text"
      >
        {children}
      </div>
    </aside>
  );
}

/** A card inside the phone, matching the app's card look. */
export function PhoneCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex flex-col gap-2.5 rounded-card border border-border bg-surface p-3.5', className)}>{children}</div>;
}
