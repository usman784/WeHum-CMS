import { api, ApiError, auth, endServerSession, isNetworkError, refresh, type SessionPayload } from '../../lib/api';
import { queryClient } from '../../lib/query';
import { session, type Admin, type SignOutReason } from '../../lib/session';
import { toast } from '../../ui/Toast';

/** After the password is accepted the API asks for the second step. Both tokens live 5 minutes. */
export type NextStep = { step: 'mfa'; mfaToken: string } | { step: 'enroll'; enrollToken: string };
export type EnrollStart = { secret: string; otpauthUri: string };
export type EnrollDone = SessionPayload & { recoveryCodes: string[] };

const post = <T>(path: string, body: unknown) => api<T>(`/v1/admin/auth${path}`, { method: 'POST', body }).then((r) => r.data);

export const authApi = {
  login: (email: string, password: string) => post<NextStep>('/login', { email, password }),
  verifyCode: (mfaToken: string, code: string) => post<SessionPayload>('/mfa/verify', { mfaToken, code }),
  verifyRecovery: (mfaToken: string, recoveryCode: string) => post<SessionPayload>('/mfa/verify', { mfaToken, recoveryCode }),
  enrollStart: (enrollToken: string) => post<EnrollStart>('/mfa/enroll', { enrollToken }),
  enrollConfirm: (enrollToken: string, code: string) => post<EnrollDone>('/mfa/enroll', { enrollToken, code }),
  forgot: (email: string) => post<void>('/forgot', { email }),
  reset: (token: string, password: string) => post<{ ok: true }>('/reset', { token, password }),
  acceptInvite: (token: string, name: string, password: string) => post<NextStep>('/accept-invite', { token, name, password }),
  me: () => api<Admin>('/v1/admin/me').then((r) => r.data),
  /** Public totals for the sign-in page. */
  publicLive: () =>
    api<{ meditatedToday: number | null; meditatingNow: number | null; at: number }>('/v1/admin/public/live').then((r) => r.data),
};

/**
 * Set when a sign-out could not reach the server (offline). The refresh cookie is httpOnly, so the browser cannot
 * delete it; without this note the next page load would quietly sign the admin back in. Holds no secret.
 */
const PENDING_SIGNOUT = 'wh_signout_pending';
const pending = {
  get: () => {
    try {
      return localStorage.getItem(PENDING_SIGNOUT) === '1';
    } catch {
      return false;
    }
  },
  set: (on: boolean) => {
    try {
      if (on) localStorage.setItem(PENDING_SIGNOUT, '1');
      else localStorage.removeItem(PENDING_SIGNOUT);
    } catch {
      // storage blocked: nothing more we can do
    }
  },
};

const serverSignOut = () => api('/v1/admin/auth/logout', { method: 'POST' });

/** Page load: the access token lives in memory only, so ask for a new one with the httpOnly refresh cookie. */
export async function bootstrapSession() {
  if (pending.get()) {
    // Finish the sign-out that failed last time. If the server is still unreachable, try again on the next load.
    if (await endServerSession()) pending.set(false);
    session.signOut();
    return;
  }
  const ok = await refresh();
  // A failed request (server down) leaves the state at "loading": show the sign-in page instead of a spinner forever.
  if (!ok && session.state.status === 'loading') session.signOut();
}

/** Sign out here and on the server. The local part always happens, even when the request fails. */
export async function signOut(reason: SignOutReason = 'user') {
  try {
    if (auth.token) await serverSignOut();
  } catch (e) {
    // Offline or server down: remember to end the server session on the next page load.
    if (isNetworkError(e) || (e instanceof ApiError && e.status >= 500)) pending.set(true);
  }
  auth.set(null);
  session.signOut(reason);
  queryClient.clear(); // nothing of the previous admin's data may be shown to the next one
  toast.clear();
}

/** A successful sign-in clears the note (the old cookie was replaced). Called by the session effects. */
export const clearPendingSignOut = () => pending.set(false);
