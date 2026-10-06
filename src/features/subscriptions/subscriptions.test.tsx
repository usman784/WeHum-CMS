import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audience } from '../../mocks/audience';
import { disconnectSocket } from '../../lib/socket';
import { connectFakeSocket, findToast, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { eventLine, planName, priceLabel } from './api';

vi.mock('socket.io-client', async () => ({ io: (await import('../../test/fake-socket')).fakeIo }));
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => disconnectSocket());

const tile = (label: string) => screen.getByText(label, { selector: 'span' }).parentElement!;
const card = (title: string) => screen.getByRole('heading', { name: title }).closest('section')!;

describe('Subscriptions', () => {
  it('shows the KPIs, the Founding counter, plans, members and the latest events; passes the a11y check', async () => {
    openApp('/subscriptions');
    expect(await h1('Subscriptions')).toBeInTheDocument();
    await screen.findByText('Paying members');
    expect(tile('Paying members')).toHaveTextContent('600');
    expect(tile('Paying members')).toHaveTextContent('Founding 412 · Annual 0 · Monthly 188');
    expect(tile('In free trial')).toHaveTextContent('112');
    expect(tile('Monthly revenue')).toHaveTextContent('$3,904');
    expect(tile('Trial → paid')).toHaveTextContent('46%');
    expect(tile('Cancelled')).toHaveTextContent('2 with a payment problem');

    const founding = screen.getByRole('region', { name: /Founding 1,000/ });
    expect(founding).toHaveTextContent('412');
    expect(founding).toHaveTextContent('the app shows “588 spots left”');
    expect(founding).toHaveTextContent('$79/year');
    expect(within(founding).getByRole('progressbar', { name: 'Founding spots taken' })).toHaveAttribute('aria-valuenow', '41');

    const plans = card('Plans');
    expect(within(plans).getByText('wehum_annual_founding')).toBeInTheDocument();
    expect(within(plans).getByText('$9.99 / month')).toBeInTheDocument();
    expect(within(plans).getByText('Yes · pre-selected')).toBeInTheDocument();
    expect(within(plans).getByText('After the offer')).toBeInTheDocument();

    const members = await screen.findByRole('list', { name: 'Members' });
    expect(within(members).getByRole('link', { name: /Marcus Vance/ })).toHaveAttribute('href', expect.stringMatching(/^\/users\//));
    const events = screen.getByRole('list', { name: 'Latest subscription events' });
    expect(events).toHaveTextContent('Started free trial');
    expect(events).toHaveTextContent('Payment problem');
    expect(await a11yViolations()).toEqual([]);
  });

  it('member tabs filter the list on the server', async () => {
    openApp('/subscriptions');
    const members = await screen.findByRole('list', { name: 'Members' });
    expect(within(members).getAllByRole('listitem')).toHaveLength(3);
    await userEvent.click(screen.getByRole('radio', { name: 'Trial' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Members' })).getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByRole('list', { name: 'Members' })).toHaveTextContent('Aiko T.');
  });

  it('"End offer now" asks first, closes the offer and shows it ended', async () => {
    openApp('/subscriptions');
    await userEvent.click(await screen.findByRole('button', { name: 'End offer now' }));
    const dialog = screen.getByRole('dialog', { name: 'End the Founding offer now?' });
    expect(dialog).toHaveTextContent('The 412 Founding members keep their price');
    await userEvent.click(within(dialog).getByRole('button', { name: 'End offer' }));
    expect(await findToast('Founding offer ended')).toBeInTheDocument();
    expect(audience.calls).toContainEqual({ method: 'POST', path: '/offers/founding/close' });
    await waitFor(() => expect(screen.getByRole('region', { name: /Founding 1,000/ })).toHaveTextContent('Ended'));
    expect(screen.queryByRole('button', { name: 'End offer now' })).not.toBeInTheDocument();
  });

  it('an editor sees the numbers but cannot end the offer or export', async () => {
    openApp('/subscriptions', 'editor');
    await screen.findByText('Paying members');
    expect(screen.queryByRole('button', { name: 'End offer now' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
  });

  it('a moderator has no Subscriptions screen', async () => {
    openApp('/subscriptions', 'moderator');
    expect(await screen.findByText('No permission')).toBeInTheDocument();
  });

  it('Export CSV downloads the members file', async () => {
    openApp('/subscriptions');
    await userEvent.click(await screen.findByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  });

  it('live: a subscription event re-reads the screen', async () => {
    const { emit } = await connectFakeSocket();
    openApp('/subscriptions');
    await screen.findByText('Paying members');
    audience.summary = { ...audience.summary, inTrial: 113 };
    audience.events = [
      {
        id: 'e9',
        type: 'INITIAL_PURCHASE',
        userId: null,
        name: 'Nina',
        email: null,
        productId: 'wehum_monthly',
        periodType: 'normal',
        priceUsd: 9.99,
        eventAt: new Date().toISOString(),
      },
      ...audience.events,
    ];
    await emit('subs:event', { event: {} });
    await waitFor(() => expect(tile('In free trial')).toHaveTextContent('113'));
    expect(await screen.findByText('New monthly member')).toBeInTheDocument();
  });
});

describe('subscriptions helpers', () => {
  it('names plans and prices like the design', () => {
    expect(planName('wehum_annual_founding')).toBe('Annual · Founding');
    expect(planName('wehum_annual')).toBe('Annual');
    expect(planName('wehum_monthly')).toBe('Monthly');
    expect(planName(null)).toBe('—');
    expect(priceLabel('wehum_annual', 79)).toBe('$79 / year');
    expect(priceLabel('wehum_monthly', 9.99)).toBe('$9.99 / month');
    expect(priceLabel('x', null)).toBe('—');
  });

  it('turns RevenueCat events into feed lines', () => {
    const e = { id: '1', userId: null, name: null, email: null, productId: 'wehum_monthly', priceUsd: 1, eventAt: '' };
    expect(eventLine({ ...e, type: 'INITIAL_PURCHASE', periodType: 'trial' }).title).toBe('Started free trial');
    expect(eventLine({ ...e, type: 'RENEWAL', periodType: 'normal' }).title).toBe('Paid renewal');
    expect(eventLine({ ...e, type: 'BILLING_ISSUE', periodType: 'normal' })).toEqual({ title: 'Payment problem', tone: 'warning' });
    expect(eventLine({ ...e, type: 'CANCELLATION', periodType: 'normal' }).title).toBe('Auto-renew turned off');
    expect(eventLine({ ...e, type: 'SOMETHING_NEW', periodType: null }).title).toBe('something new');
  });
});
