import type { Action } from '../lib/rbac';

/** Sidebar + router config (design: design/source/Sidebar.dc.html). Order and grouping match the design. */
export const nav: { section: string; items: { key: string; label: string; path: string; screen: string; need: Action }[] }[] = [
  {
    section: 'CONTENT',
    items: [
      { key: 'dashboard', label: 'Dashboard', path: '/', screen: '01', need: 'dashboard.view' },
      { key: 'analytics', label: 'Analytics', path: '/analytics', screen: '02', need: 'analytics.view' },
      { key: 'sessions', label: 'Sessions', path: '/sessions', screen: '03', need: 'content.edit' },
      { key: 'programs', label: 'Programs', path: '/programs', screen: '05', need: 'content.edit' },
      { key: 'challenges', label: 'Challenges', path: '/challenges', screen: '06', need: 'content.edit' },
      { key: 'daily', label: 'Daily Messages', path: '/daily-messages', screen: '07', need: 'content.edit' },
      { key: 'today', label: 'Today screen', path: '/today', screen: '08', need: 'content.edit' },
      { key: 'themes', label: 'Themes', path: '/themes', screen: '09', need: 'content.edit' },
      { key: 'teachers', label: 'Teachers', path: '/teachers', screen: '10', need: 'content.edit' },
      { key: 'sounds', label: 'Sounds', path: '/sounds', screen: '11', need: 'content.edit' },
      { key: 'sos', label: 'SoS', path: '/sos', screen: '12', need: 'content.edit' },
      { key: 'group', label: 'Group meditation', path: '/group-meditation', screen: '13', need: 'content.edit' },
    ],
  },
  {
    section: 'COMMUNITY',
    items: [{ key: 'moderation', label: 'Dedications & gratitude', path: '/moderation', screen: '14', need: 'moderation.act' }],
  },
  {
    section: 'AUDIENCE & REVENUE',
    items: [
      { key: 'subscriptions', label: 'Subscriptions', path: '/subscriptions', screen: '15', need: 'revenue.view' },
      { key: 'users', label: 'Users', path: '/users', screen: '16', need: 'users.view' },
      { key: 'notifications', label: 'Push notifications', path: '/notifications', screen: '18', need: 'push.draft' },
    ],
  },
  { section: '', items: [{ key: 'settings', label: 'Settings', path: '/settings', screen: '19', need: 'settings.manage' }] },
];

export const extraRoutes = [
  { path: '/sessions/:id', screen: '04' },
  { path: '/users/:id', screen: '17' },
  { path: '/login', screen: '00' },
  { path: '/audit', screen: 'settings tab' },
];
