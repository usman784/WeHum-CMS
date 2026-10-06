import { act, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Providers } from '../app/providers';
import { routes } from '../app/router';
import { auth } from '../lib/api';
import { createQueryClient } from '../lib/query';
import type { Role } from '../lib/rbac';
import { session } from '../lib/session';
import { connectSocket } from '../lib/socket';
import { mockAdmin } from '../mocks/handlers';
import { lastSocket, sockets } from './fake-socket';

/** Render the whole app at a route as a signed-in admin (default: owner). Returns the router. */
export function openApp(path: string, role: Role = 'owner') {
  auth.set('tok-test');
  session.signIn(mockAdmin(role));
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <Providers client={createQueryClient()}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { router, ...view };
}

export const h1 = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name }, { timeout: 4000 });

/**
 * For files that mock `socket.io-client` with `fakeIo`: connect the fake socket, so server events can be played
 * with `emit('entity:changed', …)`. Call before `openApp`.
 */
export async function connectFakeSocket() {
  sockets.length = 0;
  auth.set('tok-test');
  connectSocket();
  await lastSocket().fire('connect');
  return {
    socket: lastSocket(),
    emit: (event: string, payload: unknown) => act(() => lastSocket().fire(event, payload)),
  };
}

/** A toast with this text (and not the same word somewhere else on the page, e.g. a status column). */
export const findToast = async (text: string | RegExp) =>
  within(await screen.findByRole('region', { name: /Notifications/ })).findByText(text);
