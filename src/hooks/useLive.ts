import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket, onStatus, subscribe, type SocketStatus } from '../lib/socket';
import { qk } from '../lib/query';
import type { AdminServerToClient } from '../lib/socket-events';

/** Subscribe to socket channels for the lifetime of a component (spec §6.3). */
export function useSubscribe(channels: string[]) {
  const key = channels.join('|');
  useEffect(() => subscribe(channels), [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Listen to one server event. The handler may be an inline function: the latest one is always called, without re-binding. */
export function useSocketEvent<E extends keyof AdminServerToClient>(event: E, handler: AdminServerToClient[E]) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const listener = (...args: unknown[]) => (latest.current as (...a: unknown[]) => void)(...args);
    s.on(event, listener as never);
    return () => {
      s.off(event, listener as never);
    };
  }, [event]);
}

/**
 * Mount once in AppShell: maps `entity:changed` → TanStack Query invalidation (debounced 500 ms per type)
 * and patches small live values directly into the cache.
 */
export function useLiveInvalidation() {
  const qc = useQueryClient();
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const onEntity: AdminServerToClient['entity:changed'] = ({ type, id }) => {
      clearTimeout(timers.get(type));
      timers.set(
        type,
        setTimeout(() => qc.invalidateQueries({ queryKey: [type] }), 500),
      );
      qc.invalidateQueries({ queryKey: [type, 'detail', id] });
    };
    // Merge, never replace: the page also holds numbers the socket does not carry (library, change against last week).
    const onKpis: AdminServerToClient['dashboard:kpis'] = ({ at: _at, ...k }) => {
      void _at;
      qc.setQueryData(qk.dashboard, (old: { kpis?: object; moderationOpen?: number } | undefined) =>
        old
          ? { ...old, ...(old.kpis ? { kpis: { ...old.kpis, ...k } } : {}), moderationOpen: k.moderationOpen ?? old.moderationOpen }
          : old,
      );
    };
    const onLive: AdminServerToClient['live:agg'] = (p) =>
      qc.setQueryData(qk.dashboard, (old: { kpis?: object } | undefined) =>
        old?.kpis ? { ...old, kpis: { ...old.kpis, liveNow: p.total, liveCountries: p.countries } } : old,
      );
    const onModeration: AdminServerToClient['moderation:count'] = ({ open }) =>
      qc.setQueryData(qk.dashboard, (old: { kpis?: object; moderationOpen?: number } | undefined) =>
        old ? { ...old, moderationOpen: open, ...(old.kpis ? { kpis: { ...old.kpis, moderationOpen: open } } : {}) } : old,
      );
    const onJob: AdminServerToClient['job:progress'] = (j) => qc.setQueryData(qk.job(j.id), j);
    s.on('entity:changed', onEntity);
    s.on('dashboard:kpis', onKpis);
    s.on('live:agg', onLive);
    s.on('moderation:count', onModeration);
    s.on('job:progress', onJob);
    return () => {
      s.off('entity:changed', onEntity);
      s.off('dashboard:kpis', onKpis);
      s.off('live:agg', onLive);
      s.off('moderation:count', onModeration);
      s.off('job:progress', onJob);
      timers.forEach(clearTimeout);
    };
  }, [qc]);
}

export function useSocketStatus() {
  const [st, setSt] = useState<SocketStatus>('offline');
  useEffect(() => {
    const off = onStatus(setSt);
    return () => {
      off();
    };
  }, []);
  return st;
}
