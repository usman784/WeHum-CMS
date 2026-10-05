import { useSyncExternalStore } from 'react';
import { can, type Action } from '../lib/rbac';
import { session } from '../lib/session';

/** `{ status, admin, reason }` — re-renders when the session changes. */
export const useSessionState = () => useSyncExternalStore(session.subscribe, () => session.state);

export const useAdmin = () => useSessionState().admin;

export const useRole = () => useAdmin()?.role;

/** UI-only check; the API enforces the same matrix (spec §6.2). */
export const useCan = (action: Action) => can(useRole(), action);
