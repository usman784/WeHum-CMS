import { useEffect, useRef, useState } from 'react';
import { session } from '../lib/session';
import { getSocket } from '../lib/socket';
import type { AdminServerToClient, EntityType } from '../lib/socket-events';
import { useSocketEvent, useSocketStatus } from './useLive';

type Changed = Parameters<AdminServerToClient['entity:changed']>[0];

/**
 * Who else has this entity open for editing (spec §6.3, §10). Announces this admin on mount and after every
 * reconnect (the server forgets on disconnect), and withdraws on unmount. Returns the other admins' names.
 */
export function useEditingPresence(type: EntityType, id: string | null | undefined): string[] {
  const [others, setOthers] = useState<string[]>([]);
  const live = useSocketStatus() === 'live';

  useEffect(() => {
    if (!id || !live) return;
    const s = getSocket();
    s?.emit('editing:start', { type, id });
    return () => {
      s?.emit('editing:stop', { type, id });
      setOthers([]);
    };
  }, [type, id, live]);

  useSocketEvent('editing:presence', (p) => {
    if (p.type !== type || p.id !== id) return;
    setOthers(p.admins.filter((a) => a.id !== session.admin?.id).map((a) => a.name));
  });
  return others;
}

/**
 * Tells an open editor that someone else saved the same entity: returns that event until `dismiss()` is called.
 * Saves by this admin are ignored, so your own save never warns you (spec §6.3 "no silent overwrite").
 */
export function useChangedByOthers(type: EntityType, id: string | null | undefined) {
  const [change, setChange] = useState<Changed | null>(null);
  useEffect(() => setChange(null), [type, id]);
  useSocketEvent('entity:changed', (e) => {
    if (e.type !== type || e.id !== id) return;
    if (e.by?.id && e.by.id === session.admin?.id) return;
    setChange(e);
  });
  return { change, dismiss: () => setChange(null) };
}

/**
 * Keys of rows that changed in the last 2 s, for the row highlight in lists (spec §6.3).
 * The list itself is refreshed by `useLiveInvalidation` in the shell.
 */
export function useRecentChanges(type: EntityType, ms = 2000): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);
  useSocketEvent('entity:changed', (e) => {
    if (e.type !== type) return;
    setIds((old) => new Set(old).add(e.id));
    clearTimeout(timers.current.get(e.id));
    timers.current.set(
      e.id,
      setTimeout(() => {
        timers.current.delete(e.id);
        setIds((old) => {
          const next = new Set(old);
          next.delete(e.id);
          return next;
        });
      }, ms),
    );
  });
  return ids;
}
