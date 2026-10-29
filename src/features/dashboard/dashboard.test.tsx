import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('Online now: a tile and a world map shaded by country, switchable to meditating, live from the socket', async () => {
    const { emit } = await connectFakeSocket();
    openApp('/');
    await screen.findByText('Meditating right now');
    expect(tile('Online now')).toHaveTextContent('486');
    expect(tile('Online now')).toHaveTextContent('131 guests · 6 countries');
    const map = await screen.findByTestId('world-map');
    const country = (c: string) => map.querySelector(`[data-country="${c}"]`)!;
    expect(country('US')).toHaveAttribute('data-n', '210');
    expect(country('FR')).not.toHaveAttribute('data-n'); // nobody there
    expect(country('US').textContent).toBe('United States · 210 online');
    expect(within(screen.getByRole('list', { name: 'People online by country' })).getAllByRole('listitem')[0]).toHaveTextContent(
      'United States',
    );
    await emit('dashboard:kpis', {
      liveNow: 214,
      meditationsToday: 3180,
      minutesToday: 1,
      payingMembers: 600,
      inTrial: 112,
      mrrUsd: 3904,
      founding: { taken: 412, cap: 1000, open: true },
      moderationOpen: 7,
      onlineNow: 3,
      onlineGuests: 1,
      onlineCountries: [{ c: 'FR', n: 3 }],
      at: Date.now(),
    });
    await waitFor(() => expect(tile('Online now')).toHaveTextContent('3'));
    expect(country('FR')).toHaveAttribute('data-n', '3');
    expect(country('US')).not.toHaveAttribute('data-n');
    await userEvent.click(screen.getByRole('radio', { name: /Meditating/ }));
    expect(country('US')).toHaveAttribute('data-n', '120');
    expect(screen.getByRole('list', { name: 'People meditating by country' })).toHaveTextContent('Germany');
    await emit('live:agg', { total: 9, countries: 1, top: [{ c: 'PK', n: 9 }], quiet: true, meditatedToday: 1, vibration: 1 });
    await waitFor(() => expect(country('PK')).toHaveAttribute('data-n', '9'));
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

  it('Silence Room right now: where its people are meditating, by country, updated live from the socket', async () => {
    const { emit } = await connectFakeSocket();
    openApp('/');
    const list = await screen.findByRole('list', { name: 'Silence Room by country' });
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('United Kingdom');
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('5');
    expect(screen.getByText('12 meditating')).toBeInTheDocument();
    await emit('dashboard:kpis', {
      liveNow: 310,
      meditationsToday: 3300,
      minutesToday: 40000,
      payingMembers: 601,
      inTrial: 110,
      mrrUsd: 3950,
      founding: { taken: 413, cap: 1000, open: true },
      moderationOpen: 9,
      silenceNow: 3,
      silenceCountries: [{ c: 'PK', n: 3 }],
      at: Date.now(),
    });
    await waitFor(() => expect(screen.getByText('3 meditating')).toBeInTheDocument());
    const rows = within(screen.getByRole('list', { name: 'Silence Room by country' })).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Pakistan');
    await emit('dashboard:kpis', {
      liveNow: 0,
      meditationsToday: 0,
      minutesToday: 0,
      payingMembers: 601,
      inTrial: 110,
      mrrUsd: 3950,
      founding: { taken: 413, cap: 1000, open: true },
      moderationOpen: 9,
      silenceNow: 0,
      silenceCountries: [],
      at: Date.now(),
    });
    expect(await screen.findByText('No one is meditating in silence right now.')).toBeInTheDocument();
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
