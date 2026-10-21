import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disconnectSocket } from '../../lib/socket';
import { daily } from '../../mocks/daily';
import { connectFakeSocket, findToast, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { dayLabel, groupProblem, sitHours, withDefaults } from './api';

vi.mock('socket.io-client', async () => ({ io: (await import('../../test/fake-socket')).fakeIo }));
afterEach(() => disconnectSocket());

const user = userEvent.setup();
const time = () => screen.getByLabelText(/Start time/);

describe('group helpers', () => {
  it('dayLabel names the UTC day; groupProblem checks the time', () => {
    expect(dayLabel('2026-10-05')).toBe('Mon, Oct 5');
    expect(groupProblem(withDefaults({ startUtc: '16:00', lengthMin: 30, lobbyOpenMin: 15, reminderMin: 10 }))).toBeNull();
    expect(groupProblem(withDefaults({ startUtc: '', lengthMin: 30, lobbyOpenMin: 15, reminderMin: 10 }))).toMatch(/hours and minutes/);
  });
});

describe('group and global helpers', () => {
  it('sitHours lists the group sits through the day for a first hour, a last hour and a step', () => {
    expect(sitHours({ fromHourUtc: 0, toHourUtc: 23, lengthMin: 30, stepHours: 4 })).toEqual([
      '00:00',
      '04:00',
      '08:00',
      '12:00',
      '16:00',
      '20:00',
    ]);
    expect(sitHours({ fromHourUtc: 6, toHourUtc: 22, lengthMin: 10, stepHours: 4 })).toEqual(['06:00', '10:00', '14:00', '18:00', '22:00']);
    expect(sitHours({ fromHourUtc: 6, toHourUtc: 8, lengthMin: 10, stepHours: 1 })).toEqual(['06:00', '07:00', '08:00']);
  });

  it('old values without a step stay hourly; the Global meditation defaults to Sunday 16:00 UTC', () => {
    const v = withDefaults({
      startUtc: '16:00',
      lengthMin: 30,
      lobbyOpenMin: 15,
      reminderMin: 10,
      cadence: 'hourly',
      hourly: { fromHourUtc: 6, toHourUtc: 22, lengthMin: 10 },
    } as never);
    expect(v.hourly.stepHours).toBe(1);
    expect(v.global).toMatchObject({ enabled: true, weekday: 0, startUtc: '16:00', lengthMin: 30 });
  });

  it('a Global meditation needs a valid time when it is on', () => {
    const v = withDefaults({ startUtc: '16:00', lengthMin: 30, lobbyOpenMin: 15, reminderMin: 10 });
    expect(groupProblem({ ...v, global: { ...v.global, startUtc: '' } })).toMatch(/Global meditation/);
    expect(groupProblem({ ...v, global: { ...v.global, enabled: false, startUtc: '' } })).toBeNull();
  });
});

describe('Group meditation screen', () => {
  it('shows the start time with local times, the lobby settings and the history; passes the a11y check', async () => {
    openApp('/group-meditation');
    expect(await h1('Group meditation')).toBeInTheDocument();
    await waitFor(() => expect(time()).toHaveValue('16:00'));
    expect(screen.getByLabelText('Length used for the group start')).toHaveValue('30');
    const local = within(screen.getAllByRole('list', { name: 'Local times' })[0]!);
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

  it('hourly sits: window, intentions and the focus card are saved with the rest', async () => {
    openApp('/group-meditation');
    await waitFor(() => expect(time()).toHaveValue('16:00'));
    await user.selectOptions(screen.getByLabelText('Group sits'), 'hourly');
    await user.selectOptions(screen.getByLabelText('First hour (UTC)'), '8');
    await user.selectOptions(screen.getByLabelText('Last hour (UTC)'), '20');
    await user.click(screen.getByRole('button', { name: 'Add an intention' }));
    await user.type(screen.getByLabelText('Intentions 4'), 'Gentle focus');
    await user.type(screen.getByLabelText("Today's focus: title"), 'The Midday Coherence Sit');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await findToast('Group meditation saved')).toBeInTheDocument();
    expect(daily.group.value).toMatchObject({
      cadence: 'hourly',
      hourly: { fromHourUtc: 8, toHourUtc: 20 },
      focus: { title: 'The Midday Coherence Sit' },
    });
    expect(daily.group.value.intentions).toContain('Gentle focus');
  });

  it('group sits every 4 hours: the step is chosen and the sit times are listed', async () => {
    openApp('/group-meditation');
    await waitFor(() => expect(time()).toHaveValue('16:00'));
    await user.selectOptions(screen.getByLabelText('Group sits'), 'hourly');
    await user.selectOptions(screen.getByLabelText('First hour (UTC)'), '0');
    await user.selectOptions(screen.getByLabelText('Last hour (UTC)'), '23');
    await user.selectOptions(screen.getByLabelText('Every'), '4');
    expect(screen.getByText(/00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await findToast('Group meditation saved')).toBeInTheDocument();
    expect(daily.group.value).toMatchObject({ cadence: 'hourly', hourly: { fromHourUtc: 0, toHourUtc: 23, stepHours: 4 } });
  });

  it('the Global meditation is its own thing: once a week, day and time set here, saved with the rest', async () => {
    openApp('/group-meditation');
    await waitFor(() => expect(time()).toHaveValue('16:00'));
    expect(screen.getByRole('heading', { name: 'Global meditation' })).toBeInTheDocument();
    expect(screen.getByLabelText('Day of the week')).toHaveValue('0'); // Sunday
    await user.selectOptions(screen.getByLabelText('Day of the week'), '6');
    const gt = screen.getByLabelText('Time of the Global meditation');
    await user.clear(gt);
    await user.type(gt, '18:30');
    await user.selectOptions(screen.getByLabelText('Global meditation length'), '45');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await findToast('Group meditation saved')).toBeInTheDocument();
    expect(daily.group.value).toMatchObject({ global: { enabled: true, weekday: 6, startUtc: '18:30', lengthMin: 45 }, startUtc: '16:00' });
  });

  it('switching the Global meditation off hides its settings and is saved', async () => {
    openApp('/group-meditation');
    await waitFor(() => expect(time()).toHaveValue('16:00'));
    await user.click(screen.getByRole('switch', { name: 'Global meditation' }));
    expect(screen.queryByLabelText('Day of the week')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await findToast('Group meditation saved')).toBeInTheDocument();
    expect(daily.group.value.global.enabled).toBe(false);
  });

  it('sits through the day: the once-a-day start time is not shown (it would not be used), and there is no dead "add start time" button', async () => {
    openApp('/group-meditation');
    await waitFor(() => expect(time()).toHaveValue('16:00'));
    expect(screen.queryByRole('button', { name: /Add another start time/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Group sits'), 'hourly');
    expect(screen.queryByRole('heading', { name: 'When the Meditation of the Day starts together' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Length used for the group start')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Group sits'), 'daily');
    expect(screen.getByRole('heading', { name: 'When the Meditation of the Day starts together' })).toBeInTheDocument();
  });

  it('an hourly window that ends before it starts cannot be saved', async () => {
    openApp('/group-meditation');
    await waitFor(() => expect(time()).toHaveValue('16:00'));
    await user.selectOptions(screen.getByLabelText('Group sits'), 'hourly');
    await user.selectOptions(screen.getByLabelText('First hour (UTC)'), '20');
    await user.selectOptions(screen.getByLabelText('Last hour (UTC)'), '8');
    expect(await screen.findByText('The last hour must not be before the first.')).toBeInTheDocument();
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
