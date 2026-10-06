import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { auth } from '../lib/api';
import { url } from '../mocks/handlers';
import { server } from '../mocks/server';
import { createQueryClient } from '../lib/query';
import type { Role } from '../lib/rbac';
import { session } from '../lib/session';
import { getTheme, initTheme } from '../lib/theme';
import { a11yViolations } from '../test/render';
import { navFor } from './layout/Sidebar';
import { mockAdmin } from '../mocks/handlers';
import { Providers } from './providers';
import { routes } from './router';

afterEach(() => act(() => session.reset()));

/** Open a route as a signed-in admin of that role, or signed out when no role is given. */
function open(path: string, role?: Role) {
  if (role) session.signIn(mockAdmin(role));
  else session.signOut();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <Providers client={createQueryClient()}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return router;
}

const nav = () => screen.getByRole('navigation', { name: 'CMS navigation' });
const links = () =>
  within(nav())
    .getAllByRole('link')
    .map((a) => a.textContent?.replace(/\d+ to review$/, '').trim());
const htmlTheme = () => document.documentElement.dataset.theme;

describe('sidebar by role (spec §6.2)', () => {
  const all = [
    'Dashboard', 'Analytics', 'Sessions', 'Programs', 'Challenges', 'Daily Messages', 'Today screen', 'Themes', 'Teachers', 'Sounds', 'SoS',
    'Group meditation', 'Dedications & gratitude', 'Subscriptions', 'Users', 'Push notifications', 'Settings',
  ]; // prettier-ignore

  it.each<[Role, string[]]>([
    ['owner', all],
    ['admin', all],
    ['editor', all.filter((l) => l !== 'Dedications & gratitude' && l !== 'Settings')],
    ['moderator', ['Dashboard', 'Dedications & gratitude']],
  ])('%s sees the right links', (role, expected) => {
    open('/', role);
    expect(links()).toEqual(expected);
  });

  it('groups links under the section names from the spec and drops empty sections', () => {
    expect(navFor('owner').map((s) => s.section)).toEqual(['CONTENT', 'COMMUNITY', 'AUDIENCE & REVENUE', '']);
    expect(navFor('moderator').map((s) => s.section)).toEqual(['CONTENT', 'COMMUNITY']);
    expect(navFor(undefined)).toEqual([]);
  });

  it('marks the current page and shows the moderation badge', () => {
    expect(navFor('moderator', 7)[1]?.items[0]).toMatchObject({ key: 'moderation', badge: 7 });
    open('/sessions', 'owner');
    expect(within(nav()).getByRole('link', { name: 'Sessions' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav()).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('shows the admin name, role and initials', () => {
    open('/', 'owner');
    expect(within(nav()).getByText('Raphael Reiter')).toBeInTheDocument();
    expect(within(nav()).getByText('RR')).toBeInTheDocument();
    expect(within(nav()).getByText(/Owner/)).toBeInTheDocument();
  });
});

describe('routes', () => {
  it('a link opens its page inside the shell', async () => {
    open('/', 'owner');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dashboard');
    await userEvent.click(within(nav()).getByRole('link', { name: 'Themes' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Themes' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Loving Kindness/, pressed: false })).toBeInTheDocument(); // the real screen, loaded on demand
  });

  it('a page outside the role shows "No permission" instead of the page', () => {
    open('/settings', 'editor');
    expect(screen.getByText('No permission')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Settings' })).not.toBeInTheDocument();
  });

  it.each<[Role, string, boolean]>([
    ['moderator', '/moderation', true],
    ['moderator', '/sessions', false],
    ['moderator', '/users', false],
    ['editor', '/moderation', false],
    ['editor', '/notifications', true],
    ['admin', '/settings', true],
  ])('%s on %s → allowed: %s', (role, path, allowed) => {
    open(path, role);
    expect(!!screen.queryByText('No permission')).toBe(!allowed);
  });

  it('an unknown address shows "Page not found"', () => {
    open('/nope', 'owner');
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });

  it('without a session every page sends you to sign in and remembers where you wanted to go', async () => {
    const router = open('/sessions?tab=drafts');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'CMS navigation' })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/sessions?tab=drafts')}`);
  });

  it('while the first silent refresh runs, only a loading state shows (no flash of the sign-in page)', () => {
    session.reset();
    render(
      <Providers client={createQueryClient()}>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />
      </Providers>,
    );
    expect(screen.getByRole('status', { name: 'Loading WeHum CMS' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('sign out calls the API, leaves the shell and lands on the sign-in page', async () => {
    let called = 0;
    server.use(
      http.post(url('/v1/admin/auth/logout'), () => {
        called += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    auth.set('tok-1');
    const router = open('/', 'admin');
    await userEvent.click(within(nav()).getAllByRole('button', { name: 'Sign out' })[0]!);
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(called).toBe(1);
    expect(session.state).toMatchObject({ status: 'signedOut', admin: null, reason: 'user' });
    expect(auth.token).toBeNull();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('the component gallery loads at /kit', async () => {
    open('/kit', 'owner');
    expect(await screen.findByRole('heading', { level: 1, name: 'UI kit' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'DataTable' })).toBeInTheDocument();
  });
});

describe('shell', () => {
  it('has a skip link, one main landmark, the connection pill, and no accessibility violations', async () => {
    open('/', 'owner');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
    expect(await a11yViolations()).toEqual([]);
  });

  it('switches between dark and light and remembers the choice', async () => {
    initTheme();
    open('/', 'owner');
    expect(htmlTheme()).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(htmlTheme()).toBe('light');
    expect(localStorage.getItem('wh_theme')).toBe('light');
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(htmlTheme()).toBe('dark');
  });

  it('starts in the saved theme and ignores a bad saved value', () => {
    localStorage.setItem('wh_theme', 'light');
    initTheme();
    expect(getTheme()).toBe('light');
    localStorage.setItem('wh_theme', 'pink');
    initTheme();
    expect(getTheme()).toBe('dark');
  });

  it('shows a banner while the browser is offline', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    open('/', 'owner');
    expect(screen.getByRole('alert')).toHaveTextContent('You are offline');
    onLine.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('tokens.css', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8');
  const vars = (block: string) => [...block.matchAll(/--c-[a-z-]+(?=:)/g)].map((m) => m[0]).sort();
  const [dark = '', light = ''] = css.split('\n[data-theme="light"]');

  it('defines the same set of tokens for dark and light', () => {
    expect(vars(dark).length).toBeGreaterThan(20);
    expect(vars(light)).toEqual(vars(dark));
  });

  it('matches the spec §3 key colours', () => {
    expect(dark).toContain('--c-bg: 11 13 14;');
    expect(dark).toContain('--c-ember: 255 122 69;');
    expect(light).toContain('--c-bg: 247 245 242;');
    expect(light).toContain('--c-ember: 232 98 44;');
  });
});
