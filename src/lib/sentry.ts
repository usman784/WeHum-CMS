import * as Sentry from '@sentry/react';
import { ApiError } from './api';
import { env } from './env';
import type { Role } from './rbac';

/**
 * Sentry (spec §11): release = git sha, replay on error only with everything masked,
 * user = admin id + role (never the email), API `traceId` as a tag to match backend logs.
 */
let enabled = false;

export function initSentry(overrides: Partial<Sentry.BrowserOptions> = {}): boolean {
  const dsn = overrides.dsn ?? env.sentryDsn;
  if (!dsn) return false; // local work without a DSN: Sentry stays off
  Sentry.init({
    dsn,
    environment: env.name,
    release: env.release,
    sendDefaultPii: false,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }),
    ],
    tracesSampleRate: env.name === 'prod' ? 0.1 : 1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
    // Expected API answers (validation, conflict, no permission) are shown in the UI, not reported.
    beforeSend(event, hint) {
      const e = hint.originalException;
      if (e instanceof ApiError && e.status > 0 && e.status < 500) return null;
      return event;
    },
    ...overrides,
  });
  enabled = true;
  return true;
}

export const sentryEnabled = () => enabled;

export function setSentryUser(admin: { id: string; role: Role } | null) {
  Sentry.setUser(admin ? { id: admin.id } : null);
  Sentry.setTag('role', admin?.role);
}

/** Report an error. For API errors the backend `traceId` is attached as a tag. */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  Sentry.withScope((scope) => {
    if (error instanceof ApiError) {
      scope.setTag('api_code', error.code);
      if (error.traceId) scope.setTag('trace_id', error.traceId);
    }
    if (context) scope.setContext('cms', context);
    Sentry.captureException(error);
  });
}

export function breadcrumb(category: 'route' | 'mutation' | 'socket_state', message: string, data?: Record<string, unknown>) {
  Sentry.addBreadcrumb({ category, message, data, level: 'info' });
}

/** Phase P0 exit test: sends one message so the project wiring can be checked in the Sentry UI. */
export const sendSentryTestEvent = () => Sentry.captureMessage('WeHum CMS: Sentry test event', 'info');
