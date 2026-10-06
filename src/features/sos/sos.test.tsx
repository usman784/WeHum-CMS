import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disconnectSocket } from '../../lib/socket';
import { db } from '../../mocks/content';
import { daily } from '../../mocks/daily';
import { fail, url } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { findToast, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { sosErrors, type SosValue } from './api';

vi.mock('socket.io-client', async () => ({ io: (await import('../../test/fake-socket')).fakeIo }));
afterEach(() => disconnectSocket());

const user = userEvent.setup();
const tiles = () => within(screen.getByRole('list', { name: 'SoS tiles' })).getAllByRole('listitem');
const idOf = (title: string) => db.sessions.find((s) => s.title === title)!.id;

const valid = (): SosValue => ({
  title: 'How can I help?',
  subtitle: '',
  help: { title: 'Need more help?', body: '', bookingUrl: 'https://wehum.app/book', contactEmail: 'support@wehum.app' },
});

describe('SoS helpers', () => {
  it('sosErrors uses the limits of the API', () => {
    expect(sosErrors(valid())).toEqual({});
    const bad = { ...valid(), title: ' ', help: { ...valid().help, bookingUrl: 'wehum.app', contactEmail: 'nope' } };
    expect(sosErrors(bad)).toEqual({
      title: 'Enter a title',
      bookingUrl: 'Enter a link that starts with https://',
      contactEmail: 'Enter a valid email address',
    });
    expect(sosErrors({ ...valid(), subtitle: 'x'.repeat(121) }).subtitle).toBe('At most 120 characters');
  });
});

describe('SoS screen', () => {
  it('lists the tiles in order with feeling, session, length and status; passes the a11y check', async () => {
    openApp('/sos');
    expect(await h1('SoS sessions')).toBeInTheDocument();
    await screen.findByRole('list', { name: 'SoS tiles' });
    expect(tiles()).toHaveLength(2);
    expect(tiles()[0]).toHaveTextContent('Panic');
    expect(tiles()[0]).toHaveTextContent('Grounding in four minutes');
    expect(tiles()[0]).toHaveTextContent('4 min');
    expect(tiles()[0]).toHaveTextContent('Live');
    expect(tiles()[1]).toHaveTextContent('Anxiety');
    expect(tiles()[1]).toHaveTextContent('Draft, not in the app'); // it is a tile, but nothing plays yet
    expect(screen.getByLabelText('Title')).toHaveValue('How can I help?');
    expect(screen.getByLabelText('Booking link')).toHaveValue('https://wehum.app/book');
    expect(await a11yViolations()).toEqual([]);
  });

  it('remove a tile: the order is sent without it', async () => {
    openApp('/sos');
    await screen.findByRole('list', { name: 'SoS tiles' });
    await user.click(screen.getByRole('button', { name: 'Remove Anxiety from SoS' }));
    expect(await findToast('Anxiety is no longer a SoS tile')).toBeInTheDocument();
    expect(daily.tiles).toEqual([idOf('Panic')]);
    expect(tiles()).toHaveLength(1);
  });

  it('add a session: only published meditations that are not tiles yet can be picked', async () => {
    openApp('/sos');
    await screen.findByRole('list', { name: 'SoS tiles' });
    await user.click(screen.getByRole('button', { name: 'Add SoS session' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a SoS session' });
    await within(dialog).findByRole('list', { name: 'Meditations' });
    expect(within(dialog).getByRole('button', { name: /Open Awareness & Silence/ })).toBeDisabled(); // a draft
    expect(within(dialog).getByRole('button', { name: /Panic/ })).toBeDisabled(); // already a tile
    expect(within(dialog).getByRole('button', { name: /Unconditional Love/ })).toBeDisabled(); // YouTube
    await user.click(within(dialog).getByRole('button', { name: /Deep Delta Sleep Descent/ }));
    await waitFor(() => expect(daily.tiles).toEqual([idOf('Panic'), idOf('Anxiety'), idOf('Deep Delta Sleep Descent')]));
    expect(await findToast(/is now a SoS tile/)).toBeInTheDocument();
    expect(tiles()).toHaveLength(3);
  });

  it('a refused change puts the list back and says why', async () => {
    server.use(http.put(url('/v1/admin/sos/order'), () => fail(404, 'NOT_FOUND', 'Unknown meditation in the list')));
    openApp('/sos');
    await screen.findByRole('list', { name: 'SoS tiles' });
    await user.click(screen.getByRole('button', { name: 'Remove Anxiety from SoS' }));
    expect(await findToast('Unknown meditation in the list')).toBeInTheDocument();
    await waitFor(() => expect(tiles()).toHaveLength(2)); // the tile is back
    expect(daily.tiles).toHaveLength(2);
  });

  it('the header text and the help card: checked before sending, saved as one document', async () => {
    openApp('/sos');
    await screen.findByRole('list', { name: 'SoS tiles' });
    const save = screen.getByRole('button', { name: 'Save texts' });
    expect(save).toBeDisabled();
    await user.clear(screen.getByLabelText('Contact email'));
    await user.type(screen.getByLabelText('Contact email'), 'nope');
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.clear(screen.getByLabelText('Contact email'));
    await user.type(screen.getByLabelText('Contact email'), 'hello@wehum.app');
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'How can we help?');
    await user.click(save);
    expect(await findToast('SoS texts saved')).toBeInTheDocument();
    expect(daily.sos).toMatchObject({
      version: 2,
      value: { title: 'How can we help?', help: { contactEmail: 'hello@wehum.app', bookingUrl: 'https://wehum.app/book' } },
    });
  });

  it('409 on the texts: their version and mine are shown, nothing is overwritten', async () => {
    openApp('/sos');
    await screen.findByRole('list', { name: 'SoS tiles' });
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Mine');
    daily.sos = { ...daily.sos, version: 2, value: { ...daily.sos.value, title: 'Theirs', subtitle: 'Edited elsewhere.' } };
    await user.click(screen.getByRole('button', { name: 'Save texts' }));
    const dialog = await screen.findByRole('dialog', { name: 'This was changed while you were editing' });
    expect(within(dialog).getByRole('row', { name: /Title/ })).toHaveTextContent('TheirsMine');
    await user.click(within(dialog).getByRole('button', { name: 'Keep my changes' }));
    await waitFor(() => expect(daily.sos).toMatchObject({ version: 3, value: { title: 'Mine', subtitle: 'Edited elsewhere.' } }));
  });

  it('a moderator has no SoS screen', async () => {
    openApp('/sos', 'moderator');
    expect(await screen.findByText('No permission')).toBeInTheDocument();
  });
});
