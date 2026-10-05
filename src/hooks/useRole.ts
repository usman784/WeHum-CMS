import { useSyncExternalStore } from 'react';
import { can, type Action } from '../lib/rbac';
import { session } from '../lib/session';

export const useAdmin = () => useSyncExternalStore(session.subscribe, () => session.admin);

export const useRole = () => useAdmin()?.role;

/** UI-only check; the API enforces the same matrix (spec §6.2). */
export const useCan = (action: Action) => can(useRole(), action);
