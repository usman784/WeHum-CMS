/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENV?: string;
  readonly VITE_API_URL: string;
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_SENTRY_DSN?: string;
  /** Git sha, set by CI. */
  readonly VITE_RELEASE?: string;
  /** "1" starts the MSW worker in the browser (local work without a backend). */
  readonly VITE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
