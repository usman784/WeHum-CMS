import * as Sentry from '@sentry/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { captureError, initSentry, sendSentryTestEvent, setSentryUser } from './sentry';

type SentEvent = { message?: string; release?: string; environment?: string; user?: object; tags?: Record<string, unknown> };

/** Initialise the real SDK with a fake DSN and a transport that keeps events in memory instead of sending them. */
function start() {
  const events: SentEvent[] = [];
  const on = initSentry({
    dsn: 'https://public@o0.ingest.sentry.io/1',
    integrations: [],
    tracesSampleRate: 0,
    transport: () => ({
      send: async (envelope) => {
        for (const [header, payload] of envelope[1]) if (header.type === 'event') events.push(payload as SentEvent);
        return {};
      },
      flush: async () => true,
    }),
  });
  return { on, events };
}

afterEach(async () => {
  await Sentry.close();
});

describe('sentry', () => {
  it('stays off without a DSN', () => {
    expect(initSentry()).toBe(false);
  });

  it('sends the test event with environment and release', async () => {
    const { on, events } = start();
    expect(on).toBe(true);
    sendSentryTestEvent();
    await Sentry.flush(2000);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ message: 'WeHum CMS: Sentry test event', environment: 'test', release: 'dev' });
  });

  it('identifies the admin by id and role only, never the email', async () => {
    const { events } = start();
    setSentryUser({ id: 'admin-1', role: 'editor' });
    sendSentryTestEvent();
    await Sentry.flush(2000);
    expect(events[0]?.user).toEqual({ id: 'admin-1' });
    expect(events[0]?.tags).toMatchObject({ role: 'editor' });
    setSentryUser(null);
  });

  it('tags a server fault with the API traceId, and drops expected 4xx answers', async () => {
    const { events } = start();
    captureError(new ApiError('VALIDATION_FAILED', 422, 'Check the form', undefined, 'trace-4xx'));
    captureError(new ApiError('INTERNAL', 500, 'Boom', undefined, 'trace-500'));
    await Sentry.flush(2000);
    expect(events).toHaveLength(1);
    expect(events[0]?.tags).toMatchObject({ api_code: 'INTERNAL', trace_id: 'trace-500' });
  });
});
