import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { comingSoon } from '../../mocks/comingsoon';
import { community } from '../../mocks/community';
import { insights } from '../../mocks/insights';
import { disconnectSocket } from '../../lib/socket';
import { connectFakeSocket, findToast, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { reasonChips } from './api';

vi.mock('socket.io-client', async () => ({ io: (await import('../../test/fake-socket')).fakeIo }));
afterEach(() => disconnectSocket());

const posts = () => screen.findByRole('list', { name: 'Posts' });
const card = (title: string) => screen.getByRole('heading', { name: title }).closest('section')!;

describe('Moderation', () => {
  it('shows the review queue with crisis first, reason chips, today and the rules; passes the a11y check', async () => {
    openApp('/moderation');
    expect(await h1('Dedications & gratitude')).toBeInTheDocument();
    const items = within(await posts()).getAllByRole('listitem');
    expect(items).toHaveLength(3); // flagged ×2 + reported-and-auto-hidden; the visible one is not in review
    expect(items[0]).toHaveTextContent('Sam');
    expect(items[0]).toHaveTextContent('Auto · crisis words');
    expect(items[0]).toHaveTextContent('SoS screen was shown to the writer');
    expect(screen.getByText('Reported ×2 · spam')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Needs review · 3' })).toBeChecked();
    expect(card('Today')).toHaveTextContent('612');
    expect(await screen.findByRole('switch', { name: 'Block links and handles' })).toBeChecked();
    expect(await a11yViolations()).toEqual([]);
  });

  it('hide and keep a post; the queue updates', async () => {
    openApp('/moderation');
    const marcus = within(await posts()).getByRole('listitem', { name: 'Post by Marcus' });
    await userEvent.click(within(marcus).getByRole('button', { name: 'Hide post' }));
    expect(await findToast('Post hidden')).toBeInTheDocument();
    expect(community.calls).toContainEqual({ method: 'POST', path: '/moderation/p2/hide' });
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Post by Marcus' })).not.toBeInTheDocument());
    const sam = screen.getByRole('listitem', { name: 'Post by Sam' });
    await userEvent.click(within(sam).getByRole('button', { name: 'Keep' }));
    expect(await findToast('Post kept')).toBeInTheDocument();
    expect(community.calls).toContainEqual({ method: 'POST', path: '/moderation/p4/keep' });
  });

  it('bulk: select two posts and hide them at once', async () => {
    openApp('/moderation');
    await posts();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select the post by Sam' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select the post by Marcus' }));
    const bar = screen.getByRole('region', { name: 'Bulk actions' });
    expect(bar).toHaveTextContent('2 selected');
    await userEvent.click(within(bar).getByRole('button', { name: 'Hide all' }));
    expect(await findToast('2 hidden')).toBeInTheDocument();
    expect(community.calls).toContainEqual({ method: 'POST', path: '/moderation/bulk', body: { action: 'hide', ids: ['p4', 'p2'] } });
  });

  it('mute the writer from a post', async () => {
    openApp('/moderation');
    const elena = within(await posts()).getByRole('listitem', { name: 'Post by Elena' });
    await userEvent.click(within(elena).getByRole('button', { name: 'Mute user' }));
    expect(await findToast('Elena is muted')).toBeInTheDocument();
  });

  it('filters: all posts, hidden, and by session', async () => {
    openApp('/moderation');
    await posts();
    await userEvent.click(screen.getByRole('radio', { name: 'All posts' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Posts' })).getAllByRole('listitem')).toHaveLength(4));
    await userEvent.click(screen.getByRole('radio', { name: 'Hidden' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Posts' })).getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Show again' })).toBeInTheDocument();
  });

  it('rules: an owner changes and saves them', async () => {
    openApp('/moderation');
    const links = await screen.findByRole('switch', { name: 'Block links and handles' });
    await userEvent.click(links);
    const words = screen.getByRole('textbox', { name: /Crisis words/ });
    await userEvent.clear(words);
    await userEvent.type(words, 'end it, hopeless');
    await userEvent.tab();
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(await findToast('Rules saved')).toBeInTheDocument();
    expect(community.rules.value).toMatchObject({ blockLinks: false, crisisWords: ['end it', 'hopeless'] });
  });

  it('rules: someone saved first → the 409 dialog; "Keep my changes" puts mine on top', async () => {
    openApp('/moderation');
    await userEvent.click(await screen.findByRole('switch', { name: 'Profanity filter' }));
    community.rules = { ...community.rules, version: 4, value: { ...community.rules.value, dailyLimit: 5 } };
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    const dialog = await screen.findByRole('dialog', { name: 'This was changed while you were editing' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep my changes' }));
    await waitFor(() => expect(community.rules.value).toMatchObject({ profanity: false, dailyLimit: 5 }));
  });

  it('a moderator works the queue but cannot change the rules', async () => {
    openApp('/moderation', 'moderator');
    await posts();
    expect(await screen.findByRole('switch', { name: 'Profanity filter' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save rules' })).not.toBeInTheDocument();
  });

  it('an editor has no moderation screen', async () => {
    openApp('/moderation', 'editor');
    expect(await screen.findByText('No permission')).toBeInTheDocument();
  });

  it('live: a new post re-reads the queue', async () => {
    const { emit } = await connectFakeSocket();
    openApp('/moderation');
    await posts();
    community.posts.push({ ...community.posts[2]!, id: 'p9', firstName: 'Nina', createdAt: new Date().toISOString() });
    await emit('moderation:new', { dedication: {}, flags: ['profanity'] });
    expect(await screen.findByRole('listitem', { name: 'Post by Nina' })).toBeInTheDocument();
  });

  it('gratitude tab: flag off → banner, the queue still works; hide a post', async () => {
    openApp('/moderation');
    await userEvent.click(await screen.findByRole('tab', { name: 'Gratitude feed' }));
    expect(await screen.findByText(/The gratitude feed is switched off in the app/)).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Posts' });
    const hannah = within(list).getByRole('listitem', { name: 'Post by Hannah' });
    expect(hannah).toHaveTextContent('Gratitude');
    expect(hannah).toHaveTextContent('Reported ×3 · spam');
    expect(hannah).toHaveTextContent('Shared in the feed');
    await userEvent.click(within(hannah).getByRole('button', { name: 'Show again' }));
    expect(await findToast('Post kept')).toBeInTheDocument();
    expect(comingSoon.calls).toContainEqual({ method: 'POST', path: '/gratitude/g1/keep' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Feed' }), 'affirmation');
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Posts' })).getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByRole('listitem', { name: 'Post by Lukas' })).toBeInTheDocument();
  });

  it('gratitude tab: flag on → no banner', async () => {
    insights.main = { ...insights.main, value: { ...insights.main.value, features: { ...insights.main.value.features, gratitude: true } } };
    openApp('/moderation');
    await userEvent.click(await screen.findByRole('tab', { name: 'Gratitude feed' }));
    await screen.findByRole('list', { name: 'Posts' });
    expect(screen.queryByText(/The gratitude feed is switched off/)).not.toBeInTheDocument();
  });
});

describe('reason chips', () => {
  it('reports first, then what the rules found', () => {
    expect(reasonChips({ reportCount: 2, reasons: ['spam', 'personal_info'], autoFlags: ['crisis'] })).toEqual([
      { text: 'Reported ×2 · spam, personal info', tone: 'ember' },
      { text: 'Auto · crisis words', tone: 'teal' },
    ]);
    expect(reasonChips({ reportCount: 0, reasons: [], autoFlags: [] })).toEqual([]);
  });
});
