import { io, type Socket } from 'socket.io-client';
import { auth, refresh } from './api';
import { env } from './env';
import { breadcrumb } from './sentry';
import type { AdminClientToServer, AdminServerToClient } from './socket-events';

/** `/admin` namespace client (spec §6.3): websocket only, backoff reconnect, token refresh, ref-counted channels. */
export type AdminSocket = Socket<AdminServerToClient, AdminClientToServer>;
export type SocketStatus = 'live' | 'reconnecting' | 'offline';

/** "Reconnecting…" shows only after 5 s so a short blip does not flash the pill. */
const GRACE_MS = 5000;
/** After this many failed attempts in a row the pill says "Offline" (the client keeps retrying). */
const OFFLINE_AFTER = 5;

let socket: AdminSocket | null = null;
const channels = new Map<string, number>(); // ref-counted subscriptions
const statusListeners = new Set<(s: SocketStatus) => void>();
let status: SocketStatus = 'offline';
let graceTimer: ReturnType<typeof setTimeout> | undefined;
let failures = 0;

const setStatus = (s: SocketStatus) => {
  if (s === status) return;
  status = s;
  breadcrumb('socket_state', s);
  statusListeners.forEach((l) => l(s));
};

export const onStatus = (l: (s: SocketStatus) => void) => {
  statusListeners.add(l);
  l(status);
  return () => {
    statusListeners.delete(l);
  };
};

export const getStatus = () => status;

const startGrace = () => {
  graceTimer ??= setTimeout(() => {
    graceTimer = undefined;
    if (status === 'live') setStatus('reconnecting');
  }, GRACE_MS);
};

const stopGrace = () => {
  clearTimeout(graceTimer);
  graceTimer = undefined;
};

export function connectSocket(): AdminSocket {
  if (socket) return socket;
  const s: AdminSocket = io(`${env.socketUrl}/admin`, {
    transports: ['websocket'],
    auth: (cb) => cb({ token: auth.token }),
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
    randomizationFactor: 0.5,
  });
  s.on('connect', () => {
    stopGrace();
    failures = 0;
    setStatus('live');
    // After a reconnect the server has forgotten our rooms: join them again.
    if (channels.size) s.emit('subscribe', { channels: [...channels.keys()] }, () => {});
  });
  s.on('disconnect', () => {
    if (socket === s) startGrace();
  });
  s.on('connect_error', async (err: Error & { data?: { code?: string } }) => {
    if (err.data?.code === 'TOKEN_EXPIRED' && (await refresh())) {
      s.connect();
      return;
    }
    failures += 1;
    if (failures >= OFFLINE_AFTER) {
      stopGrace();
      setStatus('offline');
    } else if (status === 'live') startGrace();
    else setStatus('reconnecting');
  });
  s.on('auth:expiring', async () => {
    const token = (await refresh()) ? auth.token : null;
    if (token) s.emit('auth:refresh', { token }, () => {});
  });
  // Role revoked or admin disabled: sign out at once (spec §6.2).
  s.on('force:logout', () => {
    auth.set(null);
    disconnectSocket();
  });
  socket = s;
  return s;
}

/** Subscribe to channels. Returns the unsubscribe function. A channel is left only when its last user is gone. */
export function subscribe(list: string[]) {
  const fresh = list.filter((c) => {
    const n = channels.get(c) ?? 0;
    channels.set(c, n + 1);
    return n === 0;
  });
  if (fresh.length && socket?.connected) socket.emit('subscribe', { channels: fresh }, () => {});
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const gone = list.filter((c) => {
      const n = (channels.get(c) ?? 1) - 1;
      if (n <= 0) channels.delete(c);
      else channels.set(c, n);
      return n <= 0;
    });
    if (gone.length && socket?.connected) socket.emit('unsubscribe', { channels: gone });
  };
}

export const getSocket = () => socket;

export function disconnectSocket() {
  const s = socket;
  socket = null;
  stopGrace();
  failures = 0;
  channels.clear();
  s?.disconnect();
  setStatus('offline');
}
