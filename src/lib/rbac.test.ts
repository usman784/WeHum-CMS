import { describe, expect, it } from 'vitest';
import { nav } from '../app/routes';
import { can, type Action, type Role } from './rbac';

const roles: Role[] = ['owner', 'admin', 'editor', 'moderator'];
const visible = (role: Role) =>
  nav
    .flatMap((s) => s.items)
    .filter((i) => can(role, i.need))
    .map((i) => i.key);

describe('can(role, action) — role table from spec §6.2', () => {
  it.each<[Action, Role[]]>([
    ['dashboard.view', ['owner', 'admin', 'editor', 'moderator']],
    ['content.edit', ['owner', 'admin', 'editor']],
    ['moderation.act', ['owner', 'admin', 'moderator']],
    ['users.view', ['owner', 'admin', 'editor']],
    ['users.delete', ['owner', 'admin']],
    ['push.draft', ['owner', 'admin', 'editor']],
    ['push.send', ['owner', 'admin']],
    ['settings.manage', ['owner', 'admin']],
  ])('%s', (action, allowed) => {
    for (const role of roles) expect(can(role, action), `${role} → ${action}`).toBe(allowed.includes(role));
  });

  it('denies everything when signed out', () => {
    expect(can(undefined, 'dashboard.view')).toBe(false);
  });
});

describe('sidebar by role', () => {
  it('owner and admin see every item', () => {
    const all = nav.flatMap((s) => s.items).map((i) => i.key);
    expect(visible('owner')).toEqual(all);
    expect(visible('admin')).toEqual(all);
  });

  it('editor does not see moderation or settings', () => {
    expect(visible('editor')).toEqual(expect.arrayContaining(['sessions', 'subscriptions', 'users', 'notifications']));
    expect(visible('editor')).not.toContain('moderation');
    expect(visible('editor')).not.toContain('settings');
  });

  it('moderator sees only the dashboard and moderation', () => {
    expect(visible('moderator')).toEqual(['dashboard', 'moderation']);
  });
});
