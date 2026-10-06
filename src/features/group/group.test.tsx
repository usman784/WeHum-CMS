import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disconnectSocket } from '../../lib/socket';
import { daily } from '../../mocks/daily';
import { connectFakeSocket, findToast, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { dayLabel, groupProblem } from './api';

vi.mock('socket.io-client', async () => ({ io: (await import('../../test/fake-socket')).fakeIo }));
afterEach(() => disconnectSocket());

const user = userEvent.setup();
const time = () => screen.getByLabelText(/Start time/);

describe('group helpers', () => {
  it('dayLabel names the UTC day; groupProblem checks the time', () => {
    expect(dayLabel('2026-10-05')).toBe('Mon, Oct 5');
    expect(groupProblem({ startUtc: '16:00', lengthMin: 30, lobbyOpenMin: 15, reminderMin: 10 })).toBeNull();
    expect(groupProblem({ startUtc: '', lengthMin: 30, lobbyOpenMin: 15, reminderMin: 10 })).toMatch(/hours and minutes/);
  });
});

describe('Group meditation screen', () => {
  it('shows the start time with local times, the lobby settings and the history; passes the a11y check', async () => {
    openApp('/group-meditation');
    expect(await h1('Group meditation')).toBeInTheDocument();
    await waitFor(() => expect(time()).toHaveValue('16:00'));
    expect(screen.getByLabelText('Length used for the group start')).toHaveValue('30');
    const local = within(screen.getByRole('list', { name: 'Local times' }));
    expect(local.getByText('Berlin')).toBeInTheDocument();
    expect(local.getByText('Sydney')).toBeInTheDocument();
    expect(screen.getByLabelText('Open the lobby before the start')).toHaveValue('15');
    expect(screen.getByLabelText('Reminder before the start')).toHaveValue('10');
    const history = within(screen.getByRole('list', { name: 'Group history' })).getAllByRole('listitem');
    expect(history).toHaveLength(3);
    expect(history[0]).toHaveTextContent('486 meditated');
    expect(history[0]).toHaveTextContent('1,940');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled(); // nothing changed
    expect(await a11yViolations()).toEqual([]);
  });

  it('saving sends the whole value with the version and says so', async () => {
    openApp('/group-meditation');
    await waitFor(() => expect(time()).toHaveValue('16:00'));
    await user.clear(time());
    await user.type(time(), '18:30');
    await user.selectOptions(screen.getByLabelText('Length used for the group start'), '45');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await findToast('Group meditation saved')).toBeInTheDocument();
    expect(daily.group).toMatchObject({ version: 2, value: { startUtc: '18:30', lengthMin: 45, lobbyOpenMin: 15, reminderMin: 10 } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('an empty time cannot be saved', async () => {
    openApp('/group-meditation');
    await waitFor(() => expect(time()).toHaveValue('16:00'));
    await user.clear(time());
    expect(await screen.findByText('Enter the start time as hours and minutes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('409: someone saved first → both versions are shown; "Keep my changes" keeps their other settings', async () => {
    openApp('/group-meditation');
    await waitFor(() => expect(time()).toHaveValue('16:00'));
    await user.selectOptions(screen.getByLabelText('Length used for the group start'), '10');
    // someone else changes the lobby and the length meanwhile
    daily.group = { ...daily.group, version: 2, value: { ...daily.group.value, lobbyOpenMin: 20, lengthMin: 45 } };
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'This was changed while you were editing' });
    const rows = within(dialog)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent);
    expect(rows).toEqual(['Length used for the group start45 min10 min']); // only what I changed is in conflict
    expect(daily.group.value.lengthMin).toBe(45); // nothing overwritten yet
    await user.click(within(dialog).getByRole('button', { name: 'Keep my changes' }));
    await waitFor(() => expect(daily.group).toMatchObject({ version: 3, value: { lengthMin: 10, lobbyOpenMin: 20 } }));
  });

  it('a save by someone else shows at once and says who', async () => {
    const { emit } = await connectFakeSocket();
    openApp('/group-meditation');
    await waitFor(() => expect(time()).toHaveValue('16:00'));
    daily.group = { ...daily.group, version: 2, value: { ...daily.group.value, startUtc: '09:15' } };
    await emit('entity:changed', { type: 'config', id: 'group', op: 'update', version: 2, by: { id: 'other-admin', name: 'Demo Editor' } });
    expect(await screen.findByText(/Demo Editor saved new group settings/)).toBeInTheDocument();
    await waitFor(() => expect(time()).toHaveValue('09:15'), { timeout: 3000 });
  });
});
