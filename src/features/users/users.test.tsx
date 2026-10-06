import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audience } from '../../mocks/audience';
import { disconnectSocket } from '../../lib/socket';
import { connectFakeSocket, findToast, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { countryName, deleteConfirmText, userSubline } from './api';

vi.mock('socket.io-client', async () => ({ io: (await import('../../test/fake-socket')).fakeIo }));
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => disconnectSocket());

const MARCUS = '0198a1b2-0000-7000-8000-000000000001';
const AIKO = '0198a1b2-0000-7000-8000-000000000003';
const card = (title: string) => screen.getByRole('heading', { name: title }).closest('section')!;
const table = () => screen.findByRole('table', { name: 'Users' });

describe('Users', () => {
  it('lists people with membership, week, meditations, country and the counts; passes the a11y check', async () => {
    openApp('/users');
    expect(await h1('Users & Members')).toBeInTheDocument();
    const t = await table();
    await within(t).findByText('Marcus Vance');
    expect(within(t).getByText('marcus.v@gmail.com · Apple')).toBeInTheDocument();
    expect(within(t).getByText('Annual · Founding')).toBeInTheDocument();
    expect(within(t).getByText('Trial · day 4 of 7')).toBeInTheDocument();
    expect(within(t).getByText('Guest · no account yet', { exact: false })).toBeInTheDocument();
    expect(within(t).getByText('United Kingdom')).toBeInTheDocument();
    expect(screen.getByText(/4 people · 2 with an account · 2 guests · 2 paying · 1 in trial/)).toBeInTheDocument();
    expect(screen.getByText(/A guest/)).toBeInTheDocument();
    expect(await a11yViolations()).toEqual([]);
  });

  it('search and tabs go to the server and into the address', async () => {
    const { router } = openApp('/users');
    const t = await table();
    await within(t).findByText('Marcus Vance');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search users' }), 'elena');
    await waitFor(() => expect(within(t).queryByText('Marcus Vance')).not.toBeInTheDocument());
    expect(within(t).getByText('Elena K.')).toBeInTheDocument();
    expect(router.state.location.search).toContain('q=elena');
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search users' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Guests' }));
    await waitFor(() => expect(within(t).queryByText('Elena K.')).not.toBeInTheDocument());
    expect(within(t).getByText('Aiko T.')).toBeInTheDocument();
    expect(router.state.location.search).toContain('tab=guests');
  });

  it('nobody found → empty state with "Clear filters"', async () => {
    openApp('/users?q=zzz');
    expect(await screen.findByText('Nobody matches')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await within(await table()).findByText('Marcus Vance')).toBeInTheDocument();
  });

  it('live: new sign-ups show a "new people" button that reloads the list', async () => {
    const { emit } = await connectFakeSocket();
    openApp('/users');
    await within(await table()).findByText('Marcus Vance');
    await emit('users:new', { count: 2 });
    await userEvent.click(await screen.findByRole('button', { name: /2 new people/ }));
    expect(screen.queryByRole('button', { name: /new people/ })).not.toBeInTheDocument();
  });

  it('Export CSV downloads the current filter; editors do not see it', async () => {
    openApp('/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  });

  it('an editor can open the list but has no export', async () => {
    openApp('/users', 'editor');
    await within(await table()).findByText('Marcus Vance');
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
  });
});

describe('User detail', () => {
  it('shows header, tiles, meditations, dedications, membership and the data list; passes the a11y check', async () => {
    openApp(`/users/${MARCUS}`);
    expect(await h1('Marcus Vance')).toBeInTheDocument();
    expect(
      screen.getByText(/marcus\.v@gmail\.com · User ID 0198…001 · account saved with Apple \(was a guest for 3 days\) · iPhone/),
    ).toBeInTheDocument();
    expect(screen.getByText('Annual member')).toBeInTheDocument();
    expect(screen.getByText('5 days')).toBeInTheDocument();
    expect(screen.getByText('07:00')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Recent meditations' })).getByText('Steady Under Pressure')).toBeInTheDocument();
    expect(screen.getByText('“Dedicated to anyone navigating tough news today.”')).toBeInTheDocument();
    const m = card('Membership');
    expect(m).toHaveTextContent('Annual · Founding');
    expect(m).toHaveTextContent('App Store');
    expect(m).toHaveTextContent('Active · auto-renew on');
    expect(card('Data we collect')).toHaveTextContent('No payment card details');
    expect(await a11yViolations()).toEqual([]);
  });

  it('gift 30 days premium', async () => {
    openApp(`/users/${MARCUS}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Gift 30 days premium' }));
    expect(await findToast('30 days premium given')).toBeInTheDocument();
    expect(audience.calls).toContainEqual({ method: 'POST', path: `/users/${MARCUS}/gift`, body: { days: 30 } });
  });

  it('export data runs as a job and ends with download links', async () => {
    openApp(`/users/${MARCUS}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Export user data (JSON + CSV)' }));
    expect(await screen.findByRole('link', { name: 'Download JSON' }, { timeout: 6000 })).toHaveAttribute(
      'href',
      'https://cdn.test/export.json',
    );
    expect(screen.getByRole('link', { name: 'Download meditations CSV' })).toBeInTheDocument();
  });

  it('mute in the Together feed, and unmute', async () => {
    openApp(`/users/${MARCUS}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Mute in Together feed' }));
    expect(await findToast('Muted in the Together feed')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Unmute in Together feed' })).toBeInTheDocument();
    expect(screen.getByText('Muted')).toBeInTheDocument();
  });

  it('delete needs the email typed, warns about the store subscription, runs as a job and returns to the list', async () => {
    const { router } = openApp(`/users/${MARCUS}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete account and data' }));
    const dialog = screen.getByRole('dialog', { name: /Delete Marcus Vance/ });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('App Store subscription is not cancelled by this');
    const go = within(dialog).getByRole('button', { name: 'Delete account and data' });
    expect(go).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox'), 'marcus.v@gmail.com');
    await userEvent.click(go);
    expect(await findToast('Account and data deleted')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/users'));
    expect(audience.calls).toContainEqual({ method: 'DELETE', path: `/users/${MARCUS}`, body: { confirm: 'marcus.v@gmail.com' } });
  });

  it('a guest is deleted with the first 8 characters of the id', async () => {
    openApp(`/users/${AIKO}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete account and data' }));
    expect(screen.getByText(AIKO.slice(0, 8))).toBeInTheDocument();
  });

  it('an editor sees the person but no support actions', async () => {
    openApp(`/users/${MARCUS}`, 'editor');
    await h1('Marcus Vance');
    expect(screen.queryByRole('button', { name: 'Delete account and data' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gift 30 days premium' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Support actions' })).not.toBeInTheDocument();
  });

  it('an unknown or deleted user shows "no longer exists"', async () => {
    openApp('/users/0198a1b2-0000-7000-8000-00000000ffff');
    expect(await screen.findByText('This user no longer exists')).toBeInTheDocument();
  });

  it('live: deleted by another admin while open → banner', async () => {
    const { emit } = await connectFakeSocket();
    openApp(`/users/${MARCUS}`);
    await h1('Marcus Vance');
    await emit('entity:changed', { type: 'user', id: MARCUS, op: 'delete', version: 0, by: { id: 'x', name: 'Other' } });
    expect(await screen.findByText(/This user was just deleted by another admin/)).toBeInTheDocument();
  });
});

describe('users helpers', () => {
  it('words the user line, country and the delete confirmation', () => {
    expect(userSubline({ email: 'a@b.c', isGuest: false, providers: ['google', 'email'] })).toBe('a@b.c · Google · Email');
    expect(userSubline({ email: null, isGuest: true, providers: [] })).toBe('Guest · no account yet');
    expect(countryName('DE')).toBe('Germany');
    expect(countryName(null)).toBe('Worldwide');
    expect(deleteConfirmText({ id: 'abcdef1234', email: null })).toBe('abcdef12');
    expect(deleteConfirmText({ id: 'x', email: 'a@b.c' })).toBe('a@b.c');
  });
});
