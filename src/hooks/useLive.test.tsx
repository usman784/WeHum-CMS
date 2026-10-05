import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../lib/api';
import { createQueryClient, qk } from '../lib/query';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { lastSocket, sockets } from '../test/fake-socket';
import { useLiveInvalidation, useSocketStatus, useSubscribe } from './useLive';

vi.mock('socket.io-client', async () => ({ io: (await import('../test/fake-socket')).fakeIo }));

const qc = createQueryClient();
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

beforeEach(async () => {
  sockets.length = 0;
  auth.set('tok-1');
  connectSocket();
  await lastSocket().fire('connect');
});

afterEach(() => {
  disconnectSocket();
  auth.set(null);
  qc.clear();
  vi.useRealTimers();
});

describe('useSubscribe', () => {
  it('subscribes on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useSubscribe(['entities', 'jobs']));
    expect(lastSocket().sent('subscribe').at(-1)).toEqual({ channels: ['entities', 'jobs'] });
    unmount();
    expect(lastSocket().sent('unsubscribe')).toEqual([{ channels: ['entities', 'jobs'] }]);
  });
});

describe('useSocketStatus', () => {
  it('follows the connection status', () => {
    const { result } = renderHook(() => useSocketStatus());
    expect(result.current).toBe('live');
    act(() => disconnectSocket());
    expect(result.current).toBe('offline');
  });
});

describe('useLiveInvalidation', () => {
  it('entity:changed invalidates the detail at once and the lists after a 500 ms debounce', async () => {
    vi.useFakeTimers();
    qc.setQueryData(qk.session.list(), []);
    qc.setQueryData(qk.session.detail('s1'), { id: 's1' });
    qc.setQueryData(qk.theme.list(), []);
    renderHook(() => useLiveInvalidation(), { wrapper });
    const change = { type: 'session', id: 's1', op: 'update', version: 2, by: null };
    await act(() => lastSocket().fire('entity:changed', change));
    await act(() => lastSocket().fire('entity:changed', change));
    expect(qc.getQueryState(qk.session.detail('s1'))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(qk.session.list())?.isInvalidated).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(qc.getQueryState(qk.session.list())?.isInvalidated).toBe(true);
    expect(qc.getQueryState(qk.theme.list())?.isInvalidated).toBe(false);
  });

  it('patches dashboard KPIs and job progress straight into the cache', async () => {
    renderHook(() => useLiveInvalidation(), { wrapper });
    await act(() => lastSocket().fire('dashboard:kpis', { liveNow: 12 }));
    await act(() => lastSocket().fire('job:progress', { id: 'j1', type: 'media', status: 'active', progress: 40 }));
    expect(qc.getQueryData(qk.dashboard)).toEqual({ kpis: { liveNow: 12 } });
    expect(qc.getQueryData(qk.job('j1'))).toMatchObject({ progress: 40 });
  });

  it('removes its listeners on unmount', () => {
    const { unmount } = renderHook(() => useLiveInvalidation(), { wrapper });
    expect(lastSocket().listenerCount('entity:changed')).toBe(1);
    unmount();
    expect(lastSocket().listenerCount('entity:changed')).toBe(0);
  });
});
