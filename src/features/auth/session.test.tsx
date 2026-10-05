import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '../../app/providers';
import { routes } from '../../app/router';
import { auth } from '../../lib/api';
import { createQueryClient, queryClient } from '../../lib/query';
import { session } from '../../lib/session';
import { getSocket } from '../../lib/socket';
import { mockAdmin, ok, url } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { lastSocket, sockets } from '../../test/fake-socket';
import { installSessionEffects } from './effects';
import { IDLE_LIMIT_MS, IDLE_WARNING_MS, useIdleTimeout } from './hooks/useIdleTimeout';

vi.mock('socket.io-client', async () => ({ io: (await import('../../test/fake-socket')).fakeIo }));

const MIN = 60_000;

describe('useIdleTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (onTimeout = vi.fn()) => ({
    onTimeout,
    ...renderHook(({ enabled }) => useIdleTimeout({ enabled, onTimeout, limitMs: 10 * MIN, warningMs: 2 * MIN }), {
      initialProps: { enabled: true },
    }),
  });

  it('defaults follow the spec: 12 hours, warning 5 minutes before', () => {
    expect(IDLE_LIMIT_MS).toBe(12 * 60 * MIN);
    expect(IDLE_WARNING_MS).toBe(5 * MIN);
  });

  it('warns before the limit with a countdown, then times out once', () => {
    const { result, onTimeout } = setup();
    act(() => void vi.advanceTimersByTime(8 * MIN - 1000));
    expect(result.current.secondsLeft).toBeNull();
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.secondsLeft).toBe(120);
    act(() => void vi.advanceTimersByTime(30_000));
    expect(result.current.secondsLeft).toBe(90);
    expect(onTimeout).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(90_000 + 5000));
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('any input before the warning restarts the clock', () => {
    const { result, onTimeout } = setup();
    act(() => void vi.advanceTimersByTime(7 * MIN));
    fireEvent.keyDown(window, { key: 'a' });
    act(() => void vi.advanceTimersByTime(7 * MIN));
    expect(result.current.secondsLeft).toBeNull();
    fireEvent.pointerDown(window);
    act(() => void vi.advanceTimersByTime(7 * MIN));
    expect(result.current.secondsLeft).toBeNull();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('once the warning shows, only stay() keeps the session (a stray key press does not)', () => {
    const { result, onTimeout } = setup();
    act(() => void vi.advanceTimersByTime(9 * MIN));
    expect(result.current.secondsLeft).toBe(60);
    fireEvent.keyDown(window, { key: 'a' });
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.secondsLeft).toBe(59);
    act(() => result.current.stay());
    expect(result.current.secondsLeft).toBeNull();
    act(() => void vi.advanceTimersByTime(7 * MIN));
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('uses clock time, so a sleeping laptop still times out on wake', () => {
    const { onTimeout } = setup();
    vi.setSystemTime(Date.now() + 3 * 60 * MIN); // lid closed for 3 hours: timers did not run
    act(() => void vi.advanceTimersByTime(1000));
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled, and stops when turned off', () => {
    const onTimeout = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useIdleTimeout({ enabled, onTimeout, limitMs: 10 * MIN, warningMs: 2 * MIN }), {
      initialProps: { enabled: false },
    });
    act(() => void vi.advanceTimersByTime(20 * MIN));
    expect(onTimeout).not.toHaveBeenCalled();
    rerender({ enabled: true });
    act(() => void vi.advanceTimersByTime(5 * MIN));
    rerender({ enabled: false });
    act(() => void vi.advanceTimersByTime(20 * MIN));
    expect(onTimeout).not.toHaveBeenCalled();
  });
});

describe('idle warning in the shell', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the dialog at 11 h 55 min, "Stay signed in" keeps the session and pings the server; at 12 h it signs out with the reason', async () => {
    let refreshed = 0;
    server.use(
      http.post(url('/v1/admin/auth/refresh'), () => {
        refreshed += 1;
        return ok({ accessToken: 'fresh', expiresIn: 600, csrfToken: 'c', admin: mockAdmin('owner') });
      }),
      http.post(url('/v1/admin/auth/logout'), () => new HttpResponse(null, { status: 204 })),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    session.signIn(mockAdmin('owner'));
    auth.set('tok-1');
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(
      <Providers client={createQueryClient()}>
        <RouterProvider router={router} />
      </Providers>,
    );
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

    act(() => void vi.advanceTimersByTime(IDLE_LIMIT_MS - IDLE_WARNING_MS));
    const dialog = await screen.findByRole('dialog', { name: 'Are you still there?' });
    expect(dialog).toHaveTextContent('Signing out in 5:00');
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('timer')).toHaveTextContent('4:00');

    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }));
    await vi.waitFor(() => expect(refreshed).toBe(1));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(session.state.status).toBe('signedIn');

    act(() => void vi.advanceTimersByTime(IDLE_LIMIT_MS + 2000));
    await vi.waitFor(() => expect(session.state).toMatchObject({ status: 'signedOut', reason: 'idle' }));
    expect(await screen.findByText('You were signed out after 12 hours without activity.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });
});

describe('session effects', () => {
  let remove: () => void;
  beforeEach(() => {
    sockets.length = 0;
    session.signOut();
    remove = installSessionEffects();
  });
  afterEach(() => {
    act(() => session.signOut()); // while the effects are still installed, so the socket is closed too
    remove();
  });

  it('the socket connects only after sign-in and closes on sign-out; cached data goes with the admin', () => {
    expect(getSocket()).toBeNull();
    auth.set('tok-1');
    session.signIn(mockAdmin('owner'));
    expect(sockets).toHaveLength(1);
    expect(lastSocket().handshake()).toEqual({ token: 'tok-1' });
    queryClient.setQueryData(['user', 'list', {}], [{ id: 'u1' }]);

    session.expire(); // re-login dialog: keep the socket and the data on screen
    expect(getSocket()).not.toBeNull();
    expect(queryClient.getQueryData(['user', 'list', {}])).toBeDefined();

    session.signOut('user');
    expect(lastSocket().disconnect).toHaveBeenCalled();
    expect(getSocket()).toBeNull();
    expect(queryClient.getQueryData(['user', 'list', {}])).toBeUndefined();
  });

  it('force:logout from the server signs out with the "access changed" reason', async () => {
    auth.set('tok-1');
    session.signIn(mockAdmin('editor'));
    await lastSocket().fire('connect');
    await lastSocket().fire('force:logout', { reason: 'role_changed' });
    expect(session.state).toEqual({ status: 'signedOut', admin: null, reason: 'forced' });
    expect(auth.token).toBeNull();
    expect(getSocket()).toBeNull();
  });

  it('my role changed (entity:changed admin, my id): /me is read again and the sidebar follows at once', async () => {
    auth.set('tok-1');
    session.signIn(mockAdmin('editor'));
    render(
      <Providers client={createQueryClient()}>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />
      </Providers>,
    );
    const nav = await screen.findByRole('navigation', { name: 'CMS navigation' });
    expect(nav).not.toHaveTextContent('Settings');
    server.use(http.get(url('/v1/admin/me'), () => ok({ ...mockAdmin('editor'), role: 'admin' })));

    // someone else's change: ignored
    await act(() => lastSocket().fire('entity:changed', { type: 'admin', id: 'another-admin', op: 'update', version: 2, by: null }));
    expect(nav).not.toHaveTextContent('Settings');

    await act(() => lastSocket().fire('entity:changed', { type: 'admin', id: mockAdmin('editor').id, op: 'update', version: 2, by: null }));
    expect(await screen.findByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(session.admin?.role).toBe('admin');
  });

  it('moderation:count updates the sidebar badge live', async () => {
    auth.set('tok-1');
    session.signIn(mockAdmin('moderator'));
    render(
      <Providers client={createQueryClient()}>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />
      </Providers>,
    );
    const link = await screen.findByRole('link', { name: 'Dedications & gratitude' });
    await act(() => lastSocket().fire('moderation:count', { open: 7 }));
    expect(link).toHaveTextContent('7 to review');
    await act(() => lastSocket().fire('moderation:count', { open: 0 }));
    expect(link).not.toHaveTextContent('to review');
  });
});
