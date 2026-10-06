import { http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, mockSession, ok, url } from '../mocks/handlers';
import { server } from '../mocks/server';
import { lastSocket, sockets } from '../test/fake-socket';
import { auth } from './api';
import { connectSocket, disconnectSocket, getSocket, getStatus, onStatus, subscribe } from './socket';

vi.mock('socket.io-client', async () => ({ io: (await import('../test/fake-socket')).fakeIo }));

beforeEach(() => {
  sockets.length = 0;
  auth.set('tok-1');
});

afterEach(() => {
  disconnectSocket();
  auth.set(null);
  vi.useRealTimers();
});

describe('connectSocket', () => {
  it('connects to the /admin namespace over websocket only, with the current token', () => {
    connectSocket();
    const s = lastSocket();
    expect(s.uri).toBe('http://api.test/admin');
    expect(s.opts.transports).toEqual(['websocket']);
    expect(s.handshake()).toEqual({ token: 'tok-1' });
    auth.set('tok-2'); // the handshake reads the token at connect time, so a reconnect uses the fresh one
    expect(s.handshake()).toEqual({ token: 'tok-2' });
  });

  it('returns the same socket when called twice', () => {
    expect(connectSocket()).toBe(connectSocket());
    expect(sockets).toHaveLength(1);
  });
});

describe('status', () => {
  it('starts offline, goes live on connect, and tells listeners (with the current value first)', async () => {
    const seen: string[] = [];
    const off = onStatus((s) => seen.push(s));
    connectSocket();
    await lastSocket().fire('connect');
    off();
    expect(seen).toEqual(['offline', 'live']);
    expect(getStatus()).toBe('live');
  });

  it('shows "reconnecting" only after 5 s without a connection', async () => {
    vi.useFakeTimers();
    connectSocket();
    const s = lastSocket();
    await s.fire('connect');
    await s.fire('disconnect', 'transport close');
    vi.advanceTimersByTime(4999);
    expect(getStatus()).toBe('live');
    vi.advanceTimersByTime(1);
    expect(getStatus()).toBe('reconnecting');
  });

  it('a quick reconnect never leaves "live"', async () => {
    vi.useFakeTimers();
    connectSocket();
    const s = lastSocket();
    await s.fire('connect');
    await s.fire('disconnect', 'transport close');
    vi.advanceTimersByTime(2000);
    await s.fire('connect');
    vi.advanceTimersByTime(10_000);
    expect(getStatus()).toBe('live');
  });

  it('goes offline after 5 failed attempts in a row, and live again when the server is back', async () => {
    connectSocket();
    const s = lastSocket();
    for (let i = 0; i < 4; i++) await s.fire('connect_error', new Error('xhr poll error'));
    expect(getStatus()).toBe('reconnecting');
    await s.fire('connect_error', new Error('xhr poll error'));
    expect(getStatus()).toBe('offline');
    await s.fire('connect');
    expect(getStatus()).toBe('live');
  });

  it('connects again by itself when the server closes the socket (token ran out, server shutting down)', async () => {
    connectSocket();
    const s = lastSocket();
    await s.fire('connect');
    await s.fire('disconnect', 'transport close'); // socket.io retries this one itself
    expect(s.connect).not.toHaveBeenCalled();
    await s.fire('disconnect', 'io server disconnect'); // but not this one
    expect(s.connect).toHaveBeenCalledTimes(1);
  });

  it('does not connect again after signing out', async () => {
    connectSocket();
    const s = lastSocket();
    await s.fire('connect');
    disconnectSocket();
    await s.fire('disconnect', 'io server disconnect');
    expect(s.connect).not.toHaveBeenCalled();
  });

  it('disconnectSocket closes the socket and reports offline', async () => {
    connectSocket();
    const s = lastSocket();
    await s.fire('connect');
    disconnectSocket();
    expect(s.disconnect).toHaveBeenCalled();
    expect(getSocket()).toBeNull();
    expect(getStatus()).toBe('offline');
  });
});

describe('subscriptions', () => {
  it('emits subscribe once per channel (ref-counted) and unsubscribe when the last user leaves', async () => {
    connectSocket();
    const s = lastSocket();
    await s.fire('connect');
    const offA = subscribe(['entities', 'dashboard']);
    const offB = subscribe(['entities']);
    expect(s.sent('subscribe')).toEqual([{ channels: ['entities', 'dashboard'] }]);
    offA();
    expect(s.sent('unsubscribe')).toEqual([{ channels: ['dashboard'] }]);
    offB();
    expect(s.sent('unsubscribe')).toEqual([{ channels: ['dashboard'] }, { channels: ['entities'] }]);
  });

  it('calling the unsubscribe function twice does not release a channel someone else holds', async () => {
    connectSocket();
    const s = lastSocket();
    await s.fire('connect');
    const offA = subscribe(['entities']);
    subscribe(['entities']);
    offA();
    offA();
    expect(s.sent('unsubscribe')).toEqual([]);
  });

  it('queues channels requested before the connection and joins them on connect', async () => {
    subscribe(['moderation']);
    connectSocket();
    const s = lastSocket();
    expect(s.sent('subscribe')).toEqual([]);
    await s.fire('connect');
    expect(s.sent('subscribe')).toEqual([{ channels: ['moderation'] }]);
  });

  it('re-subscribes to every active channel after a reconnect', async () => {
    connectSocket();
    const s = lastSocket();
    await s.fire('connect');
    subscribe(['entities']);
    subscribe(['jobs']);
    await s.fire('disconnect', 'transport close');
    await s.fire('connect');
    expect(s.sent('subscribe').at(-1)).toEqual({ channels: ['entities', 'jobs'] });
  });
});

describe('auth', () => {
  it('on TOKEN_EXPIRED at connect: refreshes, then connects again with the new token', async () => {
    server.use(http.post(url('/v1/admin/auth/refresh'), () => ok({ ...mockSession(), accessToken: 'fresh' })));
    connectSocket();
    const s = lastSocket();
    await s.fire('connect_error', Object.assign(new Error('unauthorized'), { data: { code: 'TOKEN_EXPIRED' } }));
    expect(s.connect).toHaveBeenCalledTimes(1);
    expect(s.handshake()).toEqual({ token: 'fresh' });
  });

  it('on TOKEN_INVALID (new signing key after a server restart): refreshes once, then connects again', async () => {
    server.use(http.post(url('/v1/admin/auth/refresh'), () => ok({ ...mockSession(), accessToken: 'fresh' })));
    connectSocket();
    const s = lastSocket();
    const invalid = () => Object.assign(new Error('unauthorized'), { data: { code: 'TOKEN_INVALID' } });
    await s.fire('connect_error', invalid());
    expect(s.connect).toHaveBeenCalledTimes(1);
    expect(s.handshake()).toEqual({ token: 'fresh' });
    // the fresh token is refused too: no second refresh until a connect has worked
    await s.fire('connect_error', invalid());
    expect(s.connect).toHaveBeenCalledTimes(1);
    await s.fire('connect');
    await s.fire('connect_error', invalid());
    expect(s.connect).toHaveBeenCalledTimes(2);
  });

  it('on TOKEN_EXPIRED with a dead session: does not loop', async () => {
    server.use(http.post(url('/v1/admin/auth/refresh'), () => fail(401, 'AUTH_REQUIRED')));
    connectSocket();
    const s = lastSocket();
    await s.fire('connect_error', Object.assign(new Error('unauthorized'), { data: { code: 'TOKEN_EXPIRED' } }));
    expect(s.connect).not.toHaveBeenCalled();
    expect(auth.token).toBeNull();
  });

  it('on auth:expiring: refreshes and sends auth:refresh with the new token', async () => {
    server.use(http.post(url('/v1/admin/auth/refresh'), () => ok({ ...mockSession(), accessToken: 'fresh' })));
    connectSocket();
    const s = lastSocket();
    await s.fire('connect');
    await s.fire('auth:expiring', { exp: 1 });
    expect(s.sent('auth:refresh')).toEqual([{ token: 'fresh' }]);
  });

  it('on force:logout: drops the token and closes the socket', async () => {
    connectSocket();
    const s = lastSocket();
    await s.fire('connect');
    await s.fire('force:logout', { reason: 'role_changed' });
    expect(auth.token).toBeNull();
    expect(s.disconnect).toHaveBeenCalled();
    expect(getStatus()).toBe('offline');
  });
});
