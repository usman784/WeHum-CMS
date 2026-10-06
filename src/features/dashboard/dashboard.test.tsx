import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disconnectSocket } from '../../lib/socket';
import { connectFakeSocket, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { overview } from '../../mocks/overview';

vi.mock('socket.io-client', async () => ({ io: (await import('../../test/fake-socket')).fakeIo }));
afterEach(() => disconnectSocket());

const tile = (label: string) => screen.getByText(label, { selector: 'span' }).parentElement!;

describe('Dashboard', () => {
  it('shows the live numbers, the week of messages, top sessions, what needs attention and the next group; passes the a11y check', async () => {
    openApp('/');
    expect(await h1('Dashboard')).toBeInTheDocument();
    expect(await screen.findByText('Meditating right now')).toBeInTheDocument();
    expect(tile('Meditating right now')).toHaveTextContent('214');
    expect(tile('Meditating right now')).toHaveTextContent('Across 3 countries');
    expect(tile('Meditations today')).toHaveTextContent('3,180');
    expect(tile('Meditations today')).toHaveTextContent('+12.0% vs last');
    expect(tile('Paying members')).toHaveTextContent('600');
    expect(tile('Paying members')).toHaveTextContent('112 in trial · $3,904 / month');
    expect(tile('Library')).toHaveTextContent('142');
    const week = within(screen.getByRole('list', { name: 'Daily messages this week' })).getAllByRole('listitem');
    expect(week).toHaveLength(7);
    expect(week[0]).toHaveTextContent('Live');
    expect(week[6]).toHaveTextContent('No message yet');
    expect(week[6]).toHaveTextContent('Missing');
    const top = screen.getByRole('table');
    expect(within(top).getByText('Steady Under Pressure')).toBeInTheDocument();
    expect(within(top).getByRole('progressbar', { name: 'Steady Under Pressure completion' })).toHaveAttribute('aria-valuenow', '82');
    const need = within(screen.getByRole('list', { name: 'Needs attention' }));
    expect(need.getByRole('link', { name: /7 dedications need review/ })).toHaveAttribute('href', '/moderation');
    expect(need.getByRole('link', { name: /45-min version missing/ })).toHaveAttribute('href', '/today');
    expect(need.getByRole('link', { name: /Daily Message is missing/ })).toHaveAttribute('href', '/daily-messages');
    expect(need.getByRole('link', { name: /Founding 1,000: 412 taken/ })).toHaveAttribute('href', '/subscriptions');
    expect(screen.getByText('The Midday Coherence')).toBeInTheDocument();
    expect(await a11yViolations()).toEqual([]);
  });

  it('live: the socket changes the numbers without a reload and keeps the rest of the page', async () => {
    const { emit } = await connectFakeSocket();
    openApp('/');
    await screen.findByText('Meditating right now');
    await emit('live:agg', { total: 305, countries: 5, top: [], quiet: false, meditatedToday: 3200, vibration: 40 });
    await waitFor(() => expect(tile('Meditating right now')).toHaveTextContent('305'));
    expect(tile('Meditating right now')).toHaveTextContent('Across 5 countries');
    await emit('dashboard:kpis', {
      liveNow: 310,
      meditationsToday: 3300,
      minutesToday: 40000,
      payingMembers: 601,
      inTrial: 110,
      mrrUsd: 3950,
      founding: { taken: 413, cap: 1000, open: true },
      moderationOpen: 9,
      at: Date.now(),
    });
    await waitFor(() => expect(tile('Paying members')).toHaveTextContent('601'));
    expect(tile('Meditations today')).toHaveTextContent('3,300');
    expect(tile('Library')).toHaveTextContent('142'); // not in the socket message: kept
    expect(screen.getByRole('link', { name: /9 dedications need review/ })).toBeInTheDocument();
    await emit('moderation:count', { open: 1 });
    expect(await screen.findByRole('link', { name: /1 dedication needs review/ })).toBeInTheDocument();
  });

  it('nothing needs attention: says so', async () => {
    overview.dashboard.needsAttention = [];
    openApp('/');
    expect(await screen.findByText('Nothing needs you right now.')).toBeInTheDocument();
  });

  it('a moderator sees only the moderation numbers', async () => {
    openApp('/', 'moderator');
    expect(await screen.findByRole('link', { name: /7 dedications need review/ })).toBeInTheDocument();
    expect(screen.queryByText('Meditating right now')).not.toBeInTheDocument();
    expect(screen.queryByText('Top sessions, last 7 days')).not.toBeInTheDocument();
  });
});
