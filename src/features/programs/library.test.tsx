import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disconnectSocket } from '../../lib/socket';
import { retryDelay } from '../../lib/upload';
import { db, finishProcessing } from '../../mocks/content';
import { fail, url } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { findToast, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { challengeFinishRate, challengeSchema } from '../challenges/api';
import { blockLength, blockSchema, loudness } from '../sounds/api';
import { finishRate, programBlocker, toDaysBody, totalMinutes, type DayDraft } from './api';

vi.mock('socket.io-client', async () => ({ io: (await import('../../test/fake-socket')).fakeIo }));
vi.mock('../../lib/checksum', () => ({ fileChecksum: async () => undefined }));

const user = userEvent.setup();
beforeEach(() => {
  retryDelay.ms = () => 5;
});
afterEach(() => {
  disconnectSocket();
  retryDelay.ms = (n) => 1000 * 2 ** (n - 1);
});

// ───────────────────────── Sounds & building blocks

describe('sound block helpers', () => {
  it('loudness verdict against −16 LUFS ±1', () => {
    expect(loudness('-16.20')).toEqual({ text: '−16.2 LUFS ✓', ok: true });
    expect(loudness('-15.00')).toEqual({ text: '−15.0 LUFS ✓', ok: true });
    expect(loudness(-12.4)).toEqual({ text: '−12.4 LUFS · too loud', ok: false });
    expect(loudness('-19.5')).toEqual({ text: '−19.5 LUFS · too quiet', ok: false });
    expect(loudness(null)).toBeNull();
    expect(loudness('n/a')).toBeNull();
  });

  it('length: seconds under a minute, minutes above, "loop" for loops', () => {
    expect(blockLength({ durationSec: 20, loopable: false })).toBe('20 s');
    expect(blockLength({ durationSec: 120, loopable: false })).toBe('2 min');
    expect(blockLength({ durationSec: 150, loopable: true })).toBe('2.5 min loop');
    expect(blockLength({ durationSec: 0, loopable: false })).toBe('—');
  });

  it('schema: the name is required', () => {
    expect(blockSchema.safeParse({ name: ' ', access: 'free', loopable: false, visible: true }).error?.issues[0]?.message).toBe(
      'Enter the name people see in the app',
    );
  });
});

describe('Sounds screen', () => {
  const rows = () => within(screen.getByRole('list', { name: /order$/ })).getAllByRole('listitem');

  it('tabs with counts, the blocks of the tab, the loudness card, no a11y violations', async () => {
    openApp('/sounds');
    expect(await h1('Sounds & building blocks')).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Openings · 2' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Openings · 2',
      'Core blocks · 0',
      'Closings · 1',
      'Sounds · 1',
      'Bells · 0',
      'OM & mantra loops · 0',
    ]);
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Arrival'), expect.stringContaining('Body Settle')]);
    expect(rows()[0]).toHaveTextContent('2 minBuild your ownPremium1');
    const card = screen.getByRole('list', { name: 'Loudness of these blocks' });
    expect(
      within(card)
        .getAllByRole('listitem')
        .map((l) => l.textContent),
    ).toEqual(['Arrival−16.1 LUFS ✓', 'Body Settle−16.1 LUFS ✓']);
    expect(await a11yViolations()).toEqual([]);
  });

  it('another tab shows its own blocks, tip and warnings; the tab is kept in the address', async () => {
    const { router } = openApp('/sounds');
    await user.click(await screen.findByRole('tab', { name: 'Closings · 1' }));
    expect(router.state.location.search).toBe('?kind=closing');
    expect(rows()[0]).toHaveTextContent('Closing Words');
    expect(rows()[0]).toHaveTextContent('Check loudness');
    expect(screen.getByRole('list', { name: 'Loudness of these blocks' })).toHaveTextContent('Closing Words−12.4 LUFS · too loud');
    expect(screen.getByRole('button', { name: 'Upload closing' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Bells · 0' }));
    expect(screen.getByText('No bells yet')).toBeInTheDocument();
  });

  it('opening a link with ?kind= selects that tab', async () => {
    openApp('/sounds?kind=sound');
    expect(await screen.findByRole('tab', { name: 'Sounds · 1' })).toHaveAttribute('aria-selected', 'true');
    expect(rows()[0]).toHaveTextContent('Rain on CedarSeamless loop2.5 min loop');
  });

  it('upload a block: the name comes from the file, "Add" waits for processing, then the block is in the list', async () => {
    openApp('/sounds?kind=bell');
    await user.click(await screen.findByRole('button', { name: 'Upload bell' }));
    const dialog = await screen.findByRole('dialog', { name: 'Upload bell' });
    const add = within(dialog).getByRole('button', { name: 'Add to the app' });
    expect(add).toBeDisabled();
    await user.upload(
      within(dialog).getByLabelText('Audio file'),
      new File([new Uint8Array(512)], 'tibetan_bowl.wav', { type: 'audio/wav' }),
    );
    expect(within(dialog).getByLabelText('Name in the app')).toHaveValue('tibetan bowl');
    await within(dialog).findByRole('progressbar', { name: /Processing/ }, { timeout: 4000 });
    expect(add).toBeDisabled();
    const media = db.media.at(-1)!;
    act(() => finishProcessing(media.id, { durationSec: 8 }));
    await waitFor(() => expect(add).toBeEnabled(), { timeout: 5000 });
    expect(within(dialog).getByRole('status')).toHaveTextContent('Loudness: −16.2 LUFS ✓');

    const name = within(dialog).getByLabelText('Name in the app');
    await user.clear(name);
    await user.type(name, 'Tibetan bowl');
    await user.click(within(dialog).getByRole('radio', { name: 'Free' }));
    await user.click(add);
    expect(await findToast('Bell added')).toBeInTheDocument();
    expect(db.blocks.at(-1)).toMatchObject({
      kind: 'bell',
      name: 'Tibetan bowl',
      access: 'free',
      mediaId: media.id,
      durationSec: 8,
      loopable: false,
    });
    expect(await screen.findByRole('tab', { name: 'Bells · 1' })).toBeInTheDocument();
    expect(rows()[0]).toHaveTextContent('Tibetan bowlEdit8 sSilence Room, Build your ownFree1');
  });

  it('a loop whose start and end do not match gets a warning', async () => {
    openApp('/sounds?kind=loop');
    await user.click(await screen.findByRole('button', { name: 'Upload loop' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: /Repeats as a loop/ })).toBeChecked(); // loops repeat by default
    await user.upload(within(dialog).getByLabelText('Audio file'), new File([new Uint8Array(512)], 'om.wav', { type: 'audio/wav' }));
    await within(dialog).findByRole('progressbar', { name: /Processing/ }, { timeout: 4000 });
    const media = db.media.at(-1)!;
    act(() =>
      finishProcessing(media.id, {
        job: { id: 'j', status: 'done', progress: 100, error: null, result: { lufs: -16, loop: { seamless: false, diffDb: 7.5 } } },
      }),
    );
    expect(await within(dialog).findByRole('alert', undefined, { timeout: 5000 })).toHaveTextContent('do not match (7.5 dB apart)');
  });

  it('edit a block: rename and hide, with the version; a stale version opens the conflict dialog', async () => {
    openApp('/sounds');
    await user.click(await screen.findByRole('button', { name: /^Arrival/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit “Arrival”' });
    const name = within(dialog).getByLabelText('Name in the app');
    await user.clear(name);
    await user.type(name, 'Arriving');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Visible in app' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await findToast('Block saved')).toBeInTheDocument();
    expect(db.blocks[0]).toMatchObject({ name: 'Arriving', visible: false, version: 2 });
    expect(rows()[0]).toHaveTextContent('ArrivingHidden');

    await user.click(screen.getByRole('button', { name: /^Arriving/ }));
    const again = await screen.findByRole('dialog', { name: 'Edit “Arriving”' });
    await user.type(within(again).getByLabelText('Name in the app'), ' 2');
    Object.assign(db.blocks[0]!, { name: 'Renamed elsewhere', version: 3 });
    await user.click(within(again).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('dialog', { name: 'This was changed while you were editing' })).toHaveTextContent(
      'Renamed elsewhereArriving 2',
    );
  });

  it('reorder inside a tab sends only that tab and updates the numbers', async () => {
    const rect = (top: number) => ({
      top,
      bottom: top + 64,
      left: 0,
      right: 600,
      width: 600,
      height: 64,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const li = this.closest('li');
      return rect(li ? [...(li.parentElement?.children ?? [])].indexOf(li) * 64 : 0) as DOMRect;
    });
    let sent: unknown;
    server.use(
      http.put(url('/v1/admin/sound-blocks/order'), async ({ request }) => {
        sent = await request.clone().json();
        return undefined;
      }),
    );
    openApp('/sounds');
    (await screen.findByRole('button', { name: 'Reorder Arrival' })).focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');
    await waitFor(() => expect(sent).toEqual({ ids: [db.blocks[1]!.id, db.blocks[0]!.id] }));
    expect(rows().map((r) => r.textContent?.match(/^(Body Settle|Arrival)|\d$/g)?.join(' '))).toEqual(['Body Settle 1', 'Arrival 2']);
  });
});

// ───────────────────────── Programs

describe('program helpers', () => {
  const day = (status: 'live' | 'draft', durationSec = 600): DayDraft => ({ key: `${Math.random()}`, sessionId: 's', title: null, session: { id: 's', title: 'x', durationSec, status, type: 'audio', themeId: null } }); // prettier-ignore

  it('days are numbered 1…n in list order', () => {
    expect(toDaysBody([{ ...day('live'), sessionId: 'b' }, { ...day('live'), sessionId: 'a' }])).toEqual([
      { day: 1, sessionId: 'b', title: null },
      { day: 2, sessionId: 'a', title: null },
    ]); // prettier-ignore
  });

  it('total length, finish rate, and what blocks publishing', () => {
    expect(totalMinutes([day('live', 600), day('live', 930)])).toBe(26);
    expect(finishRate({ started: 1240, completed: 384 })).toBeCloseTo(0.31, 2);
    expect(finishRate({ started: 0, completed: 0 })).toBeNull();
    expect(programBlocker([])).toBe('Add at least one day first.');
    expect(programBlocker([day('live'), day('draft')])).toBe('1 day uses a meditation that is not published yet.');
    expect(programBlocker([day('draft'), day('draft')])).toBe('2 days use meditations that are not published yet.');
    expect(programBlocker([day('live')])).toBeNull();
  });
});

describe('Programs screen', () => {
  const list = () => within(screen.getByRole('list', { name: 'Programs' })).getAllByRole('button');
  const days = () => within(screen.getByRole('list', { name: 'Day schedule' })).getAllByRole('listitem');
  const byTitle = (t: string) => db.programs.find((p) => p.title === t)!;

  it('lists programs with status, opens the first with its numbers and days; a11y clean', async () => {
    openApp('/programs');
    expect(await h1('Programs')).toBeInTheDocument();
    await screen.findByRole('list', { name: 'Programs' });
    expect(list().map((b) => b.textContent)).toEqual([
      '14-Day Sleep RepairDraft0 days · 0 started',
      '7-Day Autonomic ResetLive2 days · 1,240 started',
    ]);
    await user.click(list()[1]!);
    expect(screen.getByLabelText('Title')).toHaveValue('7-Day Autonomic Reset');
    expect(screen.getByRole('list', { name: 'Program numbers' })).toHaveTextContent(
      '1,240 started384 finished all 231% finish rate60 min total length',
    );
    expect(days().map((d) => d.textContent?.replace(/Change session$/, ''))).toEqual([
      'Day 1Steady Under PressureBreathing15 min',
      'Day 2Deep Delta Sleep DescentSleep45 min',
    ]);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(await a11yViolations()).toEqual([]);
  });

  it('new program: created as a draft and opened; it cannot be published without a day', async () => {
    openApp('/programs');
    await screen.findByRole('list', { name: 'Programs' });
    await user.click(screen.getByRole('button', { name: 'New program' }));
    const dialog = await screen.findByRole('dialog', { name: 'New program' });
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Title'), '21-Day Resilience Arc');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await findToast('Program created as a draft')).toBeInTheDocument();
    expect(await screen.findByLabelText('Title')).toHaveValue('21-Day Resilience Arc');
    expect(screen.getByText('No days yet')).toBeInTheDocument();
    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(publish).toBeDisabled();
    await user.hover(publish.parentElement!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Add at least one day first.');
  });

  it('add days from the picker, save details and days with the right versions, then publish', async () => {
    const calls: string[] = [];
    server.use(
      http.patch(url('/v1/admin/programs/:id'), ({ request }) => void calls.push(`PATCH ${request.headers.get('if-match')}`)),
      http.put(url('/v1/admin/programs/:id/days'), ({ request }) => void calls.push(`PUT days ${request.headers.get('if-match')}`)),
    );
    openApp('/programs');
    await screen.findByLabelText('Title'); // the draft "14-Day Sleep Repair" is first
    await user.click(screen.getByRole('button', { name: '+ Add day' }));
    let picker = await screen.findByRole('dialog', { name: 'Meditation for day 1' });
    await user.type(within(picker).getByRole('searchbox'), 'delta');
    await user.click(await within(picker).findByRole('button', { name: /Deep Delta Sleep Descent/ }));
    await user.click(screen.getByRole('button', { name: '+ Add day' }));
    picker = await screen.findByRole('dialog', { name: 'Meditation for day 2' });
    await user.click(await within(picker).findByRole('button', { name: /Open Awareness & Silence/ })); // a draft
    expect(days()).toHaveLength(2);
    expect(days()[1]).toHaveTextContent('draft, not in the app yet');

    const publish = () => screen.getByRole('button', { name: 'Publish' });
    expect(publish()).toBeDisabled(); // day 2 is not published
    await user.click(screen.getByRole('button', { name: 'Remove day 2' }));
    expect(days()).toHaveLength(1);
    await user.type(screen.getByLabelText('Description'), 'Two weeks to better sleep.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await findToast('Program saved')).toBeInTheDocument();
    expect(calls).toEqual(['PATCH "v1"', 'PUT days "v2"']);
    expect(byTitle('14-Day Sleep Repair')).toMatchObject({ description: 'Two weeks to better sleep.', version: 3 });
    expect(byTitle('14-Day Sleep Repair').days).toMatchObject([{ day: 1 }]);

    await user.click(publish());
    expect(await findToast('Program published')).toBeInTheDocument();
    expect(byTitle('14-Day Sleep Repair').status).toBe('live');
    expect(calls.at(-1)).toBe('PATCH "v3"');
  });

  it('change the meditation of a day; archived meditations cannot be picked', async () => {
    db.sessions.find((s) => s.title === 'Anxiety')!.status = 'archived';
    openApp('/programs');
    await screen.findByRole('list', { name: 'Programs' });
    await user.click(list()[1]!);
    await user.click(within(days()[0]!).getByRole('button', { name: 'Change session' }));
    const picker = await screen.findByRole('dialog', { name: 'Meditation for day 1' });
    expect(await within(picker).findByRole('button', { name: /Anxiety/ })).toBeDisabled();
    await user.click(within(picker).getByRole('button', { name: /Vagus Nerve Reset/ }));
    expect(days()[0]).toHaveTextContent('Day 1Vagus Nerve Reset');
    expect(days()).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('unpublish asks first and says how many members started', async () => {
    openApp('/programs');
    await screen.findByRole('list', { name: 'Programs' });
    await user.click(list()[1]!);
    await user.click(screen.getByRole('button', { name: 'Unpublish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Take this program out of the app?' });
    expect(dialog).toHaveTextContent('1,240 members have started it');
    await user.click(within(dialog).getByRole('button', { name: 'Unpublish' }));
    expect(await findToast('Program is a draft again')).toBeInTheDocument();
    expect(byTitle('7-Day Autonomic Reset').status).toBe('draft');
  });

  it('409: nothing is overwritten; the admin loads the newer version', async () => {
    openApp('/programs');
    const title = await screen.findByLabelText('Title');
    await user.type(title, ' v2');
    Object.assign(byTitle('14-Day Sleep Repair'), { title: 'Renamed by Lena', version: 2 });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'This program was changed while you were editing' });
    expect(byTitle('Renamed by Lena').version).toBe(2);
    await user.click(within(dialog).getByRole('button', { name: 'Load their version' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByDisplayValue('14-Day Sleep Repair v2')).toBeInTheDocument(); // my unsaved text stays to copy from
    expect(list().map((b) => b.textContent)).toContain('Renamed by LenaDraft0 days · 0 started');
  });

  it('empty and error states', async () => {
    db.programs = [];
    const view = openApp('/programs');
    expect(await screen.findByText('No programs yet')).toBeInTheDocument();
    view.unmount();
    server.use(http.get(url('/v1/admin/programs'), () => fail(403, 'FORBIDDEN', 'Not allowed')));
    openApp('/programs');
    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed');
  });
});

// ───────────────────────── Challenges

describe('challenge helpers', () => {
  it('schema: numbers typed as text are accepted, limits are explained', () => {
    const base = { name: 'Calm', days: '7', counts: 'any', minMinutes: '3', membersOnly: true, showOnYou: true };
    expect(challengeSchema.parse(base)).toMatchObject({ days: 7, minMinutes: 3 });
    expect(challengeSchema.safeParse({ ...base, days: '0' }).error?.issues[0]?.message).toBe('At least 1 day');
    expect(challengeSchema.safeParse({ ...base, days: '400' }).error?.issues[0]?.message).toBe('At most 365 days');
    expect(challengeSchema.safeParse({ ...base, days: 'a week' }).error?.issues[0]?.message).toBe('Enter a number of days');
    expect(challengeSchema.safeParse({ ...base, days: '7.5' }).error?.issues[0]?.message).toBe('Use whole days');
  });

  it('finish rate', () => {
    expect(challengeFinishRate({ participants: 1904, finished: 1180 })).toBeCloseTo(0.62, 2);
    expect(challengeFinishRate({ participants: 0, finished: 0 })).toBeNull();
  });
});

describe('Challenges screen', () => {
  const rows = () => within(screen.getByRole('list', { name: 'Challenges' })).getAllByRole('button');
  const editor = () => screen.getByRole('complementary', { name: /challenge$/i });

  it('table with what counts, people, finish rate and status; says the feature is off; a11y clean', async () => {
    openApp('/challenges');
    expect(await h1('Challenges')).toBeInTheDocument();
    await screen.findByRole('list', { name: 'Challenges' });
    expect(rows().map((r) => r.textContent)).toEqual(['7 days of calm7Any meditation1,90462%Live', 'Sleep week7Sleep meditations——Draft']);
    expect(await screen.findByText(/hidden in the app while the “Challenges” feature is switched off/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '/settings');
    expect(within(editor()).getByLabelText('Name')).toHaveValue('7 days of calm');
    expect(within(editor()).getByText('Missing a day never resets progress. No streaks, no grace days.')).toBeInTheDocument();
    expect(await a11yViolations()).toEqual([]);
  });

  it('with the flag on it says live challenges show in the app; an editor is told who can switch it', async () => {
    db.flags.challenges = true;
    const view = openApp('/challenges');
    expect(await screen.findByText('The Challenges feature is switched on: live challenges show in the app.')).toBeInTheDocument();
    view.unmount();
    let asked = 0;
    server.use(http.get(url('/v1/admin/config'), () => void (asked += 1)));
    openApp('/challenges', 'editor');
    expect(await screen.findByText(/An owner or admin switches it on in Settings\./)).toBeInTheDocument();
    expect(asked).toBe(0); // editors may not read the settings, so the page does not ask
  });

  it('edit: save with the version; "what counts" hides the minutes field for sleep and group', async () => {
    openApp('/challenges');
    await screen.findByRole('list', { name: 'Challenges' });
    const days = within(editor()).getByLabelText('Length in days');
    await user.clear(days);
    await user.type(days, '14');
    expect(within(editor()).getByLabelText(/Shortest meditation that counts/)).toHaveValue('3');
    await user.selectOptions(within(editor()).getByLabelText('What counts as a day'), 'group');
    expect(within(editor()).queryByLabelText(/Shortest meditation that counts/)).not.toBeInTheDocument();
    await user.click(within(editor()).getByRole('switch', { name: 'Members only' }));
    await user.click(within(editor()).getByRole('button', { name: 'Save' }));
    expect(await findToast('Challenge saved')).toBeInTheDocument();
    expect(db.challenges[0]).toMatchObject({ days: 14, counts: 'group', membersOnly: false, version: 3 });
    expect(rows()[0]).toHaveTextContent('7 days of calm14Group meditations');
  });

  it('bad numbers are refused before any request', async () => {
    openApp('/challenges');
    await screen.findByRole('list', { name: 'Challenges' });
    const days = within(editor()).getByLabelText('Length in days');
    await user.clear(days);
    await user.type(days, '0');
    await user.click(within(editor()).getByRole('button', { name: 'Save' }));
    expect(await within(editor()).findByText('At least 1 day')).toBeInTheDocument();
    expect(db.challenges[0]!.version).toBe(2);
  });

  it('new challenge starts as a draft; "Make live" and "End challenge" change the status', async () => {
    openApp('/challenges');
    await screen.findByRole('list', { name: 'Challenges' });
    await user.click(screen.getByRole('button', { name: 'New challenge' }));
    const form = screen.getByRole('complementary', { name: 'New challenge' });
    await user.type(within(form).getByLabelText('Name'), 'New year, 30 days');
    const days = within(form).getByLabelText('Length in days');
    await user.clear(days);
    await user.type(days, '30');
    await user.click(within(form).getByRole('button', { name: 'Create' }));
    expect(await findToast('Challenge created as a draft')).toBeInTheDocument();
    expect(rows()[0]).toHaveTextContent('New year, 30 days30Any meditation——Draft');

    await user.click(within(editor()).getByRole('button', { name: 'Make live' }));
    expect(await findToast('Challenge is live')).toBeInTheDocument();
    expect(db.challenges[0]).toMatchObject({ name: 'New year, 30 days', status: 'live' });
    await user.click(await within(editor()).findByRole('button', { name: 'End challenge' }));
    await waitFor(() => expect(db.challenges[0]!.status).toBe('archived'));
    expect(rows()[0]).toHaveTextContent('Ended');
  });

  it('409 on save shows both versions', async () => {
    openApp('/challenges');
    await screen.findByRole('list', { name: 'Challenges' });
    const name = within(editor()).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Calm week');
    Object.assign(db.challenges[0]!, { name: 'Seven calm days', version: 3 });
    await user.click(within(editor()).getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'This was changed while you were editing' });
    expect(within(dialog).getAllByRole('row')[1]).toHaveTextContent('NameSeven calm daysCalm week');
  });
});
