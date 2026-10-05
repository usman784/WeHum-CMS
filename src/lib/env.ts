/** Build-time environment (spec §14). Every value comes from `.env` / `.env.{mode}`; nothing secret lives here. */
export type AppEnv = 'local' | 'dev' | 'staging' | 'prod' | 'test';

export const env = {
  name: (import.meta.env.VITE_ENV ?? 'local') as AppEnv,
  apiUrl: import.meta.env.VITE_API_URL as string,
  socketUrl: (import.meta.env.VITE_SOCKET_URL ?? import.meta.env.VITE_API_URL) as string,
  sentryDsn: (import.meta.env.VITE_SENTRY_DSN ?? '') as string,
  release: (import.meta.env.VITE_RELEASE ?? 'dev') as string,
  mocks: import.meta.env.VITE_MOCKS === '1',
};
