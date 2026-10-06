import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { insights } from '../../mocks/insights';
import { findToast, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { actionLabel, semverOk } from './api';

const save = () => screen.getByRole('button', { name: 'Save changes' });

describe('Settings', () => {
  it('general settings: change and save; passes the a11y check', async () => {
    openApp('/settings');
    expect(await h1('Settings')).toBeInTheDocument();
    const email = await screen.findByRole('textbox', { name: 'Support email' });
    expect(save()).toBeDisabled();
    await userEvent.clear(email);
    await userEvent.type(email, 'help@wehum.app');
    expect(save()).toBeEnabled();
    expect(await a11yViolations()).toEqual([]);
    await userEvent.click(save());
    expect(await findToast('Settings saved')).toBeInTheDocument();
    expect(insights.main.value.supportEmail).toBe('help@wehum.app');
  });

  it('app & releases: min versions are checked, flags switch, maintenance mode', async () => {
    const { router } = openApp('/settings?tab=releases');
    const ios = await screen.findByRole('textbox', { name: 'Minimum iOS version' });
    await userEvent.clear(ios);
    await userEvent.type(ios, '1.2');
    expect(screen.getByText('Use x.y.z, e.g. 1.2.0')).toBeInTheDocument();
    expect(save()).toBeDisabled();
    await userEvent.type(ios, '.0');
    await userEvent.click(screen.getByRole('switch', { name: 'Gratitude feed' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Maintenance mode' }));
    await userEvent.click(save());
    expect(await findToast('Settings saved')).toBeInTheDocument();
    expect(insights.main.value).toMatchObject({ minVersion: { ios: '1.2.0' }, maintenance: true, features: { gratitude: true } });
    expect(router.state.location.search).toBe('?tab=releases');
  });

  it('legal: https links only; saves the legal document', async () => {
    openApp('/settings?tab=legal');
    const privacy = await screen.findByRole('textbox', { name: 'Privacy policy URL' });
    await userEvent.clear(privacy);
    await userEvent.type(privacy, 'http://insecure.example');
    expect(screen.getByText('Use an https:// link')).toBeInTheDocument();
    expect(save()).toBeDisabled();
    await userEvent.clear(privacy);
    await userEvent.type(privacy, 'https://wehum.app/privacy-2026');
    await userEvent.click(save());
    expect(await findToast('Legal settings saved')).toBeInTheDocument();
    expect(insights.legal.value.privacyUrl).toBe('https://wehum.app/privacy-2026');
  });

  it('409: someone saved first; "Keep my changes" puts mine on top of theirs', async () => {
    openApp('/settings');
    const email = await screen.findByRole('textbox', { name: 'Support email' });
    await userEvent.clear(email);
    await userEvent.type(email, 'mine@wehum.app');
    insights.main = { ...insights.main, version: 3, value: { ...insights.main.value, defaultReminderTime: '08:00' } };
    await userEvent.click(save());
    const dialog = await screen.findByRole('dialog', { name: 'This was changed while you were editing' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep my changes' }));
    await waitFor(() => expect(insights.main.value).toMatchObject({ supportEmail: 'mine@wehum.app', defaultReminderTime: '08:00' }));
  });

  it('team: lists members with role, last sign-in and 2-step; role descriptions', async () => {
    openApp('/settings?tab=team');
    const table = await screen.findByRole('table', { name: 'Team members' });
    expect(within(table).getByText('Lena Fischer')).toBeInTheDocument();
    expect(within(table).getByText('Invite pending')).toBeInTheDocument();
    expect(within(table).getByRole('combobox', { name: 'Role of Raphael Reiter' })).toBeDisabled(); // myself
    expect(screen.getByRole('list', { name: 'What each role can do' })).toHaveTextContent('Dedications queue only');
    expect(await a11yViolations()).toEqual([]);
  });

  it('team: change a role, invite, disable and remove', async () => {
    openApp('/settings?tab=team');
    await screen.findByRole('table', { name: 'Team members' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Role of Lena Fischer' }), 'admin');
    expect(await findToast('Lena Fischer is now admin')).toBeInTheDocument();
    expect(insights.calls).toContainEqual({ method: 'PATCH', path: '/team/admin-editor', body: { role: 'admin' } });

    await userEvent.click(screen.getByRole('button', { name: '+ Invite member' }));
    const dialog = screen.getByRole('dialog', { name: 'Invite a team member' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Email' }), 'new@wehum.app');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Role' }), 'moderator');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    expect(await findToast('Invitation sent')).toBeInTheDocument();
    expect(insights.calls).toContainEqual({ method: 'POST', path: '/team/invite', body: { email: 'new@wehum.app', role: 'moderator' } });

    await userEvent.click(screen.getByRole('button', { name: 'More actions for Usman' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Disable' }));
    expect(await findToast('Usman is signed out and disabled')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'More actions for Jonas Weber' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove from team' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    expect(await findToast('Jonas Weber removed from the team')).toBeInTheDocument();
  });

  it('an admin cannot change owners or invite an owner', async () => {
    openApp('/settings?tab=team', 'admin');
    const table = await screen.findByRole('table', { name: 'Team members' });
    expect(within(table).getByRole('combobox', { name: 'Role of Raphael Reiter' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'More actions for Raphael Reiter' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ Invite member' }));
    const roles = within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Role' });
    expect(within(roles).queryByRole('option', { name: 'Owner' })).not.toBeInTheDocument();
  });

  it('membership tab: guests always on, link to Subscriptions', async () => {
    openApp('/settings?tab=membership');
    expect(await screen.findByRole('switch', { name: /Guests can use the app without an account/ })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Subscriptions' })).toHaveAttribute('href', '/subscriptions');
  });

  it('audit log: newest first, with who; filters by type', async () => {
    openApp('/settings?tab=audit');
    const log = await screen.findByRole('list', { name: 'Audit log' });
    const rows = within(log).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Config update');
    expect(rows[0]).toHaveTextContent('Raphael Reiter');
    expect(rows[2]).toHaveTextContent('System');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'What' }), 'session');
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Audit log' })).getAllByRole('listitem')).toHaveLength(1));
  });

  it('editors and moderators have no Settings', async () => {
    openApp('/settings', 'editor');
    expect(await screen.findByText('No permission')).toBeInTheDocument();
  });
});

describe('settings helpers', () => {
  it('versions and action names', () => {
    expect(semverOk('1.2.0')).toBe(true);
    expect(semverOk('1.2')).toBe(false);
    expect(actionLabel('moderation.hide')).toBe('Moderation hide');
  });
});
