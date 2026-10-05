export type Role = 'owner' | 'admin' | 'editor' | 'moderator';
export type Action =
  | 'dashboard.view'
  | 'analytics.view'
  | 'content.edit'
  | 'moderation.act'
  | 'revenue.view'
  | 'users.view'
  | 'users.delete'
  | 'users.export'
  | 'users.gift'
  | 'push.draft'
  | 'push.send'
  | 'settings.manage'
  | 'team.manage'
  | 'audit.view';

const matrix: Record<Action, Role[]> = {
  'dashboard.view': ['owner', 'admin', 'editor', 'moderator'],
  'analytics.view': ['owner', 'admin', 'editor'],
  'content.edit': ['owner', 'admin', 'editor'],
  'moderation.act': ['owner', 'admin', 'moderator'],
  'revenue.view': ['owner', 'admin', 'editor'],
  'users.view': ['owner', 'admin', 'editor'],
  'users.delete': ['owner', 'admin'],
  'users.export': ['owner', 'admin'],
  'users.gift': ['owner', 'admin'],
  'push.draft': ['owner', 'admin', 'editor'],
  'push.send': ['owner', 'admin'],
  'settings.manage': ['owner', 'admin'],
  'team.manage': ['owner', 'admin'],
  'audit.view': ['owner', 'admin'],
};

/** UI-only convenience. The API enforces the same matrix (backend spec §5.5). */
export const can = (role: Role | undefined, action: Action) => !!role && matrix[action].includes(role);
