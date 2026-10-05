import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';
import { captureError } from './sentry';

/** Server faults and unexpected exceptions go to Sentry; 4xx answers and network drops are handled in the UI. */
const report = (e: unknown, context: Record<string, unknown>) => {
  if (e instanceof ApiError && e.status < 500) return;
  captureError(e, context);
};

/** GETs retry twice on 5xx and network errors; a 4xx answer is final (spec §12). */
export const shouldRetry = (failureCount: number, e: unknown) =>
  !(e instanceof ApiError && e.status > 0 && e.status < 500) && failureCount < 2;

export const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({ onError: (e, q) => report(e, { queryKey: q.queryKey }) }),
    mutationCache: new MutationCache({ onError: (e, _v, _c, m) => report(e, { mutationKey: m.options.mutationKey }) }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
      },
      mutations: { retry: false },
    },
  });

export const queryClient = createQueryClient();

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
  session: entity('session'),
  media: entity('media'),
  theme: entity('theme'),
  teacher: entity('teacher'),
  program: entity('program'),
  challenge: entity('challenge'),
  motd: entity('motd'),
  dailyMessage: entity('dailyMessage'),
  soundBlock: entity('soundBlock'),
  sos: entity('sos'),
  config: entity('config'),
  notification: entity('notification'),
  admin: entity('admin'),
  user: entity('user'),
  moderation: (f: object = {}) => ['moderation', f] as const,
  subscriptions: {
    summary: ['subs', 'summary'] as const,
    members: (f: object) => ['subs', 'members', f] as const,
    events: ['subs', 'events'] as const,
  },
  job: (id: string) => ['job', id] as const,
};
