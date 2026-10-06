import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { compact, deltaText } from './api';

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
});

const tile = (label: string) => screen.getByText(label, { selector: 'span' }).parentElement!;

describe('Analytics', () => {
  it('KPIs, meditations per day, funnel, retention, themes and countries; passes the a11y check', async () => {
    openApp('/analytics');
    expect(await h1('Analytics')).toBeInTheDocument();
    await screen.findByText('Active users');
    expect(tile('Active users')).toHaveTextContent('8,940');
    expect(tile('Active users')).toHaveTextContent('+9% vs prior');
    expect(tile('Meditations')).toHaveTextContent('39.9k');
    expect(tile('Minutes meditated')).toHaveTextContent('512k');
    expect(tile('Avg length')).toHaveTextContent('12.8 min');
    expect(tile('Avg length')).toHaveTextContent('−0.4 min vs prior');
    expect(within(screen.getByRole('list', { name: 'Meditations per day' })).getAllByRole('listitem')).toHaveLength(14);
    const funnel = await screen.findByRole('list', { name: 'Conversion funnel' });
    expect(funnel).toHaveTextContent('Finished first meditation (beta focus)');
    expect(funnel).toHaveTextContent('4.7%');
    expect(await screen.findByRole('list', { name: 'Retention' })).toHaveTextContent('58%');
    expect(screen.getByRole('list', { name: 'Minutes by theme' })).toHaveTextContent('Sleep');
    expect(screen.getByRole('list', { name: 'Meditators by country' })).toHaveTextContent('Germany');
    expect(await a11yViolations()).toEqual([]);
  });

  it('period switch goes into the address and loads that many days', async () => {
    const { router } = openApp('/analytics');
    await screen.findByText('Active users');
    await userEvent.click(screen.getByRole('radio', { name: '30 days' }));
    await waitFor(() =>
      expect(within(screen.getByRole('list', { name: 'Meditations per day' })).getAllByRole('listitem')).toHaveLength(30),
    );
    expect(router.state.location.search).toBe('?period=30');
  });

  it('a day shows its numbers on hover and on keyboard focus; the table view lists them', async () => {
    openApp('/analytics?period=7');
    const bars = within(await screen.findByRole('list', { name: 'Meditations per day' })).getAllByRole('button');
    fireEvent.mouseEnter(bars[0]!);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/meditations/);
    bars[1]!.focus();
    expect(screen.getByRole('tooltip')).toHaveTextContent(/solo · \d+ group/);
    await userEvent.click(screen.getByRole('button', { name: 'Show table' }));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(8);
  });

  it('Export CSV downloads the period', async () => {
    openApp('/analytics');
    await userEvent.click(await screen.findByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  });

  it('a moderator has no Analytics screen', async () => {
    openApp('/analytics', 'moderator');
    expect(await screen.findByText('No permission')).toBeInTheDocument();
  });
});

describe('analytics helpers', () => {
  it('compact numbers and the "vs prior" line', () => {
    expect(compact(8940)).toBe('8,940');
    expect(compact(39_900)).toBe('39.9k');
    expect(compact(512_000)).toBe('512k');
    expect(compact(null)).toBe('—');
    expect(deltaText({ value: 110, previous: 100, deltaPct: 10 })).toBe('+10% vs prior');
    expect(deltaText({ value: 90, previous: 100, deltaPct: -10 })).toBe('−10% vs prior');
    expect(deltaText({ value: 12.8, previous: 13.2, deltaPct: -3 }, 'min')).toBe('−0.4 min vs prior');
    expect(deltaText({ value: 5, previous: 0, deltaPct: null })).toBe('No data for the prior period');
  });
});
