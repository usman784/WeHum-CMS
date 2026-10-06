import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disconnectSocket } from '../../lib/socket';
import { db } from '../../mocks/content';
import { fail, mockAdmin, url } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { connectFakeSocket, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { conflictingFields } from '../../ui/ConflictDialog';
import { themeSchema, type Theme } from './api';
import { themeStats } from './Page';
import { instagramHandle, teacherSchema, toInstagramUrl, toUrl } from '../teachers/api';

vi.mock('socket.io-client', async () => ({ io: (await import('../../test/fake-socket')).fakeIo }));
afterEach(() => disconnectSocket());

const user = userEvent.setup();
const cards = () => within(screen.getByRole('list', { name: 'Theme order' })).getAllByRole('button', { pressed: undefined }).filter((b) => b.hasAttribute('aria-pressed')); // prettier-ignore
const editor = () => screen.getByRole('complementary', { name: /theme$/i });

describe('theme helpers', () => {
  it('themeStats: count and length range, singular and empty cases', () => {
    expect(themeStats({ sessionCount: 14, minDurationSec: 1200, maxDurationSec: 2700 })).toBe('14 meditations · 20–45 min');
    expect(themeStats({ sessionCount: 1, minDurationSec: 600, maxDurationSec: 600 })).toBe('1 meditation · 10 min');
    expect(themeStats({ sessionCount: 0, minDurationSec: null, maxDurationSec: null })).toBe('0 meditations');
  });

  it('schema: name required, empty text becomes null, limits enforced', () => {
    const ok = themeSchema.parse({ name: '  Sleep ', subtitle: ' ', description: '', iconKey: 'moon', visible: true });
    expect(ok).toEqual({ name: 'Sleep', subtitle: null, description: null, iconKey: 'moon', visible: true });
    expect(
      themeSchema.safeParse({ name: ' ', subtitle: '', description: '', iconKey: null, visible: true }).error?.issues[0]?.message,
    ).toBe('Enter a name');
    expect(themeSchema.safeParse({ name: 'x'.repeat(61), subtitle: '', description: '', iconKey: null, visible: true }).success).toBe(
      false,
    );
  });

  it('conflictingFields lists only the fields I changed that differ from the server', () => {
    const theirs = { name: 'Sleep', subtitle: 'Rest', visible: true } as Theme;
    const fields = [
      { key: 'name' as const, label: 'Name' },
      { key: 'subtitle' as const, label: 'Subtitle' },
      { key: 'visible' as const, label: 'Visible' },
    ];
    expect(conflictingFields({ name: 'Sleep well', subtitle: 'Rest' }, theirs, fields).map((f) => f.key)).toEqual(['name']);
    expect(conflictingFields({ visible: true }, theirs, fields)).toEqual([]);
  });
});

describe('Themes screen', () => {
  it('lists themes in app order with counts, opens the first one, and passes the a11y check', async () => {
    openApp('/themes');
    expect(await h1('Themes')).toBeInTheDocument();
    await screen.findByRole('list', { name: 'Theme order' });
    expect(cards().map((c) => within(c).getByText(/meditation/).textContent)).toEqual([
      '1 meditation · 18 min',
      '1 meditation · 40 min',
      '4 meditations · 4–15 min',
      '1 meditation · 45 min',
    ]);
    expect(screen.getByText(/The 4 practice categories in the Library/)).toBeInTheDocument();
    expect(within(editor()).getByLabelText('Name')).toHaveValue('Transcendent');
    expect(within(editor()).getByRole('radio', { name: 'Sun' })).toBeChecked();
    expect(await a11yViolations()).toEqual([]);
  });

  it('edit: saves with the version in If-Match and shows the new name in the list', async () => {
    let ifMatch: string | null = null;
    let body: unknown;
    const realPatch = http.patch(url('/v1/admin/themes/:id'), async ({ request }) => {
      ifMatch = request.headers.get('if-match');
      body = await request.clone().json();
      return undefined; // fall through to the mock API
    });
    server.use(realPatch);
    openApp('/themes');
    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Stillness');
    await user.click(within(editor()).getByRole('radio', { name: 'Mountain' }));
    await user.click(within(editor()).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Theme saved')).toBeInTheDocument();
    expect(ifMatch).toBe('"v1"');
    expect(body).toMatchObject({ name: 'Stillness', iconKey: 'mountain', visible: true, subtitle: 'Go beyond thought' });
    expect(cards()[0]).toHaveTextContent('Stillness');
    expect(db.themes[0]).toMatchObject({ name: 'Stillness', version: 2 });
  });

  it('checks the form first; an API field error lands on the field', async () => {
    openApp('/themes');
    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.click(within(editor()).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a name')).toBeInTheDocument();
    server.use(
      http.patch(url('/v1/admin/themes/:id'), () =>
        fail(400, 'VALIDATION_FAILED', 'Invalid input', { fields: [{ path: 'name', message: 'Already used' }] }),
      ),
    );
    await user.type(name, 'Sleep');
    await user.click(within(editor()).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Already used')).toBeInTheDocument();
  });

  it('409: someone else saved first → both versions are shown; "Keep my changes" saves on top of theirs', async () => {
    openApp('/themes');
    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'My name');
    // meanwhile another admin renames it and hides it
    Object.assign(db.themes[0]!, { name: 'Their name', visible: false, version: 2 });
    await user.click(within(editor()).getByRole('button', { name: 'Save' }));

    const dialog = await screen.findByRole('dialog', { name: 'This was changed while you were editing' });
    const rows = within(dialog).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent)); // prettier-ignore
    expect(rows).toEqual([
      ['Their name', 'My name'],
      ['No', 'Yes'],
    ]);
    expect(
      within(dialog)
        .getAllByRole('rowheader')
        .map((r) => r.textContent),
    ).toEqual(['Name', 'Visible in app']);
    expect(db.themes[0]!.name).toBe('Their name'); // nothing was overwritten silently
    expect(await a11yViolations(dialog)).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Keep my changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(db.themes[0]).toMatchObject({ name: 'My name', visible: true, version: 3 });
  });

  it('409: "Use their version" drops my edit and loads theirs into the form', async () => {
    openApp('/themes');
    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'My name');
    Object.assign(db.themes[0]!, { name: 'Their name', version: 2 });
    await user.click(within(editor()).getByRole('button', { name: 'Save' }));
    await user.click(await screen.findByRole('button', { name: 'Use their version' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Name')).toHaveValue('Their name');
    expect(db.themes[0]).toMatchObject({ name: 'Their name', version: 2 });
    expect(cards()[0]).toHaveTextContent('Their name');
  });

  it('new theme: created, added to the list and opened', async () => {
    openApp('/themes');
    await screen.findByLabelText('Name');
    await user.click(screen.getByRole('button', { name: 'New theme' }));
    const form = screen.getByRole('complementary', { name: 'New theme' });
    await user.type(within(form).getByLabelText('Name'), 'Gratitude');
    await user.type(within(form).getByLabelText('Subtitle'), 'Count your blessings');
    await user.click(within(form).getByRole('button', { name: 'Create theme' }));
    expect(await screen.findByText('Theme created')).toBeInTheDocument();
    expect(cards()).toHaveLength(5);
    expect(await screen.findByRole('complementary', { name: 'Edit theme' })).toHaveTextContent('0 meditations');
    expect(db.themes.at(-1)).toMatchObject({ name: 'Gratitude', subtitle: 'Count your blessings' });
  });

  it('reorder with the keyboard: the list changes at once and the new order is sent', async () => {
    const rect = (top: number) => ({
      top,
      bottom: top + 86,
      left: 0,
      right: 300,
      width: 300,
      height: 86,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const li = this.closest('li');
      return rect(li ? [...(li.parentElement?.children ?? [])].indexOf(li) * 86 : 0) as DOMRect;
    });
    let sent: unknown;
    server.use(
      http.put(url('/v1/admin/themes/order'), async ({ request }) => {
        sent = await request.clone().json();
        return undefined;
      }),
    );
    openApp('/themes');
    const before = (await screen.findAllByRole('button', { name: /^Reorder / })).map((b) => b.getAttribute('aria-label'));
    expect(before).toEqual(['Reorder Transcendent', 'Reorder Loving Kindness', 'Reorder Breathing', 'Reorder Sleep']);
    const ids = db.themes.map((t) => t.id);
    screen.getByRole('button', { name: 'Reorder Transcendent' }).focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');
    await waitFor(() => expect(sent).toEqual({ ids: [ids[1], ids[0], ids[2], ids[3]] }));
    expect(screen.getAllByRole('button', { name: /^Reorder / }).map((b) => b.getAttribute('aria-label'))[0]).toBe(
      'Reorder Loving Kindness',
    );
  });

  it('a refused reorder puts the list back and says so', async () => {
    const rect = (top: number) => ({
      top,
      bottom: top + 86,
      left: 0,
      right: 300,
      width: 300,
      height: 86,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const li = this.closest('li');
      return rect(li ? [...(li.parentElement?.children ?? [])].indexOf(li) * 86 : 0) as DOMRect;
    });
    server.use(http.put(url('/v1/admin/themes/order'), () => fail(500, 'INTERNAL', 'Boom')));
    openApp('/themes');
    (await screen.findByRole('button', { name: 'Reorder Transcendent' })).focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');
    expect(await screen.findByText('Boom')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Reorder / }).map((b) => b.getAttribute('aria-label'))[0]).toBe('Reorder Transcendent'),
    );
  });

  it('delete: a theme in use asks where to move its meditations, then moves them', async () => {
    openApp('/themes');
    await screen.findByLabelText('Name');
    await user.click(screen.getByRole('button', { name: /Breathing/, pressed: false }));
    await user.click(within(editor()).getByRole('button', { name: 'Delete theme' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete “Breathing”?' });
    expect(dialog).toHaveTextContent('4 meditations use this theme');
    await user.click(within(dialog).getByRole('button', { name: 'Move and delete' }));
    expect(await screen.findByText('Choose a theme to move the meditations to.')).toBeInTheDocument();
    expect(db.themes).toHaveLength(4);

    const sleep = db.themes.find((t) => t.name === 'Sleep')!;
    await user.selectOptions(within(dialog).getByLabelText('Move meditations to'), sleep.id);
    expect(within(dialog).queryByRole('option', { name: 'Breathing' })).not.toBeInTheDocument(); // not onto itself
    await user.click(within(dialog).getByRole('button', { name: 'Move and delete' }));
    expect(await screen.findByText('Theme deleted')).toBeInTheDocument();
    expect(db.themes.map((t) => t.name)).not.toContain('Breathing');
    expect(db.sessions.filter((s) => s.themeId === sleep.id)).toHaveLength(5);
    await waitFor(() => expect(cards()).toHaveLength(3));
  });

  it('delete: an empty theme needs no target', async () => {
    db.sessions = db.sessions.filter((s) => s.themeId !== db.themes[0]!.id);
    openApp('/themes');
    await screen.findByLabelText('Name');
    await user.click(within(editor()).getByRole('button', { name: 'Delete theme' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('No meditation uses this theme');
    await user.click(within(dialog).getByRole('button', { name: 'Delete theme' }));
    expect(await screen.findByText('Theme deleted')).toBeInTheDocument();
  });

  it('loading error shows the message, the trace id and a retry that works', async () => {
    // a 4xx answer is final (5xx answers are retried twice before the error shows)
    server.use(http.get(url('/v1/admin/themes'), () => fail(400, 'VALIDATION_FAILED', 'The server could not load themes.')));
    openApp('/themes');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The server could not load themes.');
    expect(alert).toHaveTextContent('Reference: trace-mock-1');
    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Theme order' })).toBeInTheDocument();
  });

  it('an editor may open the screen; a moderator gets "No permission"', async () => {
    openApp('/themes', 'moderator');
    expect(await screen.findByText('No permission')).toBeInTheDocument();
  });
});

describe('Themes screen, live', () => {
  it('shows who else is editing, and warns when they save', async () => {
    const live = await connectFakeSocket();
    openApp('/themes');
    await screen.findByLabelText('Name');
    const id = db.themes[0]!.id;
    await waitFor(() => expect(live.socket.sent('editing:start')).toContainEqual({ type: 'theme', id }));

    await live.emit('editing:presence', { type: 'theme', id, admins: [{ id: mockAdmin('owner').id, name: 'Raphael Reiter' }, { id: 'other', name: 'Lena' }] }); // prettier-ignore
    expect(within(editor()).getByRole('status')).toHaveTextContent('Lena is editing this theme too.');

    await live.emit('entity:changed', { type: 'theme', id, op: 'update', version: 2, by: { id: 'other', name: 'Lena' } });
    expect(within(editor()).getByRole('alert')).toHaveTextContent('Lena just saved this theme.');

    // picking another theme tells the server I left the first one
    await user.click(screen.getByRole('button', { name: /Sleep/, pressed: false }));
    await waitFor(() => expect(live.socket.sent('editing:stop')).toContainEqual({ type: 'theme', id }));
  });

  it('my own save does not warn me', async () => {
    const live = await connectFakeSocket();
    openApp('/themes');
    await screen.findByLabelText('Name');
    await live.emit('entity:changed', {
      type: 'theme',
      id: db.themes[0]!.id,
      op: 'update',
      version: 2,
      by: { id: mockAdmin('owner').id, name: 'Raphael Reiter' },
    });
    expect(within(editor()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a theme changed by someone else is re-read and highlighted for a moment', async () => {
    const live = await connectFakeSocket();
    openApp('/themes');
    await screen.findByLabelText('Name');
    const sleep = db.themes.find((t) => t.name === 'Sleep')!;
    sleep.name = 'Deep Sleep';
    await live.emit('entity:changed', { type: 'theme', id: sleep.id, op: 'update', version: 2, by: { id: 'other', name: 'Lena' } });
    const card = await screen.findByRole('button', { name: /Deep Sleep/, pressed: false }, { timeout: 3000 });
    expect(card).toHaveClass('bg-ember/10');
  });
});

describe('teacher helpers', () => {
  it('links: adds https, refuses things that are not addresses', () => {
    expect(toUrl('youtube.com/raphaelreiter')).toBe('https://youtube.com/raphaelreiter');
    expect(toUrl(' https://wehum.app/ ')).toBe('https://wehum.app');
    expect(toUrl('')).toBeNull();
    expect(toUrl('just words')).toBeNull();
  });

  it('Instagram: handle or link in, profile link out, and back to a handle for the form', () => {
    expect(toInstagramUrl('@raphael.meditates')).toBe('https://instagram.com/raphael.meditates');
    expect(toInstagramUrl('raphael')).toBe('https://instagram.com/raphael');
    expect(toInstagramUrl('https://www.instagram.com/raphael')).toBe('https://www.instagram.com/raphael');
    expect(toInstagramUrl('https://example.com/raphael')).toBeNull();
    expect(instagramHandle('https://instagram.com/raphael.meditates')).toBe('@raphael.meditates');
    expect(instagramHandle(null)).toBe('');
  });

  it('schema: bad links are reported on their field', () => {
    const base = { name: 'Raphael', role: '', specialty: '', bio: '', quote: '', youtubeUrl: '', instagramUrl: '', websiteUrl: '', photoMediaId: null, visible: true, canLeadGroup: false }; // prettier-ignore
    expect(teacherSchema.parse(base)).toMatchObject({ role: null, youtubeUrl: null, instagramUrl: null });
    const bad = teacherSchema.safeParse({ ...base, websiteUrl: 'not a link', instagramUrl: 'two words' });
    expect(bad.error?.issues.map((i) => i.path[0])).toEqual(['instagramUrl', 'websiteUrl']);
  });
});

describe('Teachers screen', () => {
  const profile = () => screen.getByRole('region', { name: /teacher/i });

  it('shows the teacher with counts, the Instagram handle and no a11y violations', async () => {
    openApp('/teachers');
    expect(await h1('Teachers')).toBeInTheDocument();
    expect(await screen.findByLabelText('Display name')).toHaveValue('Raphael Reiter');
    expect(screen.getByLabelText('Instagram handle')).toHaveValue('@raphael.meditates');
    expect(within(screen.getByRole('list', { name: 'Teachers' })).getByText('4 meditations')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Can lead group meditations' })).toBeChecked();
    expect(await a11yViolations()).toEqual([]);
  });

  it('edit: handle and bare links are stored as full links', async () => {
    openApp('/teachers');
    const insta = await screen.findByLabelText('Instagram handle');
    await user.clear(insta);
    await user.type(insta, '@raphael');
    await user.type(screen.getByLabelText('Website'), 'wehum.app');
    await user.click(within(profile()).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Teacher saved')).toBeInTheDocument();
    expect(db.teachers[0]).toMatchObject({ instagramUrl: 'https://instagram.com/raphael', websiteUrl: 'https://wehum.app', version: 2 });
  });

  it('a bad link is refused before any request', async () => {
    openApp('/teachers');
    await user.type(await screen.findByLabelText('Website'), 'not a link');
    await user.click(within(profile()).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a web address, for example https://example.com')).toBeInTheDocument();
    expect(db.teachers[0]!.version).toBe(1);
  });

  it('add teacher: appears in the list, sorted by name, and is opened', async () => {
    openApp('/teachers');
    await screen.findByLabelText('Display name');
    await user.click(screen.getByRole('button', { name: 'Add teacher' }));
    await user.type(screen.getByLabelText('Display name'), 'Coach Sarah D.');
    await user.type(screen.getByLabelText('Role label'), 'Performance Coach');
    await user.click(within(profile()).getByRole('button', { name: 'Add teacher' }));
    expect(await screen.findByText('Teacher added')).toBeInTheDocument();
    const list = within(screen.getByRole('list', { name: 'Teachers' })).getAllByRole('button');
    expect(list.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(list[0]).toHaveTextContent('Coach Sarah D.Performance Coach0 meditations');
  });

  it('409 on save opens the conflict dialog with the differing fields', async () => {
    openApp('/teachers');
    const role = await screen.findByLabelText('Role label');
    await user.clear(role);
    await user.type(role, 'Founder');
    Object.assign(db.teachers[0]!, { role: 'Lead Teacher', version: 2 });
    await user.click(within(profile()).getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'This was changed while you were editing' });
    expect(
      within(dialog)
        .getAllByRole('rowheader')
        .map((r) => r.textContent),
    ).toEqual(['Role label']);
    await user.click(within(dialog).getByRole('button', { name: 'Keep my changes' }));
    await waitFor(() => expect(db.teachers[0]).toMatchObject({ role: 'Founder', version: 3 }));
  });
});
