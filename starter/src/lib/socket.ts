import { io, type Socket } from 'socket.io-client';
import { auth, refresh } from './api';
import type { AdminClientToServer, AdminServerToClient } from './socket-events';

export type AdminSocket = Socket<AdminServerToClient, AdminClientToServer>;
export type SocketStatus = 'live' | 'reconnecting' | 'offline';

let socket: AdminSocket | null = null;
const channels = new Map<string, number>(); // ref-counted subscriptions
const statusListeners = new Set<(s: SocketStatus) => void>();
let status: SocketStatus = 'offline';
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

const setStatus = (s: SocketStatus) => { status = s; statusListeners.forEach((l) => l(s)); };
export const onStatus = (l: (s: SocketStatus) => void) => { statusListeners.add(l); l(status); return () => statusListeners.delete(l); };

export function connectSocket(): AdminSocket {
  if (socket) return socket;
  const s: AdminSocket = io(`${import.meta.env.VITE_SOCKET_URL}/admin`, {
    transports: ['websocket'],
    auth: (cb) => cb({ token: auth.token }),
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
    randomizationFactor: 0.5,
  });
  s.on('connect', () => {
    clearTimeout(reconnectTimer);
    setStatus('live');
    if (channels.size) s.emit('subscribe', { channels: [...channels.keys()] }, () => {});
  });
  s.on('disconnect', () => { reconnectTimer = setTimeout(() => setStatus('reconnecting'), 5000); });
  s.on('connect_error', async (err: Error & { data?: { code?: string } }) => {
    if (err.data?.code === 'TOKEN_EXPIRED' && (await refresh())) s.connect();
    else reconnectTimer = setTimeout(() => setStatus('offline'), 5000);
  });
  s.on('auth:expiring', async () => {
    if (await refresh()) s.emit('auth:refresh', { token: auth.token! }, () => {});
  });
  socket = s;
  return s;
}

export function subscribe(list: string[]) {
  const fresh = list.filter((c) => { const n = channels.get(c) ?? 0; channels.set(c, n + 1); return n === 0; });
  if (fresh.length && socket?.connected) socket.emit('subscribe', { channels: fresh }, () => {});
  return () => {
    const gone = list.filter((c) => { const n = (channels.get(c) ?? 1) - 1; if (n <= 0) channels.delete(c); else channels.set(c, n); return n <= 0; });
    if (gone.length) socket?.emit('unsubscribe', { channels: gone });
  };
}

export const getSocket = () => socket;
export function disconnectSocket() { socket?.disconnect(); socket = null; setStatus('offline'); }
