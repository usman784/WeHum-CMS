import { useState } from 'react';
import { useSocketEvent } from '../../hooks/useLive';
import { queryClient } from '../../lib/query';
import { setSentryUser } from '../../lib/sentry';
import { session, type SessionStatus } from '../../lib/session';
import { connectSocket, disconnectSocket } from '../../lib/socket';
import type { AdminServerToClient } from '../../lib/socket-events';
import { authApi, clearPendingSignOut } from './api';

/**
 * Things that follow the session, wherever it changes (sign-in, refresh, forced sign-out, another tab):
 * the socket connects only while signed in, Sentry knows the admin id and role, cached data never outlives the admin.
 * Call once at startup. Returns the function that removes it (tests).
 */
export function installSessionEffects() {
  let previous: SessionStatus = session.state.status;
  let adminId: string | null = session.admin?.id ?? null;
  const apply = () => {
    const { status, admin } = session.state;
    if (status === 'signedIn' && admin) {
      setSentryUser({ id: admin.id, role: admin.role });
      clearPendingSignOut(); // a new sign-in replaced the cookie an earlier offline sign-out could not end
      // A different admin signed in on the same page (re-login dialog is locked to the same email, so this is rare).
      if (adminId && adminId !== admin.id) queryClient.clear();
      adminId = admin.id;
      connectSocket();
    } else if (status === 'signedOut' && previous !== 'signedOut') {
      setSentryUser(null);
      adminId = null;
      disconnectSocket();
      queryClient.clear();
    }
    previous = status;
  };
  apply();
  return session.subscribe(apply);
}

/**
 * Mounted in the shell (spec §6.3 "Sidebar (always)"): when another admin changes my role or name,
 * `entity:changed{type:'admin', id: me}` arrives → read `/me` again so the sidebar and guards follow at once.
 */
export function useOwnAdminSync() {
  const onChange: AdminServerToClient['entity:changed'] = ({ type, id }) => {
    if (type !== 'admin' || id !== session.admin?.id) return;
    authApi
      .me()
      .then((me) => session.update(me))
      .catch(() => {}); // disabled admins get `force:logout`; nothing to do here
  };
  useSocketEvent('entity:changed', onChange);
}

/** Open moderation items for the sidebar badge, pushed by `moderation:count`. Phase P7 adds the first value from the API. */
export function useModerationCount() {
  const [open, setOpen] = useState(0);
  useSocketEvent('moderation:count', (p) => setOpen(p.open));
  return open;
}
