import { useEffect, useRef, useState } from 'react';

export const IDLE_LIMIT_MS = 12 * 60 * 60 * 1000; // spec §6.2: 12 h
export const IDLE_WARNING_MS = 5 * 60 * 1000; // warning dialog at 11 h 55 min

const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
const CHANNEL = 'wh-activity';

type Options = {
  enabled: boolean;
  onTimeout: () => void;
  limitMs?: number;
  warningMs?: number;
};

/**
 * Signs the admin out after `limitMs` without any input, with a warning `warningMs` before.
 * Activity in another tab of the CMS counts too (BroadcastChannel), so two open tabs do not fight.
 * Returns the seconds left while the warning shows (else null) and `stay()` to keep the session.
 */
export function useIdleTimeout({ enabled, onTimeout, limitMs = IDLE_LIMIT_MS, warningMs = IDLE_WARNING_MS }: Options) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const last = useRef(Date.now());
  const warning = useRef(false);
  const timeout = useRef(onTimeout);
  timeout.current = onTimeout;
  const channel = useRef<BroadcastChannel | null>(null);

  const stay = () => {
    last.current = Date.now();
    warning.current = false;
    setSecondsLeft(null);
    channel.current?.postMessage(last.current);
  };

  useEffect(() => {
    if (!enabled) return;
    last.current = Date.now();
    warning.current = false;
    setSecondsLeft(null);

    const bc = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
    channel.current = bc;
    let lastSent = 0;

    const onActivity = () => {
      // While the warning shows, only the "Stay signed in" button counts: a stray key press must not hide the dialog.
      if (warning.current) return;
      last.current = Date.now();
      if (bc && last.current - lastSent > 5000) {
        lastSent = last.current;
        bc.postMessage(last.current);
      }
    };
    const onRemote = (e: MessageEvent<number>) => {
      if (typeof e.data !== 'number' || e.data <= last.current) return;
      last.current = e.data;
      warning.current = false;
      setSecondsLeft(null);
    };
    EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    bc?.addEventListener('message', onRemote);

    // A plain timer would drift or stop while the laptop sleeps, so compare clock times on every tick.
    const tick = setInterval(() => {
      const left = limitMs - (Date.now() - last.current);
      if (left <= 0) {
        clearInterval(tick);
        timeout.current();
      } else if (left <= warningMs) {
        warning.current = true;
        setSecondsLeft(Math.ceil(left / 1000));
      }
    }, 1000);

    return () => {
      clearInterval(tick);
      EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
      bc?.removeEventListener('message', onRemote);
      bc?.close();
      channel.current = null;
    };
  }, [enabled, limitMs, warningMs]);

  return { secondsLeft, stay };
}
