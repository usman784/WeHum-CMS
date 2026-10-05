import { env } from '../lib/env';
import type { Role } from '../lib/rbac';
import { session, type Admin } from '../lib/session';

/**
 * TEMPORARY (phase P1 only): there is no sign-in yet, so `?as=owner|admin|editor|moderator` opens the shell
 * as a demo admin. Never active in production. Phase P2 deletes this file and uses the real session.
 */
const roles: Role[] = ['owner', 'admin', 'editor', 'moderator'];

export const previewAdmin = (role: Role): Admin => ({
  id: `preview-${role}`,
  email: `${role}@example.com`,
  name: role === 'owner' ? 'Raphael Reiter' : `Demo ${role[0]!.toUpperCase()}${role.slice(1)}`,
  role,
  mfaEnabled: true,
  permissions: [],
});

export function applyPreviewRole(search: string = window.location.search) {
  if (env.name === 'prod') return;
  const as = new URLSearchParams(search).get('as');
  if (roles.includes(as as Role)) session.set(previewAdmin(as as Role));
}
