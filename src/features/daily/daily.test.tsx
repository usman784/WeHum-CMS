import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disconnectSocket } from '../../lib/socket';
import { daily, resetDaily } from '../../mocks/daily';
import { connectFakeSocket, findToast, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { addDays, addMonths, dayState, daysWithoutMessage, messageBlocker, monthGrid, monthLabel, type DailyMessage } from './api';

vi.mock('socket.io-client', async () => ({ io: (await import('../../test/fake-socket')).fakeIo }));

// A fixed "today" in the middle of a month (Wednesday), so the calendar looks the same on every day the tests run.
const TODAY = '2026-10-14';
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
  resetDaily();
});
afterEach(() => {
  disconnectSocket();
  vi.useRealTimers();
});

const user = userEvent.setup();
const cell = (name: RegExp | string) => screen.findByRole('button', { name });
const editor = (date: string) => screen.findByRole('complementary', { name: new RegExp(`Message for ${date}`) });
const msg = (date: string) => daily.messages.find((m) => m.date === date)!;

describe('daily message helpers', () => {
  it('monthGrid: whole weeks, Monday first', () => {
    const grid = monthGrid('2026-10');
    expect(grid[0]).toBe('2026-09-28'); // Oct 1 is a Thursday
    expect(grid.at(-1)).toBe('2026-11-01');
    expect(grid).toHaveLength(35);
    expect(monthGrid('2026-06')[0]).toBe('2026-06-01'); // starts on a Monday: no lead-in days
    expect(monthGrid('2026-02').at(-1)).toBe('2026-03-01');
  });

  it('months: add across the year, label', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthLabel('2026-10')).toBe('October 2026');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('dayState: live today, published, scheduled, draft; "missing" only for the coming week', () => {
    const m = (status: DailyMessage['status']) => ({ status }) as DailyMessage;
    expect(dayState(TODAY, m('live'), TODAY).label).toBe('Live');
    expect(dayState('2026-10-13', m('live'), TODAY).label).toBe('Published');
    expect(dayState('2026-10-15', m('scheduled'), TODAY).label).toBe('Scheduled');
    expect(dayState('2026-10-16', m('draft'), TODAY).label).toBe('Draft');
    expect(dayState('2026-10-14', undefined, TODAY).key).toBe('missing');
    expect(dayState('2026-10-20', undefined, TODAY).key).toBe('missing');
    expect(dayState('2026-10-21', undefined, TODAY).key).toBe('empty');
    expect(dayState('2026-10-10', undefined, TODAY).key).toBe('empty'); // the past is just history
  });

  it('daysWithoutMessage: a draft does not count, scheduled and live do', () => {
    const by = new Map<string, DailyMessage>([
      ['2026-10-14', { status: 'live' } as DailyMessage],
      ['2026-10-15', { status: 'scheduled' } as DailyMessage],
      ['2026-10-16', { status: 'draft' } as DailyMessage],
    ]);
    expect(daysWithoutMessage(by, TODAY)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20']);
  });

  it('messageBlocker: title, text or file first', () => {
    const ok = { type: 'text' as const, title: 'Hi', text: 'Hello', mediaId: null };
    expect(messageBlocker(ok, false)).toBeNull();
    expect(messageBlocker({ ...ok, title: ' ' }, false)).toBe('Enter a title first.');
    expect(messageBlocker({ ...ok, text: ' ' }, false)).toBe('Write the text first.');
    expect(messageBlocker({ ...ok, type: 'audio' }, false)).toBe('Upload the audio file first.');
    expect(messageBlocker({ ...ok, type: 'video', mediaId: 'm' }, true)).toMatch(/Wait until/);
    expect(messageBlocker({ ...ok, type: 'audio', mediaId: 'm' }, false)).toBeNull();
  });
});

describe('Daily messages screen', () => {
  it('shows the month with the state of every day and the missing days; passes the a11y check', async () => {
    openApp('/daily-messages');
    expect(await h1('Daily Messages')).toBeInTheDocument();
    expect(await screen.findByText('October 2026')).toBeInTheDocument();
    expect(await cell(/^Mon, Oct 12, published/)).toBeInTheDocument();
    expect(await cell(/^Tue, Oct 13, published, Quiet Power/)).toBeInTheDocument();
    expect(await cell(/^Wed, Oct 14, live, Releasing Cognitive Friction/)).toBeInTheDocument();
    expect(await cell(/^Thu, Oct 15, scheduled, Dissolving Defensiveness/)).toBeInTheDocument();
    expect(await cell(/^Fri, Oct 16, draft, End-of-Week Grounding/)).toBeInTheDocument();
    expect(await cell(/^Sat, Oct 17, missing$/)).toBeInTheDocument();
    expect(screen.getByText(/5 of the next 7 days have/)).toHaveTextContent('no message the app can show');
    // today is selected at first
    expect(await editor('Wed, Oct 14')).toHaveTextContent('Published, shown in the app');
    expect(await a11yViolations()).toEqual([]);
  });

  it('month buttons load the other month', async () => {
    openApp('/daily-messages');
    await screen.findByText('October 2026');
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(await screen.findByText('November 2026')).toBeInTheDocument();
    expect(await cell(/^Sun, Nov 1$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(await screen.findByText('September 2026')).toBeInTheDocument();
  });

  it('a missing day: save a draft, then schedule it; scheduling needs the content first', async () => {
    openApp('/daily-messages');
    await user.click(await cell(/^Sat, Oct 17, missing$/));
    const panel = await editor('Sat, Oct 17');
    await user.click(within(panel).getByRole('radio', { name: 'Text' }));
    await user.click(within(panel).getByRole('button', { name: 'Schedule' }));
    expect(await within(panel).findByText('Enter a title')).toBeInTheDocument();
    expect(msg('2026-10-17')).toBeUndefined();

    await user.type(within(panel).getByLabelText('Title'), 'Notice the pause');
    await user.click(within(panel).getByRole('button', { name: 'Schedule' }));
    expect(await findToast('Write the text first.')).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Save draft' }));
    expect(await findToast('Saved')).toBeInTheDocument();
    expect(msg('2026-10-17')).toMatchObject({ title: 'Notice the pause', status: 'draft', type: 'text', version: 1 });
    expect(await cell(/^Sat, Oct 17, draft, Notice the pause/)).toBeInTheDocument();

    await user.type(within(panel).getByLabelText('Text'), 'Between two breaths there is a gap.');
    await user.type(within(panel).getByPlaceholderText('New theme'), 'Pacing');
    await user.click(within(panel).getByRole('button', { name: '+ Add theme' }));
    await user.click(within(panel).getByRole('button', { name: 'Schedule' }));
    expect(await findToast('Scheduled for Sat, Oct 17')).toBeInTheDocument();
    expect(msg('2026-10-17')).toMatchObject({
      status: 'scheduled',
      text: 'Between two breaths there is a gap.',
      themeTag: 'Pacing',
      version: 2,
    });
    expect(await cell(/^Sat, Oct 17, scheduled/)).toBeInTheDocument();
  });

  it('an audio message cannot go live without its file', async () => {
    openApp('/daily-messages');
    await user.click(await cell(/^Sat, Oct 17, missing$/));
    const panel = await editor('Sat, Oct 17');
    await user.type(within(panel).getByLabelText('Title'), 'Evening exhale');
    await user.click(within(panel).getByRole('button', { name: 'Schedule' }));
    expect(await findToast('Upload the audio file first.')).toBeInTheDocument();
    expect(msg('2026-10-17')).toBeUndefined();
  });

  it('today has no "Schedule": a message for today or the past is published now', async () => {
    daily.messages = daily.messages.filter((m) => m.date !== TODAY);
    openApp('/daily-messages');
    const panel = await editor('Wed, Oct 14');
    expect(within(panel).queryByRole('button', { name: 'Schedule' })).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('radio', { name: 'Text' }));
    await user.type(within(panel).getByLabelText('Title'), 'Right now');
    await user.type(within(panel).getByLabelText('Text'), 'Here.');
    await user.click(within(panel).getByRole('button', { name: 'Publish now' }));
    expect(await findToast('Published')).toBeInTheDocument();
    expect(msg(TODAY)).toMatchObject({ status: 'live', title: 'Right now' });
  });

  it('a live message: edit and save keeps it live; "Back to draft" takes it out of the app', async () => {
    openApp('/daily-messages');
    await user.click(await cell(/^Tue, Oct 13, published/));
    const panel = await editor('Tue, Oct 13');
    const save = within(panel).getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    await user.type(within(panel).getByLabelText('Title'), ' (v2)');
    await user.click(save);
    expect(await findToast('Saved')).toBeInTheDocument();
    expect(msg('2026-10-13')).toMatchObject({ title: 'Quiet Power: Settling the Inner Rush (v2)', status: 'live', version: 2 });
    await user.click(within(panel).getByRole('button', { name: 'Back to draft' }));
    await waitFor(() => expect(msg('2026-10-13').status).toBe('draft'));
  });

  it('delete asks first; copy to another day makes a draft and never replaces a message', async () => {
    openApp('/daily-messages');
    await user.click(await cell(/^Thu, Oct 15, scheduled/));
    const panel = await editor('Thu, Oct 15');
    await user.click(within(panel).getByRole('button', { name: 'Copy to another day' }));
    const copy = await screen.findByRole('dialog', { name: 'Copy to another day' });
    await user.clear(within(copy).getByLabelText('Day'));
    await user.type(within(copy).getByLabelText('Day'), '2026-10-16'); // that day has a draft already
    await user.click(within(copy).getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Fri, Oct 16 already has a message.')).toBeInTheDocument(); // the dialog hides the toast region from roles
    expect(msg('2026-10-16').title).toBe('End-of-Week Grounding');
    await user.clear(within(copy).getByLabelText('Day'));
    await user.type(within(copy).getByLabelText('Day'), '2026-10-18');
    await user.click(within(copy).getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Copied to Sun, Oct 18 as a draft')).toBeInTheDocument();
    expect(msg('2026-10-18')).toMatchObject({ title: 'Dissolving Defensiveness', status: 'draft', version: 1 });

    const copied = await editor('Sun, Oct 18');
    await user.click(within(copied).getByRole('button', { name: 'Delete this message' }));
    const confirm = await screen.findByRole('dialog', { name: /Delete the message for Sun, Oct 18/ });
    expect(msg('2026-10-18')).toBeDefined(); // nothing happens before the answer
    await user.click(within(confirm).getByRole('button', { name: 'Delete message' }));
    expect(await findToast('Message deleted')).toBeInTheDocument();
    expect(daily.messages.some((m) => m.date === '2026-10-18')).toBe(false);
  });

  it('409: someone else saved the day first → both versions, nothing overwritten, "Keep my changes" saves on top', async () => {
    openApp('/daily-messages');
    await user.click(await cell(/^Fri, Oct 16, draft/));
    const panel = await editor('Fri, Oct 16');
    await user.clear(within(panel).getByLabelText('Title'));
    await user.type(within(panel).getByLabelText('Title'), 'My title');
    Object.assign(msg('2026-10-16'), { title: 'Their title', version: 2 });
    await user.click(within(panel).getByRole('button', { name: 'Save draft' }));
    const dialog = await screen.findByRole('dialog', { name: 'This was changed while you were editing' });
    expect(within(dialog).getByRole('row', { name: /Title/ })).toHaveTextContent('Their titleMy title');
    expect(msg('2026-10-16').title).toBe('Their title');
    await user.click(within(dialog).getByRole('button', { name: 'Keep my changes' }));
    await waitFor(() => expect(msg('2026-10-16')).toMatchObject({ title: 'My title', version: 3 }));
  });

  it('someone else saves the open day: a warning appears and my edits stay until I choose', async () => {
    const { emit } = await connectFakeSocket();
    openApp('/daily-messages');
    await user.click(await cell(/^Fri, Oct 16, draft/));
    const panel = await editor('Fri, Oct 16');
    await user.type(within(panel).getByLabelText('Title'), '!');
    Object.assign(msg('2026-10-16'), { title: 'Their title', version: 2 });
    await emit('entity:changed', {
      type: 'dailyMessage',
      id: '2026-10-16',
      op: 'update',
      version: 2,
      by: { id: 'x', name: 'Demo Editor' },
    });
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Demo Editor saved it');
    expect(within(panel).getByLabelText('Title')).toHaveValue('End-of-Week Grounding!');
    await user.click(within(panel).getByRole('button', { name: 'Reload their version' }));
    await waitFor(() => expect(within(panel).getByLabelText('Title')).toHaveValue('Their title'));
  });

  it('a moderator has no daily messages screen', async () => {
    openApp('/daily-messages', 'moderator');
    expect(await screen.findByText('No permission')).toBeInTheDocument();
  });
});
