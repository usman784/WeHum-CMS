import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disconnectSocket } from '../../lib/socket';
import { beta } from '../../mocks/beta';
import { connectFakeSocket, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';

vi.mock('socket.io-client', async () => ({ io: (await import('../../test/fake-socket')).fakeIo }));
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => disconnectSocket());

const table = () => screen.findByRole('table', { name: 'Beta testers' });
const dialog = () => screen.findByRole('dialog');

describe('Beta Testers', () => {
  it('lists test accounts with access, account state and presence kept apart; summary cards; passes the a11y check', async () => {
    openApp('/beta-testers');
    expect(await h1('Beta Testers')).toBeInTheDocument();
    const t = await table();
    await within(t).findByText('beta001');
    expect(within(t).getAllByText('Beta premium')).toHaveLength(2);
    expect(within(t).getAllByText('Free')).toHaveLength(2);
    expect(within(t).getByText('Suspended')).toBeInTheDocument();
    expect(within(t).getByText('Online now')).toBeInTheDocument();
    const cards = screen.getByLabelText('Summary');
    expect(within(cards).getByText('Test accounts').parentElement).toHaveTextContent('4');
    expect(within(cards).getByText('Suspended').parentElement).toHaveTextContent('1');
    expect(within(cards).getByText(/Not added to the others/)).toBeInTheDocument();
    expect(await a11yViolations()).toEqual([]);
  });

  it('search goes to the server', async () => {
    openApp('/beta-testers');
    const t = await table();
    await within(t).findByText('beta001');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search test accounts' }), 'beta003');
    await waitFor(() => expect(within(t).queryByText('beta001')).not.toBeInTheDocument());
    expect(within(t).getByText('beta003')).toBeInTheDocument();
  });

  it('ticking rows shows the count and the scope; a filter change clears the selection', async () => {
    openApp('/beta-testers');
    const t = await table();
    await within(t).findByText('beta001');
    await userEvent.click(within(t).getAllByRole('checkbox')[1]!);
    const sel = await screen.findByRole('region', { name: 'Selection' });
    expect(sel).toHaveTextContent('1 selected on this page');
    await userEvent.selectOptions(screen.getByLabelText('Account state'), 'suspended');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Selection' })).not.toBeInTheDocument());
  });

  it('bulk grant sends the explicit ids and shows the finished job', async () => {
    openApp('/beta-testers');
    const t = await table();
    await within(t).findByText('beta003');
    await userEvent.click(within(t).getAllByRole('checkbox')[3]!); // beta003
    await userEvent.click(within(await screen.findByRole('region', { name: 'Selection' })).getByRole('button', { name: 'Grant beta premium' }));
    const d = await dialog();
    expect(within(d).getByText(/Their open apps update within seconds/)).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: 'Grant beta premium' }));
    const panel = await screen.findByTestId('job-panel');
    await within(panel).findByText('Finished');
    expect(beta.calls.find((c) => c.path === '/bulk')?.body).toMatchObject({ action: 'grant', selection: { ids: [expect.stringContaining('0198b000')] }, params: { days: 30 }, expectedCount: 1 });
  });

  it('a failed account is listed and only it is retried', async () => {
    openApp('/beta-testers');
    const t = await table();
    await within(t).findByText('beta003');
    await userEvent.click(within(t).getAllByRole('checkbox')[3]!);
    await userEvent.click(within(await screen.findByRole('region', { name: 'Selection' })).getByRole('button', { name: 'Suspend' }));
    await userEvent.click(within(await dialog()).getByRole('button', { name: 'Suspend' }));
    const panel = await screen.findByTestId('job-panel');
    expect(await within(panel).findByText(/beta003: Try again/)).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Retry failed accounts' }));
    await within(panel).findByText('Finished');
  });

  it('delete shows the exact scope and protected accounts, and needs the typed phrase', async () => {
    openApp('/beta-testers');
    const t = await table();
    await within(t).findByText('beta001');
    await userEvent.click(within(t).getAllByRole('checkbox')[1]!);
    await userEvent.click(within(await screen.findByRole('region', { name: 'Selection' })).getByRole('button', { name: 'Delete' }));
    const d = await dialog();
    const review = await within(d).findByTestId('delete-review');
    expect(review).toHaveTextContent('3 of 4 selected accounts will be deleted: Beta Round 1 (3)');
    expect(review).toHaveTextContent('beta004: Has a paid store subscription');
    const go = within(d).getByRole('button', { name: 'Delete' });
    expect(go).toBeDisabled();
    expect(within(d).getByRole('button', { name: 'Suspend instead' })).toBeEnabled();
    await userEvent.type(within(d).getByLabelText(/Type DELETE Beta Round 1/), 'DELETE Beta Round 1');
    expect(go).toBeEnabled();
    await userEvent.click(go);
    await screen.findByTestId('job-panel');
    expect(beta.calls.find((c) => c.path === '/bulk')?.body).toMatchObject({ action: 'delete', params: { confirm: 'DELETE Beta Round 1' } });
  });

  it('creating accounts reviews the counts and the password style before anything is made', async () => {
    openApp('/beta-testers');
    await table();
    await userEvent.click(await screen.findByRole('button', { name: 'Create accounts' }));
    const d = await dialog();
    expect(within(d).getAllByText(/Username \+ we/).length).toBeGreaterThan(0);
    await userEvent.click(within(d).getByRole('button', { name: 'Review' }));
    const review = await within(d).findByTestId('generate-review');
    expect(review).toHaveTextContent('150 accounts in Beta Round 1: 100 with beta premium');
    expect(review).toHaveTextContent('beta001 → password beta001we');
    expect(beta.calls).toHaveLength(0); // nothing created yet
    await userEvent.click(within(d).getByRole('button', { name: 'Create 150 accounts' }));
    await screen.findByTestId('job-panel');
    expect(beta.calls[0]?.body).toMatchObject({ count: 150, prefix: 'beta', access: 'mixed', premiumCount: 100, freeCount: 50, premiumDays: 30 });
  });

  it('manage: grant, then reset password shows the new one once', async () => {
    openApp('/beta-testers');
    const t = await table();
    await userEvent.click(await within(t).findByRole('button', { name: 'Manage beta003' }));
    const d = await dialog();
    await userEvent.click(within(d).getByRole('button', { name: 'Grant beta premium' }));
    await screen.findByText('Beta premium granted'); // the open dialog hides the toast region from role queries
    await userEvent.click(within(d).getByRole('button', { name: 'Reset password' }));
    expect(await within(d).findByText(/Zx81QpLm20aBcd/)).toBeInTheDocument();
    expect(beta.calls.map((c) => (c.body as { action: string }).action)).toEqual(['grant', 'reset_password']);
  });

  it('a read-only role can look but not change', async () => {
    openApp('/beta-testers', 'editor');
    const t = await table();
    await within(t).findByText('beta001');
    expect(screen.queryByRole('button', { name: 'Create accounts' })).not.toBeInTheDocument();
    expect(within(t).queryAllByRole('checkbox')).toHaveLength(0);
    await userEvent.click(within(t).getByRole('button', { name: 'Manage beta001' }));
    expect(within(await dialog()).getByText(/can look at test accounts but not change them/)).toBeInTheDocument();
  });

  it('paused live updates are announced', async () => {
    openApp('/beta-testers');
    await table();
    expect(await screen.findByText(/Live updates are paused/)).toBeInTheDocument(); // no socket connected in this test
  });

  it('a live change of a test account refreshes the list', async () => {
    const live = await connectFakeSocket();
    openApp('/beta-testers');
    const t = await table();
    await within(t).findByText('beta003');
    beta.rows[2]!.access = { source: 'beta', paidExpiresAt: null, betaExpiresAt: new Date(Date.now() + 86_400_000).toISOString(), label: 'Beta premium' };
    await live.emit('entity:changed', { type: 'user', id: beta.rows[2]!.id, op: 'update', version: 0, by: null });
    await waitFor(() => expect(within(t).getAllByText('Beta premium')).toHaveLength(3), { timeout: 4000 });
  });
});
