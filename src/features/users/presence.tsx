import { useState, type ReactNode } from 'react';
import { useSocketEvent, useSubscribe } from '../../hooks/useLive';
import { cn } from '../../lib/cn';
import { formatRelative } from '../../lib/format';
import { LiveDot } from '../../ui/LiveDot';

export type Presence = { online: boolean; lastActiveAt: string };
type Changes = Record<string, { online: boolean; lastActiveAt?: string }>;

/**
 * Online / offline as it changes (socket `users:presence`, room `users`). `of(u)` is what the server sent with the user
 * (`online`, `lastActiveAt`) plus every change since; `delta` is how many came online minus how many left.
 */
export function useUserPresence(onChange?: (p: { id: string; online: boolean }) => void) {
  const [changes, setChanges] = useState<Changes>({});
  const [delta, setDelta] = useState(0);
  useSubscribe(['users']);
  useSocketEvent('users:presence', (p) => {
    const before = changes[p.id]?.online;
    // a repeat of what we already know (same state twice) must not move the count
    if (before !== p.online) setDelta((n) => n + (p.online ? 1 : -1));
    setChanges((m) => ({ ...m, [p.id]: { online: p.online, lastActiveAt: p.lastActiveAt ?? m[p.id]?.lastActiveAt } }));
    onChange?.({ id: p.id, online: p.online });
  });
  const of = (u: { id: string; online?: boolean; lastActiveAt: string }): Presence => {
    const c = changes[u.id];
    return { online: c ? c.online : !!u.online, lastActiveAt: c?.lastActiveAt ?? u.lastActiveAt };
  };
  /** Call when the list was fetched again: its numbers already include the changes so far. */
  const reset = () => {
    setChanges({});
    setDelta(0);
  };
  return { of, delta, reset };
}

/** Green dot on the avatar while the app is open, grey when it is closed. */
export function AvatarStatus({ online, size = 40, children }: { online: boolean; size?: number; children: ReactNode }) {
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      <span
        aria-hidden
        data-testid={online ? 'dot-online' : 'dot-offline'}
        className={cn(
          'absolute right-0 bottom-0 rounded-full ring-2 ring-surface',
          size > 48 ? 'size-3.5' : 'size-3',
          online ? 'bg-success' : 'bg-text-faint',
        )}
      />
    </span>
  );
}

/** "Online now" (green, pulsing) or "2 h ago" / "Offline · last active 2 h ago" (grey). */
export function OnlineText({ p, long = false, className }: { p: Presence; long?: boolean; className?: string }) {
  return p.online ? (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-semibold text-success-text', className)}>
      <LiveDot pulse />
      Online now
    </span>
  ) : (
    <span className={cn('inline-flex items-center gap-1.5 text-sm text-text-muted', className)}>
      <LiveDot tone="off" />
      {long ? `Offline · last active ${formatRelative(p.lastActiveAt)}` : formatRelative(p.lastActiveAt)}
    </span>
  );
}
