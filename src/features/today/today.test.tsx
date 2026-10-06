import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disconnectSocket } from '../../lib/socket';
import { retryDelay } from '../../lib/upload';
import { db, finishProcessing } from '../../mocks/content';
import { daily, resetDaily } from '../../mocks/daily';
import { url } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { findToast, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { dayNote, missingLengths, weekDays, weekLabel, weekStart, type MotdDay } from './api';

vi.mock('socket.io-client', async () => ({ io: (await import('../../test/fake-socket')).fakeIo }));
vi.mock('../../lib/checksum', () => ({ fileChecksum: async () => undefined }));

// A fixed "today" (Wednesday): the week is Oct 12 – Oct 18.
const TODAY = '2026-10-14';
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
  resetDaily();
  retryDelay.ms = () => 5;
});
afterEach(() => {
  disconnectSocket();
  vi.useRealTimers();
});

const user = userEvent.setup();
const audioFile = (name = 'forty_five.wav') => new File([new Uint8Array(1024)], name, { type: 'audio/wav' });
const rows = () => within(screen.getByRole('list', { name: 'Days of the week' })).getAllByRole('listitem');
const row = (label: string) => rows().find((r) => r.textContent?.includes(label))!;
const motd = (date: string) => daily.motd.find((r) => r.date === date);
const title = (id: string) => db.sessions.find((s) => s.id === id)!.title;
const lengths = () => within(screen.getByRole('list', { name: 'Lengths' })).getAllByRole('listitem');

describe('Today screen helpers', () => {
  it('the week starts on Monday; the label names both ends', () => {
    expect(weekStart('2026-10-14')).toBe('2026-10-12');
    expect(weekStart('2026-10-18')).toBe('2026-10-12'); // Sunday belongs to the week before
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
    expect(weekDays('2026-10-12')).toHaveLength(7);
    expect(weekLabel('2026-09-28')).toBe('Sep 28 – Oct 4');
  });

  it('missingLengths and the note under the title', () => {
    const ready = { mediaId: 'm', status: 'ready', durationSec: 600 } as const;
    const day = (variants: MotdDay['variants']): MotdDay => ({ date: TODAY, sessionId: 's', variants, complete: false });
    expect(missingLengths(day({ 10: ready, 30: ready, 45: ready }))).toEqual([]);
    expect(dayNote(day({ 10: ready, 30: ready, 45: ready }))).toBe('10 · 30 · 45 min ready');
    expect(missingLengths(day({ 10: ready, 30: null, 45: null }))).toEqual([30, 45]);
    expect(dayNote(day({ 10: ready, 30: null, 45: null }))).toBe('Missing 30 min, 45 min');
    expect(dayNote(day({ 10: ready, 30: ready, 45: { mediaId: 'x', status: 'processing', durationSec: null } }))).toBe(
      'Missing 45 min (processing)',
    );
    expect(missingLengths({ date: TODAY, sessionId: null, variants: null, complete: false })).toEqual([]);
    expect(dayNote({ date: TODAY, sessionId: null, variants: null, complete: false })).toMatch(/^Not chosen yet/);
  });
});

describe('Today screen: the week', () => {
  it('lists the seven days with the meditation and what is missing; the past is locked; passes the a11y check', async () => {
    openApp('/today');
    expect(await h1('Today Screen')).toBeInTheDocument();
    await screen.findByRole('list', { name: 'Days of the week' });
    expect(screen.getByText('Oct 12 – Oct 18')).toBeInTheDocument();
    expect(rows()).toHaveLength(7);
    expect(row('Wed, Oct 14')).toHaveTextContent(title(motd('2026-10-14')!.sessionId));
    expect(row('Wed, Oct 14')).toHaveTextContent('10 · 30 · 45 min ready');
    expect(row('Thu, Oct 15')).toHaveTextContent('Missing 45 min');
    expect(row('Sat, Oct 17')).toHaveTextContent('Not chosen yet · falls back to the most played session');
    expect(row('Tue, Oct 13')).toHaveTextContent('Past'); // yesterday: history, no buttons
    expect(within(row('Tue, Oct 13')).queryByRole('button', { name: /^Change/ })).not.toBeInTheDocument();
    expect(within(row('Sat, Oct 17')).getByRole('button', { name: /^Change the meditation of Sat, Oct 17/ })).toHaveTextContent('Choose');
    expect(await a11yViolations()).toEqual([]);
  });

  it('the week buttons load the other weeks', async () => {
    openApp('/today');
    await screen.findByRole('list', { name: 'Days of the week' });
    await user.click(screen.getByRole('button', { name: 'Next week' }));
    expect(await screen.findByText('Oct 19 – Oct 25')).toBeInTheDocument();
    await waitFor(() => expect(row('Mon, Oct 19')).toHaveTextContent('Not chosen yet'));
    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(await screen.findByText('Oct 5 – Oct 11')).toBeInTheDocument();
  });

  it('"Choose" on an empty day: only published, non-SoS, non-YouTube meditations; the day is saved with its group settings kept', async () => {
    openApp('/today');
    await screen.findByRole('list', { name: 'Days of the week' });
    await user.click(within(row('Sat, Oct 17')).getByRole('button', { name: /^Change the meditation of Sat, Oct 17/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Meditation for Sat, Oct 17' });
    await within(dialog).findByRole('list', { name: 'Meditations' });
    expect(within(dialog).getByRole('button', { name: /Open Awareness & Silence/ })).toBeDisabled(); // a draft
    expect(within(dialog).getByRole('button', { name: /Panic/ })).toBeDisabled(); // SoS
    expect(within(dialog).getByRole('button', { name: /Unconditional Love/ })).toBeDisabled(); // YouTube
    await user.click(within(dialog).getByRole('button', { name: /Deep Delta Sleep Descent/ }));
    expect(await findToast('Sat, Oct 17 saved')).toBeInTheDocument();
    expect(motd('2026-10-17')).toMatchObject({
      sessionId: db.sessions.find((s) => s.title === 'Deep Delta Sleep Descent')!.id,
      version: 1,
    });
    await waitFor(() => expect(row('Sat, Oct 17')).toHaveTextContent('Deep Delta Sleep Descent'));
    expect(row('Sat, Oct 17')).toHaveTextContent('Missing 10 min, 30 min, 45 min'); // lengths come next
  });

  it('"Change" on a planned day sends the version; if someone changed it first, nothing is overwritten', async () => {
    openApp('/today');
    await screen.findByRole('list', { name: 'Days of the week' });
    daily.motd.find((r) => r.date === '2026-10-16')!.version = 5; // changed by someone else after this page loaded
    await user.click(within(row('Fri, Oct 16')).getByRole('button', { name: /^Change the meditation of Fri, Oct 16/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: /Deep Delta Sleep Descent/ }));
    expect(await screen.findByText('Someone else changed this day.')).toBeInTheDocument();
    expect(motd('2026-10-16')!.sessionId).toBe(db.sessions[0]!.id); // unchanged
  });

  it('"Move date": swaps with another day that has a meditation; an empty day is explained', async () => {
    openApp('/today');
    await screen.findByRole('list', { name: 'Days of the week' });
    const a = motd('2026-10-14')!.sessionId;
    const b = motd('2026-10-16')!.sessionId;
    await user.click(within(row('Wed, Oct 14')).getByRole('button', { name: /^Move the date of Wed, Oct 14/ }));
    const dialog = await screen.findByRole('dialog', { name: /^Move “/ });
    await user.clear(within(dialog).getByLabelText('Swap with the meditation of'));
    await user.type(within(dialog).getByLabelText('Swap with the meditation of'), '2026-10-18'); // nothing planned there
    await user.click(within(dialog).getByRole('button', { name: 'Swap days' }));
    expect(await within(dialog).findByText(/Nothing is planned for Sun, Oct 18/)).toBeInTheDocument();
    expect(motd('2026-10-14')!.sessionId).toBe(a);

    await user.clear(within(dialog).getByLabelText('Swap with the meditation of'));
    await user.type(within(dialog).getByLabelText('Swap with the meditation of'), '2026-10-16');
    await user.click(within(dialog).getByRole('button', { name: 'Swap days' }));
    expect(await screen.findByText('Wed, Oct 14 and Fri, Oct 16 swapped')).toBeInTheDocument();
    expect(motd('2026-10-14')!.sessionId).toBe(b);
    expect(motd('2026-10-16')!.sessionId).toBe(a);
    await waitFor(() => expect(row('Wed, Oct 14')).toHaveTextContent(title(b)));
  });

  it('drag and drop (keyboard): dropping a day on another swaps the two days', async () => {
    const rect = (top: number) => ({
      top,
      bottom: top + 70,
      left: 0,
      right: 500,
      width: 500,
      height: 70,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const li = this.closest('li');
      return rect(li ? [...(li.parentElement?.children ?? [])].indexOf(li) * 70 : 0) as DOMRect;
    });
    let sent: unknown;
    server.use(
      http.post(url('/v1/admin/motd/swap'), async ({ request }) => {
        sent = await request.clone().json();
        return undefined;
      }),
    );
    openApp('/today');
    await screen.findByRole('list', { name: 'Days of the week' });
    const wed = motd('2026-10-14')!.sessionId;
    const fri = motd('2026-10-16')!.sessionId;
    screen.getByRole('button', { name: 'Reorder Wed, Oct 14' }).focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');
    await waitFor(() => expect(sent).toEqual({ a: '2026-10-14', b: '2026-10-16' }));
    await waitFor(() => expect(motd('2026-10-14')!.sessionId).toBe(fri));
    expect(motd('2026-10-16')!.sessionId).toBe(wed);
  });

  it('dragging a past day or an empty day is refused with a reason', async () => {
    const rect = (top: number) => ({
      top,
      bottom: top + 70,
      left: 0,
      right: 500,
      width: 500,
      height: 70,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const li = this.closest('li');
      return rect(li ? [...(li.parentElement?.children ?? [])].indexOf(li) * 70 : 0) as DOMRect;
    });
    openApp('/today');
    await screen.findByRole('list', { name: 'Days of the week' });
    screen.getByRole('button', { name: 'Reorder Fri, Oct 16' }).focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}'); // onto Sat Oct 17: nothing planned
    await user.keyboard(' ');
    expect(await screen.findByText('Both days need a meditation to swap.')).toBeInTheDocument();
    expect(motd('2026-10-17')).toBeUndefined();
  });
});

describe('Today screen: the three lengths', () => {
  it('shows each length of the selected day as uploaded or missing, and follows the selection', async () => {
    openApp('/today');
    await screen.findByRole('list', { name: 'Days of the week' });
    expect(await screen.findByRole('heading', { name: `Three lengths for ${title(motd('2026-10-14')!.sessionId)}` })).toBeInTheDocument();
    expect(lengths().map((l) => within(l).getByRole('heading').textContent)).toEqual(['10 min', '30 min', '45 min']);
    expect(lengths().every((l) => l.textContent?.includes('Uploaded'))).toBe(true);
    await user.click(within(row('Thu, Oct 15')).getByRole('button', { pressed: false }));
    await waitFor(() => expect(lengths()[2]).toHaveTextContent('Missing'));
    expect(screen.getByText(/Missing: 45 min/)).toBeInTheDocument();
  });

  it('a day with no meditation asks for the meditation first; a past day cannot be changed', async () => {
    openApp('/today');
    await screen.findByRole('list', { name: 'Days of the week' });
    await user.click(within(row('Sat, Oct 17')).getByRole('button', { pressed: false }));
    expect(await screen.findByText(/Choose the meditation for Sat, Oct 17 first/)).toBeInTheDocument();
    await user.click(within(row('Tue, Oct 13')).getByRole('button', { pressed: false }));
    expect(await screen.findByText('Past days cannot be changed.')).toBeInTheDocument();
  });

  it('a new file for a missing length is uploaded, processed, and then set on the day', async () => {
    openApp('/today');
    await screen.findByRole('list', { name: 'Days of the week' });
    await user.click(within(row('Thu, Oct 15')).getByRole('button', { pressed: false }));
    await waitFor(() => expect(lengths()[2]).toHaveTextContent('Missing'));
    await user.upload(within(lengths()[2]!).getByLabelText('45 min audio'), audioFile());
    expect(await screen.findByRole('progressbar', { name: /Processing forty_five.wav/ }, { timeout: 4000 })).toBeInTheDocument();
    const media = db.media.at(-1)!;
    expect(media).toMatchObject({ name: 'forty_five.wav', status: 'processing' });
    expect(motd('2026-10-15')!.variants[45]).toBeUndefined(); // not set before it is ready
    act(() => finishProcessing(media.id));
    expect(await screen.findByText('45 min saved', undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(motd('2026-10-15')!.variants[45]).toBe(media.id);
    await waitFor(() => expect(row('Thu, Oct 15')).toHaveTextContent('10 · 30 · 45 min ready'));
  }, 20_000);
});

describe('Today screen: rules and preview', () => {
  it('shows the saved rules; the phone preview follows the switches at once', async () => {
    openApp('/today');
    expect(await screen.findByRole('checkbox', { name: 'Progress card (minutes this week)' })).toBeChecked();
    expect(screen.getByLabelText('Empty-room rule')).toHaveValue('10');
    expect(screen.getByLabelText('“Free for you” shows first')).toHaveValue('random');
    const phone = screen.getByRole('complementary', { name: 'App preview' });
    expect(within(phone).getByText(/1,248 meditating worldwide now/)).toBeInTheDocument();
    expect(within(phone).queryByText(/Raphael’s note/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Live “meditating now” counter' }));
    await user.click(screen.getByRole('switch', { name: /Show the Daily Message/ }));
    expect(within(phone).queryByText(/meditating worldwide now/)).not.toBeInTheDocument();
    expect(within(phone).getByText(/Raphael’s note/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('save sends the whole rules document with the version; nothing is sent when nothing changed', async () => {
    openApp('/today');
    await screen.findByRole('checkbox', { name: 'Progress card (minutes this week)' });
    await user.selectOptions(screen.getByLabelText('“Free for you” shows first'), 'newest');
    await user.click(screen.getByRole('checkbox', { name: 'World map + World Vibration' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await findToast('Today screen saved')).toBeInTheDocument();
    expect(daily.rules).toMatchObject({
      version: 2,
      value: {
        emptyRoomThreshold: 10,
        freeHomePick: 'newest',
        showDailyMessage: false,
        sections: { progress: true, liveCounter: true, worldMap: false },
      },
    });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    // putting a value back to what is saved is no change
    await user.click(screen.getByRole('checkbox', { name: 'World map + World Vibration' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    await user.click(screen.getByRole('checkbox', { name: 'World map + World Vibration' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('the empty-room number is kept between 0 and 1000', async () => {
    openApp('/today');
    const input = await screen.findByLabelText('Empty-room rule');
    await user.clear(input);
    await user.type(input, '5000');
    await user.tab();
    expect(input).toHaveValue('1000');
  });

  it('409: someone saved the rules first → both versions are shown; "Keep my changes" keeps their other rules', async () => {
    openApp('/today');
    await screen.findByRole('checkbox', { name: 'Progress card (minutes this week)' });
    await user.selectOptions(screen.getByLabelText('“Free for you” shows first'), 'newest');
    daily.rules = {
      ...daily.rules,
      version: 2,
      value: { ...daily.rules.value, freeHomePick: 'random', emptyRoomThreshold: 25, showDailyMessage: true },
    };
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    const dialog = await screen.findByRole('dialog', { name: 'This was changed while you were editing' });
    // my change is the same field their save left at "random": a real conflict on one field only
    expect(within(dialog).getAllByRole('row').slice(1)).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: 'Keep my changes' }));
    await waitFor(() =>
      expect(daily.rules).toMatchObject({ version: 3, value: { freeHomePick: 'newest', emptyRoomThreshold: 25, showDailyMessage: true } }),
    );
  });

  it('a moderator has no Today screen', async () => {
    openApp('/today', 'moderator');
    expect(await screen.findByText('No permission')).toBeInTheDocument();
  });
});
