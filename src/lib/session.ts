import type { Role } from './rbac';

/** The signed-in admin, as returned by `/v1/admin/auth/*` and `GET /v1/admin/me`. Kept in memory only (spec §6.2). */
export type Admin = {
  id: string;
  email: string;
  name: string;
  role: Role;
  mfaEnabled: boolean;
  permissions: string[];
};

/**
 * - `loading`: page just opened, the silent refresh is still running.
 * - `signedIn`: normal.
 * - `expired`: was signed in, but the refresh cookie is no longer valid. The screen stays as it is (unsaved
 *   forms are kept) and a sign-in dialog appears on top (spec §10 "Session expiry").
 * - `signedOut`: no session. `reason` says why, for the message on the sign-in page.
 */
export type SessionStatus = 'loading' | 'signedIn' | 'expired' | 'signedOut';
export type SignOutReason = 'user' | 'idle' | 'forced';
export type SessionState = { status: SessionStatus; admin: Admin | null; reason?: SignOutReason };

let state: SessionState = { status: 'loading', admin: null };
const listeners = new Set<() => void>();

const set = (next: SessionState) => {
  state = next;
  listeners.forEach((l) => l());
};

export const session = {
  get state() {
    return state;
  },
  get admin() {
    return state.admin;
  },
  signIn: (admin: Admin) => set({ status: 'signedIn', admin }),
  /** Role or name changed (from `GET /me`). No effect when nobody is signed in. */
  update(admin: Admin) {
    if (state.admin) set({ ...state, admin });
  },
  expire() {
    if (state.status === 'signedIn') set({ ...state, status: 'expired' });
  },
  signOut: (reason?: SignOutReason) => set({ status: 'signedOut', admin: null, reason }),
  /** Tests only. */
  reset: () => set({ status: 'loading', admin: null }),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
