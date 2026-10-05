import { useSocketStatus } from '../../hooks/useLive';
import type { SocketStatus } from '../../lib/socket';
import { LiveDot } from '../../ui/LiveDot';

const pill: Record<SocketStatus, { label: string; tone: 'live' | 'warning' | 'off' }> = {
  live: { label: 'Live', tone: 'live' },
  reconnecting: { label: 'Reconnecting…', tone: 'warning' },
  offline: { label: 'Offline', tone: 'off' },
};

/** Socket state in the top bar (spec §6.3): Live (green), Reconnecting… (amber, after 5 s), Offline (grey). */
export function ConnectionPill() {
  const status = useSocketStatus();
  return (
    <span
      role="status"
      className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-3 text-xs font-semibold text-text-soft"
    >
      <LiveDot tone={pill[status].tone} pulse={status === 'live'} className="size-2" />
      {pill[status].label}
    </span>
  );
}
