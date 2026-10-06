import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disconnectSocket } from '../../lib/socket';
import { retryDelay } from '../../lib/upload';
import { db, finishProcessing, S3 } from '../../mocks/content';
import { fail, url } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { connectFakeSocket, findToast, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { listQuery, NO_FILTERS, parseTags, publishBlocker, sessionSchema, sessionToForm, toBody, blankSession } from './api';
import { titleFromFile } from './BulkUpload';
import { goesLive, lengthLabel, sessionNote } from './display';

vi.mock('socket.io-client', async () => ({ io: (await import('../../test/fake-socket')).fakeIo }));
// Hashing is tested in lib/upload.test.ts. Here a file named dup* gets a checksum the mock API knows as a duplicate.
vi.mock('../../lib/checksum', () => ({ fileChecksum: async (f: File) => (f.name.startsWith('dup') ? 'dup-1' : undefined) }));

const user = userEvent.setup();
const table = () => screen.getByRole('table', { name: 'Sessions' });
const titles = () =>
  within(table())
    .getAllByRole('row')
    .slice(1)
    .map((r) =>
      within(r)
        .getAllByRole('link')[0]
        ?.textContent?.replace(/(YouTube link|Cover missing|Audio missing|SoS.*|Raphael Reiter|Premium|Free for you).*$/, ''),
    );
const byTitle = (title: string) => db.sessions.find((s) => s.title === title)!;
const audioFile = (name = 'new_take.wav') => new File([new Uint8Array(1024)], name, { type: 'audio/wav' });

beforeEach(() => {
  // jsdom has no layout: give the virtual table a height so it renders rows
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1200);
  retryDelay.ms = () => 5;
});
afterEach(() => {
  disconnectSocket();
  retryDelay.ms = (n) => 1000 * 2 ** (n - 1);
});

describe('session helpers', () => {
  it('tabs and filters become the API query', () => {
    expect(listQuery(NO_FILTERS)).toEqual({});
    expect(JSON.parse(JSON.stringify(listQuery({ ...NO_FILTERS, tab: 'free', q: ' calm ' })))).toEqual({ access: 'free', q: 'calm' });
    expect(JSON.parse(JSON.stringify(listQuery({ ...NO_FILTERS, tab: 'sos', theme: 't1', type: 'video' })))).toEqual({
      sos: 'true',
      theme: 't1',
      type: 'video',
    });
    expect(listQuery({ ...NO_FILTERS, tab: 'drafts' })).toMatchObject({ tab: 'drafts' });
  });

  it('tags: comma separated → lower-case list without repeats; limits are checked', () => {
    expect(parseTags(' Work stress, morning ,, MORNING ')).toEqual(['work stress', 'morning']);
    const form = { ...blankSession, title: 'x' };
    expect(
      sessionSchema.safeParse({ ...form, tags: Array.from({ length: 13 }, (_, i) => `t${i}`).join(',') }).error?.issues[0]?.message,
    ).toBe('Use at most 12 tags');
    expect(sessionSchema.safeParse({ ...form, tags: 'x'.repeat(31) }).error?.issues[0]?.message).toBe('A tag can be at most 30 characters');
    expect(sessionSchema.safeParse({ ...form, description: 'x'.repeat(161) }).success).toBe(false);
  });

  it('request body: YouTube is always free with no file; uploads carry no YouTube id', () => {
    const v = sessionSchema.parse({
      ...blankSession,
      title: 'A',
      type: 'youtube',
      access: 'premium',
      youtubeId: 'Qm7r2XyK8aE',
      mediaId: db.media[0]!.id,
      downloadable: true,
    });
    expect(toBody(v)).toMatchObject({
      access: 'free',
      mediaId: null,
      youtubeId: 'Qm7r2XyK8aE',
      downloadable: false,
      themeId: null,
      tags: [],
    });
    expect(toBody(v)).not.toHaveProperty('durationSec');
    const a = sessionSchema.parse({ ...blankSession, title: 'A', youtubeId: 'Qm7r2XyK8aE', mediaId: db.media[0]!.id, durationSec: 600 });
    expect(toBody(a)).toMatchObject({ youtubeId: null, mediaId: db.media[0]!.id, durationSec: 600 });
  });

  it('publish is blocked until there is something to play', () => {
    expect(publishBlocker({ type: 'audio', mediaId: null, youtubeId: null }, false, false)).toBe('Upload the audio file first.');
    expect(publishBlocker({ type: 'video', mediaId: 'm', youtubeId: null }, false, true)).toMatch(/finished uploading/);
    expect(publishBlocker({ type: 'audio', mediaId: 'm', youtubeId: null }, false, false)).toBe('The file is still being processed.');
    expect(publishBlocker({ type: 'audio', mediaId: 'm', youtubeId: null }, true, false)).toBeNull();
    expect(publishBlocker({ type: 'youtube', mediaId: null, youtubeId: null }, false, false)).toBe('Add the YouTube link first.');
    expect(publishBlocker({ type: 'youtube', mediaId: null, youtubeId: 'x' }, false, false)).toBeNull();
  });

  it('labels: length, goes live, the note under the title, title from a file name', () => {
    expect([lengthLabel(900), lengthLabel(20), lengthLabel(0)]).toEqual(['15 min', '1 min', '—']);
    expect(goesLive({ status: 'draft', publishAt: null })).toBe('Not set');
    expect(goesLive({ status: 'live', publishAt: '2026-09-21T05:00:00.000Z' })).toMatch(/^Sep 2[01], 2026$/);
    expect(goesLive({ status: 'scheduled', publishAt: '2030-10-09T05:00:00.000Z' })).toMatch(/^Oct \d+, 2030, \d\d:\d\d$/);
    expect(sessionNote(byTitle('Unconditional Love & Healing'))).toBe('YouTube link');
    expect(sessionNote(byTitle('Anxiety'))).toBe('Audio missing');
    expect(sessionNote(byTitle('Open Awareness & Silence'))).toBe('Cover missing');
    expect(sessionNote(byTitle('Panic'))).toBe('SoS · Panic');
    expect(sessionNote(byTitle('Steady Under Pressure'), 'Raphael Reiter')).toBe('Raphael Reiter');
    expect(titleFromFile('steady_under_pressure-final.wav')).toBe('Steady under pressure final');
    expect(titleFromFile('.wav')).toBe('Untitled');
  });

  it('form values round-trip from a saved meditation', () => {
    const s = byTitle('Steady Under Pressure');
    expect(sessionToForm(s)).toMatchObject({ title: s.title, tags: 'work stress, morning', themeId: s.themeId, durationSec: 900 });
  });
});

describe('Sessions list', () => {
  it('shows every meditation with theme, type, length, access, status and plays, plus the total', async () => {
    openApp('/sessions');
    expect(await h1('Sessions')).toBeInTheDocument();
    await waitFor(() => expect(titles()).toHaveLength(7));
    expect(screen.getByText('7 meditations')).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Steady Under Pressure/ });
    const cells = within(row)
      .getAllByRole('cell')
      .map((c) => c.textContent);
    expect(cells.slice(2, 8)).toEqual(['Breathing', 'Audio', '15 min', 'Premium', 'Published', '4,120']);
    expect(screen.getByRole('row', { name: /Unconditional Love/ })).toHaveTextContent('YouTube40 minFreePublished');
    expect(screen.getByText(/Showing 7 of 7/)).toBeInTheDocument();
    expect(await a11yViolations()).toEqual([]);
  });

  it('tabs filter the list and are kept in the address', async () => {
    const { router } = openApp('/sessions');
    await waitFor(() => expect(titles()).toHaveLength(7));
    await user.click(screen.getByRole('radio', { name: 'Free for you' }));
    await waitFor(() => expect(titles()).toEqual(['Unconditional Love & Healing']));
    expect(router.state.location.search).toBe('?tab=free');
    await user.click(screen.getByRole('radio', { name: 'Drafts' }));
    await waitFor(() => expect(titles()).toEqual(['Open Awareness & Silence', 'Anxiety']));
    await user.click(screen.getByRole('radio', { name: 'SoS' }));
    await waitFor(() => expect(titles()).toEqual(['Panic', 'Anxiety']));
    await user.click(screen.getByRole('radio', { name: 'Scheduled' }));
    await waitFor(() => expect(titles()).toEqual(['Vagus Nerve Reset']));
    expect(screen.getByText('1 meditation')).toBeInTheDocument();
  });

  it('a link with filters opens the filtered list (from "View N meditations" on a theme)', async () => {
    const sleep = db.themes.find((t) => t.name === 'Sleep')!;
    openApp(`/sessions?theme=${sleep.id}`);
    await waitFor(() => expect(titles()).toEqual(['Deep Delta Sleep Descent']));
    expect(screen.getByLabelText('Theme')).toHaveValue(sleep.id);
  });

  it('search waits until typing stops, then asks the API once', async () => {
    const asked: string[] = [];
    server.use(
      http.get(url('/v1/admin/sessions'), ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('q') ?? '');
        return undefined;
      }),
    );
    openApp('/sessions');
    await waitFor(() => expect(titles()).toHaveLength(7));
    await user.type(screen.getByRole('searchbox', { name: 'Search sessions' }), 'vagus');
    await waitFor(() => expect(titles()).toEqual(['Vagus Nerve Reset']));
    expect(asked.filter(Boolean)).toEqual(['vagus']); // not one request per letter
  });

  it('no match: says so and offers to clear the filters', async () => {
    openApp('/sessions?q=zzzz');
    expect(await screen.findByText('No sessions match these filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(titles()).toHaveLength(7));
  });

  it('loads the next page when the end of the list scrolls into view (1,000+ rows stay light)', async () => {
    const { mockId } = await import('../../mocks/content');
    db.sessions = Array.from({ length: 120 }, (_, i) => ({
      ...db.sessions[0]!,
      id: mockId('e'),
      title: `Session ${String(i + 1).padStart(3, '0')}`,
    }));
    const cursors: (string | null)[] = [];
    server.use(
      http.get(url('/v1/admin/sessions'), ({ request }) => {
        cursors.push(new URL(request.url).searchParams.get('cursor'));
        return undefined;
      }),
    );
    openApp('/sessions');
    expect(await screen.findByText(/Showing 50 of 120/)).toBeInTheDocument();
    expect(within(table()).getAllByRole('row').length).toBeLessThan(40); // only the visible rows are in the page
    const scroller = within(table()).getAllByRole('rowgroup')[1]!;
    scroller.scrollTop = 50 * 64;
    fireEvent.scroll(scroller);
    expect(await screen.findByText(/Showing 100 of 120/)).toBeInTheDocument();
    expect(cursors).toEqual([null, '50']);
  });

  it('row menu: duplicate, publish, archive; delete only for drafts and only for owner/admin', async () => {
    openApp('/sessions');
    await waitFor(() => expect(titles()).toHaveLength(7));
    await user.click(screen.getByRole('button', { name: 'More actions for Open Awareness & Silence' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Edit',
      'Duplicate',
      'Publish now',
      'Archive',
      'Delete draft',
    ]);
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(await screen.findByText('Duplicated as a draft')).toBeInTheDocument();
    await waitFor(() => expect(titles()).toContain('Open Awareness & Silence (copy)'));

    await user.click(screen.getByRole('button', { name: 'More actions for Steady Under Pressure' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Edit', 'Duplicate', 'Archive']); // live: no publish, no delete
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(await findToast('Archived')).toBeInTheDocument();
    expect(byTitle('Steady Under Pressure').status).toBe('archived');
  });

  it('publishing from the menu without a file shows the API reason', async () => {
    openApp('/sessions');
    await waitFor(() => expect(titles()).toHaveLength(7));
    await user.click(screen.getByRole('button', { name: 'More actions for Anxiety' }));
    await user.click(screen.getByRole('menuitem', { name: 'Publish now' }));
    expect(await screen.findByText('Upload the audio or video first')).toBeInTheDocument();
    expect(byTitle('Anxiety').status).toBe('draft');
  });

  it('delete draft asks first; an editor has no delete at all', async () => {
    const view = openApp('/sessions');
    await waitFor(() => expect(titles()).toHaveLength(7));
    await user.click(screen.getByRole('button', { name: 'More actions for Anxiety' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete draft' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the draft “Anxiety”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete draft' }));
    expect(await screen.findByText('Draft deleted')).toBeInTheDocument();
    expect(db.sessions.some((s) => s.title === 'Anxiety')).toBe(false);
    view.unmount();

    openApp('/sessions', 'editor');
    await waitFor(() => expect(titles()).toHaveLength(6));
    await user.click(screen.getByRole('button', { name: 'More actions for Open Awareness & Silence' }));
    expect(screen.queryByRole('menuitem', { name: 'Delete draft' })).not.toBeInTheDocument();
  });

  it('bulk publish: reports what worked and what did not, and keeps the failed rows selected', async () => {
    openApp('/sessions?tab=drafts');
    await waitFor(() => expect(titles()).toEqual(['Open Awareness & Silence', 'Anxiety']));
    await user.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
    const bar = screen.getByRole('region', { name: 'Bulk actions' });
    expect(bar).toHaveTextContent('2 selected');
    await user.click(within(bar).getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('1 published, 1 could not be published')).toBeInTheDocument();
    expect(screen.getByText('Upload the audio or video first')).toBeInTheDocument();
    expect(byTitle('Open Awareness & Silence').status).toBe('live');
    await waitFor(() => expect(titles()).toEqual(['Anxiety']));
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('1 selected');
  });

  it('bulk upload: each dropped file becomes a draft with the file attached', async () => {
    openApp('/sessions');
    await waitFor(() => expect(titles()).toHaveLength(7));
    await user.click(screen.getByRole('button', { name: 'Bulk upload' }));
    const dialog = await screen.findByRole('dialog', { name: 'Bulk upload' });
    await user.upload(within(dialog).getByLabelText('Audio or video files'), [
      audioFile('morning_calm.wav'),
      audioFile('evening-rest.wav'),
    ]);
    expect(await within(dialog).findByText('2 of 2 drafts created', undefined, { timeout: 4000 })).toBeInTheDocument();
    const made = db.sessions.filter((s) => ['Morning calm', 'Evening rest'].includes(s.title));
    expect(made).toHaveLength(2);
    expect(made.every((s) => s.status === 'draft' && s.type === 'audio' && !!s.mediaId)).toBe(true);
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1)!); // the footer button (the X is also named Close)
    await waitFor(() => expect(screen.getByText('9 meditations')).toBeInTheDocument());
  });

  it('error state with retry; moderators have no access', async () => {
    server.use(http.get(url('/v1/admin/sessions'), () => fail(400, 'VALIDATION_FAILED', 'Bad filter')));
    const view = openApp('/sessions');
    expect(await screen.findByRole('alert')).toHaveTextContent('Bad filter');
    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(titles()).toHaveLength(7));
    view.unmount();
    openApp('/sessions', 'moderator');
    expect(await screen.findByText('No permission')).toBeInTheDocument();
  });
});

describe('Sessions list, live', () => {
  it('a change by someone else refreshes the list and highlights the row; socket down → says updates are paused', async () => {
    const live = await connectFakeSocket();
    openApp('/sessions');
    await waitFor(() => expect(titles()).toHaveLength(7));
    const s = byTitle('Anxiety');
    s.title = 'Anxiety relief';
    await live.emit('entity:changed', { type: 'session', id: s.id, op: 'update', version: 2, by: { id: 'other', name: 'Lena' } });
    const row = await screen.findByRole('row', { name: /Anxiety relief/ }, { timeout: 3000 });
    expect(row).toHaveClass('bg-ember/10');

    act(() => disconnectSocket());
    expect(await screen.findByText(/live updates paused, refreshing every 30 s/)).toBeInTheDocument();
  });
});

describe('Session editor', () => {
  const open = async (title: string) => {
    const view = openApp(`/sessions/${byTitle(title).id}`);
    await h1(title);
    return view;
  };

  it('opens a meditation with its values, usage and status; passes the a11y check', async () => {
    await open('Steady Under Pressure');
    expect(screen.getByLabelText('Title')).toHaveValue('Steady Under Pressure');
    expect(screen.getByLabelText('Tags')).toHaveValue('work stress, morning');
    expect(screen.getByRole('radio', { name: /^Audio/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Premium' })).toBeChecked();
    expect(await screen.findByText(/15:00 · −16.1 LUFS · 14 MB/)).toBeInTheDocument(); // the attached file
    expect(screen.getByText('7-Day Autonomic Reset · Day 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '128 · view' })).toHaveAttribute(
      'href',
      `/moderation?session=${byTitle('Steady Under Pressure').id}`,
    );
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument(); // already live
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled(); // nothing changed yet
    expect(await a11yViolations()).toEqual([]);
  });

  it('save sends only through PATCH with If-Match and keeps you on the page', async () => {
    let seen: { ifMatch: string | null; body: Record<string, unknown> } | null = null;
    server.use(
      http.patch(url('/v1/admin/sessions/:id'), async ({ request }) => {
        seen = { ifMatch: request.headers.get('if-match'), body: (await request.clone().json()) as Record<string, unknown> };
        return undefined;
      }),
    );
    await open('Open Awareness & Silence');
    await user.type(screen.getByLabelText('Short description'), 'Rest in open awareness.');
    await user.type(screen.getByLabelText('Tags'), 'Silence, DEEP');
    await user.selectOptions(screen.getByLabelText('Teacher'), db.teachers[0]!.id);
    await user.click(screen.getByRole('radio', { name: 'Free' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(seen!.ifMatch).toBe('"v1"');
    expect(seen!.body).toMatchObject({
      description: 'Rest in open awareness.',
      tags: ['silence', 'deep'],
      teacherId: db.teachers[0]!.id,
      access: 'free',
    });
    expect(Object.keys(seen!.body).sort()).toEqual(['access', 'description', 'tags', 'teacherId']); // only what changed
    expect(byTitle('Open Awareness & Silence')).toMatchObject({ version: 2, access: 'free' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('description counter turns red past 160 and the save is refused', async () => {
    await open('Open Awareness & Silence');
    await user.click(screen.getByLabelText('Short description'));
    await user.paste('x'.repeat(170));
    expect(screen.getByText('170 / 160')).toHaveClass('text-danger-text');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('The description can be at most 160 characters')).toBeInTheDocument();
    expect(byTitle('Open Awareness & Silence').version).toBe(1);
  });

  it('409: the conflict dialog shows both versions; nothing is overwritten until I choose', async () => {
    await open('Open Awareness & Silence');
    const title = screen.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Open Awareness (mine)');
    Object.assign(byTitle('Open Awareness & Silence'), { title: 'Open Awareness (theirs)', access: 'free', version: 2 });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'This was changed while you were editing' });
    const rows = within(dialog)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent);
    // only what I changed is in conflict: their change to Access does not touch my edit
    expect(rows).toEqual(['TitleOpen Awareness (theirs)Open Awareness (mine)']);
    expect(byTitle('Open Awareness (theirs)').version).toBe(2);
    await user.click(within(dialog).getByRole('button', { name: 'Use their version' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Title')).toHaveValue('Open Awareness (theirs)');
    expect(screen.getByRole('radio', { name: 'Free' })).toBeChecked();
  });

  it('new meditation: publish is off until a file is uploaded and processed; then save + publish in one click', async () => {
    const { router } = openApp('/sessions/new');
    await h1('New session');
    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(publish).toBeDisabled();
    await user.hover(publish.parentElement!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Upload the audio file first.');

    await user.type(screen.getByLabelText('Title'), 'Morning Reset');
    await user.upload(screen.getByLabelText('Audio file'), audioFile());
    expect(await screen.findByRole('progressbar', { name: /Processing new_take.wav/ }, { timeout: 4000 })).toBeInTheDocument();
    expect(publish).toBeDisabled(); // still processing
    const media = db.media.at(-1)!;
    expect(media).toMatchObject({ name: 'new_take.wav', status: 'processing' });

    // the worker finishes; the job event tells the page
    act(() => finishProcessing(media.id));
    expect(await screen.findByText(/10:00 · −16.2 LUFS/, undefined, { timeout: 5000 })).toBeInTheDocument();
    // (the button is looked up again: without a reason to show, it is no longer wrapped in a tooltip)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await findToast('Published')).toBeInTheDocument();
    const made = byTitle('Morning Reset');
    expect(made).toMatchObject({ status: 'live', mediaId: media.id, type: 'audio', access: 'premium' });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/sessions/${made.id}`));
  });

  it('save draft on a new meditation needs a title and then opens its own page', async () => {
    const { router } = openApp('/sessions/new');
    await h1('New session');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Enter a title')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Title'), 'A draft');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Draft created')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/sessions/${byTitle('A draft').id}`));
    expect(byTitle('A draft')).toMatchObject({ status: 'draft', type: 'audio' });
  });

  it('upload: pause, resume and cancel are offered; a lost connection pauses and says why', async () => {
    let online = false;
    server.use(
      http.put(`${S3}/:id/:part`, ({ params }) =>
        online ? new HttpResponse(null, { status: 200, headers: { etag: `"e${String(params.part)}"` } }) : HttpResponse.error(),
      ),
    );
    openApp('/sessions/new');
    await h1('New session');
    await user.upload(screen.getByLabelText('Audio file'), audioFile());
    expect(await screen.findByText(/Paused · 0% · connection lost/, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel upload' })).toBeInTheDocument();
    online = true;
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(await screen.findByRole('progressbar', { name: /Processing new_take.wav/ }, { timeout: 4000 })).toBeInTheDocument();
  });

  it('a wrong file type is refused before any upload', async () => {
    let started = 0;
    server.use(
      http.post(url('/v1/admin/media/uploads'), () => {
        started += 1;
        return undefined;
      }),
    );
    openApp('/sessions/new');
    await h1('New session');
    fireEvent.change(screen.getByLabelText('Audio file'), {
      target: { files: [new File(['x'], 'notes.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText('notes.pdf: this file type is not supported.')).toBeInTheDocument();
    expect(started).toBe(0);
  });

  it('a loud file and a duplicate file are both called out', async () => {
    openApp('/sessions/new');
    await h1('New session');
    // the mock API reports a duplicate when the checksum starts with "dup" (see the checksum mock at the top)
    await user.upload(screen.getByLabelText('Audio file'), audioFile('dup_take.wav'));
    expect(
      await screen.findByText(/The same file is already in the library as “steady_under_pressure_final.wav”/, undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
    await screen.findByRole('progressbar', { name: /Processing/ }, { timeout: 4000 });
    const media = db.media.at(-1)!;
    act(() =>
      finishProcessing(media.id, {
        loudnessLufs: -11.2,
        job: {
          id: 'j',
          status: 'done',
          progress: 100,
          error: null,
          result: { lufs: -11.2, loudnessWarning: 'Loudness -11.2 LUFS is outside −16 ±1' },
        },
      }),
    );
    expect(await screen.findByText(/Loudness -11.2 LUFS is outside −16 ±1/, undefined, { timeout: 5000 })).toBeInTheDocument();
  });

  it('YouTube: pasting a link fills title, length and thumbnail; it is always free', async () => {
    let created: Record<string, unknown> | null = null;
    server.use(
      http.post(url('/v1/admin/sessions'), async ({ request }) => {
        created = (await request.clone().json()) as Record<string, unknown>;
        return undefined;
      }),
    );
    openApp('/sessions/new');
    await h1('New session');
    await user.click(screen.getByRole('radio', { name: /YouTube link/ }));
    expect(screen.getByText('Free for everyone. No download needed.')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Access level' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('YouTube link'), 'https://www.youtube.com/watch?v=Qm7r2XyK8aE');
    await user.click(screen.getByRole('button', { name: 'Check link' }));
    expect(await screen.findByText(/Title, length and thumbnail filled from YouTube · 40:00/)).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Guided Meditation for Unconditional Love & Healing');
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await findToast('Published')).toBeInTheDocument();
    expect(created).toMatchObject({ type: 'youtube', access: 'free', youtubeId: 'Qm7r2XyK8aE', mediaId: null, durationSec: 2400, coverUrl: 'https://i.ytimg.com/vi/Qm7r2XyK8aE/hqdefault.jpg', downloadable: false }); // prettier-ignore
  });

  it('YouTube: a private or removed video is refused with the reason', async () => {
    openApp('/sessions/new');
    await h1('New session');
    await user.click(screen.getByRole('radio', { name: /YouTube link/ }));
    await user.type(screen.getByLabelText('YouTube link'), 'https://youtu.be/private0001');
    await user.click(screen.getByRole('button', { name: 'Check link' }));
    expect(await screen.findByText('This video is private, removed or cannot be embedded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  });

  it('schedule: a future time schedules; a past time asks "Publish now?"', async () => {
    await open('Open Awareness & Silence');
    const when = screen.getByLabelText(/Show in the library from/);
    fireEvent.change(when, { target: { value: '2031-01-15T07:00' } });
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(await screen.findByText(/^Scheduled for Jan 15, 2031, 07:00$/)).toBeInTheDocument();
    expect(byTitle('Open Awareness & Silence')).toMatchObject({
      status: 'scheduled',
      publishAt: new Date('2031-01-15T07:00').toISOString(),
    });

    fireEvent.change(screen.getByLabelText(/Show in the library from/), { target: { value: '2020-01-01T07:00' } });
    await user.click(screen.getByRole('button', { name: 'Reschedule' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish now?' });
    await user.click(within(dialog).getByRole('button', { name: 'Publish now' }));
    await waitFor(() => expect(byTitle('Open Awareness & Silence').status).toBe('live'));
  });

  it('archive refused because it is a coming meditation of the day: the dates are shown', async () => {
    server.use(
      http.post(url('/v1/admin/sessions/:id/archive'), () =>
        fail(409, 'IN_USE', 'This meditation is the meditation of the day on a coming date. Change that first.', {
          motdDates: ['2030-10-12'],
        }),
      ),
    );
    await open('Steady Under Pressure');
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(await screen.findByText(/meditation of the day on a coming date/)).toBeInTheDocument();
    expect(screen.getByText('Dates: Oct 12, 2030')).toBeInTheDocument();
    expect(byTitle('Steady Under Pressure').status).toBe('live');
  });

  it('a published meditation keeps its type', async () => {
    await open('Steady Under Pressure');
    expect(screen.getByRole('radio', { name: /^Video/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /YouTube link/ })).toBeDisabled();
  });

  it('missing meditation: says so, with a way back', async () => {
    openApp('/sessions/e0000000-0000-7000-8000-999999999999');
    expect(await screen.findByText('This session does not exist any more')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sessions' })).toHaveAttribute('href', '/sessions');
  });

  it('unsaved changes: the browser is asked to warn before leaving', async () => {
    await open('Open Awareness & Silence');
    const leave = () => {
      const ev = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(leave()).toBe(false);
    await user.type(screen.getByLabelText('Title'), '!');
    expect(leave()).toBe(true);
  });
});

describe('Session editor, live', () => {
  it('presence banner; someone else saves → "This session changed" with reload, my edits stay until I choose', async () => {
    const live = await connectFakeSocket();
    const s = byTitle('Open Awareness & Silence');
    openApp(`/sessions/${s.id}`);
    await h1('Open Awareness & Silence');
    await waitFor(() => expect(live.socket.sent('editing:start')).toContainEqual({ type: 'session', id: s.id }));
    await live.emit('editing:presence', { type: 'session', id: s.id, admins: [{ id: 'other', name: 'Raphael' }] });
    expect(screen.getByText('Raphael is editing this session too.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Tags'), 'mine');
    Object.assign(s, { title: 'Renamed by Raphael', version: 2 });
    await live.emit('entity:changed', { type: 'session', id: s.id, op: 'update', version: 2, by: { id: 'other', name: 'Raphael' } });
    expect(await screen.findByText(/This session changed: Raphael saved it/)).toBeInTheDocument();
    expect(screen.getByLabelText('Tags')).toHaveValue('mine'); // not thrown away
    expect(screen.getByLabelText('Title')).toHaveValue('Open Awareness & Silence');

    await user.click(screen.getByRole('button', { name: 'Reload their version' }));
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Renamed by Raphael'));
    expect(screen.queryByText(/This session changed/)).not.toBeInTheDocument();
  });

  it('processing progress arrives over the socket', async () => {
    const live = await connectFakeSocket();
    openApp('/sessions/new');
    await h1('New session');
    await user.upload(screen.getByLabelText('Audio file'), audioFile());
    await screen.findByRole('progressbar', { name: /Processing/ }, { timeout: 4000 });
    const media = db.media.at(-1)!;
    await waitFor(() => expect(live.socket.sent('subscribe')).toContainEqual({ channels: ['jobs'] }));
    await live.emit('job:progress', { id: media.job!.id, type: 'media_transcode', status: 'running', progress: 55 });
    expect(await screen.findByText('Processing · 55%')).toBeInTheDocument();
    act(() => finishProcessing(media.id));
    await live.emit('job:progress', { id: media.job!.id, type: 'media_transcode', status: 'done', progress: 100 });
    expect(await screen.findByText(/10:00 · −16.2 LUFS/)).toBeInTheDocument();
  });
});
