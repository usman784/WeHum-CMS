import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
    },
    mutations: { retry: false },
  },
});

/** Query key factory — socket `entity:changed{type}` invalidates `qk[type].all`. */
const entity = (name: string) => ({
  all: [name] as const,
  list: (f: object = {}) => [name, 'list', f] as const,
  detail: (id: string) => [name, 'detail', id] as const,
});

export const qk = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  analytics: (f: object) => ['analytics', f] as const,
  session: entity('session'), theme: entity('theme'), teacher: entity('teacher'), program: entity('program'),
  challenge: entity('challenge'), motd: entity('motd'), dailyMessage: entity('dailyMessage'), soundBlock: entity('soundBlock'),
  sos: entity('sos'), config: entity('config'), notification: entity('notification'), admin: entity('admin'), user: entity('user'),
  moderation: (f: object = {}) => ['moderation', f] as const,
  subscriptions: { summary: ['subs', 'summary'] as const, members: (f: object) => ['subs', 'members', f] as const, events: ['subs', 'events'] as const },
  job: (id: string) => ['job', id] as const,
};
