import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { community } from '../../mocks/community';
import { disconnectSocket } from '../../lib/socket';
import { connectFakeSocket, findToast, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { draftProblems, EMPTY_DRAFT } from './api';

vi.mock('socket.io-client', async () => ({ io: (await import('../../test/fake-socket')).fakeIo }));
afterEach(() => disconnectSocket());

const preview = () => screen.getByRole('complementary', { name: 'App preview' });

async function write(title: string, message: string) {
  await userEvent.type(await screen.findByRole('textbox', { name: /^Title/ }), title);
  await userEvent.type(screen.getByRole('textbox', { name: /^Message/ }), message);
}

describe('Push notifications', () => {
  it('composer, live preview, audience count, automatic list and history; passes the a11y check', async () => {
    openApp('/notifications');
    expect(await h1('Push Notifications')).toBeInTheDocument();
    await write('The 21-Day Resilience Arc', 'Twenty minutes a day.');
    expect(preview()).toHaveTextContent('The 21-Day Resilience Arc');
    expect(preview()).toHaveTextContent('Twenty minutes a day.');
    expect(await screen.findByText('14,820 people with push on')).toBeInTheDocument();
    expect(await screen.findByRole('switch', { name: 'Daily nudge' })).toBeChecked();
    const history = screen.getByRole('list', { name: 'Announcements' });
    expect(history).toHaveTextContent('New: 7-Day Autonomic Reset');
    expect(history).toHaveTextContent('18% opened');
    expect(within(history).getByText('Scheduled')).toBeInTheDocument();
    expect(await a11yViolations()).toEqual([]);
  });

  it('empty or too long fields block the send and say why', async () => {
    openApp('/notifications');
    await userEvent.click(await screen.findByRole('button', { name: 'Send now' }));
    expect(screen.getByText('Write a title')).toBeInTheDocument();
    expect(screen.getByText('Write the message')).toBeInTheDocument();
    expect(community.calls).toEqual([]);
  });

  it('send now: asks first, creates the draft and sends it', async () => {
    openApp('/notifications');
    await write('Big news', 'Something real happened.');
    await userEvent.click(screen.getByRole('button', { name: 'Send now' }));
    const dialog = screen.getByRole('dialog', { name: 'Send this now?' });
    expect(dialog).toHaveTextContent('(14,820 people)');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send now' }));
    expect(await findToast('Sending')).toBeInTheDocument();
    expect(community.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /notifications', 'POST /notifications/n11/send']);
    expect(community.calls[0]!.body).toMatchObject({
      title: 'Big news',
      body: 'Something real happened.',
      audience: 'all',
      sendMode: 'now',
    });
  });

  it('quiet hours: a send now warns how many get it at 07:00', async () => {
    community.audience = { targeted: 500, quiet: 120 };
    openApp('/notifications');
    expect(await screen.findByText(/120 of them are in quiet hours \(22:00–07:00 their time\) and get it at 07:00/)).toBeInTheDocument();
  });

  it('scheduled needs a future time; then "Schedule"', async () => {
    openApp('/notifications');
    await write('Retreat', 'Join us in spring.');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'When' }), 'scheduled');
    await userEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(screen.getByText('Pick a time')).toBeInTheDocument();
    const at = new Date(Date.now() + 2 * 86_400_000);
    const local = new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await userEvent.type(screen.getByLabelText(/Send at/), local);
    await userEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Schedule' }));
    expect(await findToast('Scheduled')).toBeInTheDocument();
    expect(community.calls[0]!.body).toMatchObject({ sendMode: 'scheduled', sendAt: expect.any(String) });
  });

  it('audience "some countries" asks for codes; opens a chosen session', async () => {
    openApp('/notifications');
    await write('Hallo', 'Für euch.');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Audience' }), 'country');
    await userEvent.type(screen.getByRole('textbox', { name: /Countries/ }), 'de, at');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Opens' }), 'wehum://today');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await findToast('Draft saved')).toBeInTheDocument();
    expect(community.calls[0]!.body).toMatchObject({ audience: 'country', countries: ['DE', 'AT'], deepLink: 'wehum://today' });
  });

  it('?audience=founding (from Subscriptions) preselects Founding members', async () => {
    openApp('/notifications?new=1&audience=founding');
    expect(await screen.findByRole('combobox', { name: 'Audience' })).toHaveValue('founding');
  });

  it('send test to me goes to the admin’s own email', async () => {
    openApp('/notifications');
    await write('Test', 'Just me.');
    await userEvent.click(screen.getByRole('button', { name: 'Send test to me' }));
    expect(await findToast('Test sent')).toBeInTheDocument();
    expect(community.calls.find((c) => c.path.endsWith('/test'))!.body).toEqual({ email: 'raphael@wehum.app' });
  });

  it('edit a draft from the history, and cancel a scheduled one', async () => {
    openApp('/notifications');
    const history = await screen.findByRole('list', { name: 'Announcements' });
    await userEvent.click(within(history).getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveValue('Draft idea');
    expect(screen.getByRole('heading', { name: 'Edit announcement' })).toBeInTheDocument();
    await userEvent.click(within(history).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel announcement' }));
    expect(await findToast('Cancelled')).toBeInTheDocument();
    expect(community.calls).toContainEqual({ method: 'POST', path: '/notifications/n2/cancel' });
  });

  it('automatic: an owner turns one off', async () => {
    openApp('/notifications');
    await userEvent.click(await screen.findByRole('switch', { name: 'Trial ends in 2 days' }));
    expect(await findToast('Trial ends in 2 days off')).toBeInTheDocument();
    expect(community.calls).toContainEqual({ method: 'PATCH', path: '/notifications/automatic/trial_ending', body: { enabled: false } });
  });

  it('an editor drafts but cannot send or change automatic ones', async () => {
    openApp('/notifications', 'editor');
    await screen.findByRole('textbox', { name: /^Title/ });
    expect(screen.queryByRole('button', { name: 'Send now' })).not.toBeInTheDocument();
    expect(screen.getByText('An owner or admin sends it.')).toBeInTheDocument();
    expect(await screen.findByRole('switch', { name: 'Daily nudge' })).toBeDisabled();
  });

  it('live: delivery numbers update without a reload', async () => {
    const { emit } = await connectFakeSocket();
    openApp('/notifications');
    const history = await screen.findByRole('list', { name: 'Announcements' });
    await emit('notification:stats', { id: 'n1', delivered: 14210, opened: 4263, failed: 3 });
    await waitFor(() => expect(history).toHaveTextContent('30% opened'));
  });
});

describe('draft checks', () => {
  it('match the API rules', () => {
    expect(draftProblems({ ...EMPTY_DRAFT, title: 'x'.repeat(51), body: 'ok' }).title).toBe('At most 50 characters');
    expect(draftProblems({ ...EMPTY_DRAFT, title: 'a', body: 'b', audience: 'country' }).countries).toBe('Choose at least one country');
    expect(draftProblems({ ...EMPTY_DRAFT, title: 'a', body: 'b', sendMode: 'scheduled', sendAt: new Date().toISOString() }).sendAt).toBe(
      'Pick a time in the future',
    );
    expect(draftProblems({ ...EMPTY_DRAFT, title: 'a', body: 'b', deepLink: 'session' }).deepLink).toBe('Choose the session');
    expect(draftProblems({ ...EMPTY_DRAFT, title: 'a', body: 'b' })).toEqual({});
  });
});
