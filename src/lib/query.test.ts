import { http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fail, ok, url } from '../mocks/handlers';
import { server } from '../mocks/server';
import { api, ApiError } from './api';
import { createQueryClient, qk, shouldRetry } from './query';
import * as sentry from './sentry';

describe('query client defaults (spec §12)', () => {
  it('uses 30 s stale time, 10 min cache, no refetch on focus, no mutation retry', () => {
    const o = createQueryClient().getDefaultOptions();
    expect(o.queries).toMatchObject({ staleTime: 30_000, gcTime: 600_000, refetchOnWindowFocus: false });
    expect(o.mutations?.retry).toBe(false);
  });

  it('retries 5xx and network errors twice, never a 4xx', () => {
    expect(shouldRetry(0, new ApiError('INTERNAL', 500, 'x'))).toBe(true);
    expect(shouldRetry(1, new ApiError('NETWORK', 0, 'x'))).toBe(true);
    expect(shouldRetry(2, new ApiError('INTERNAL', 500, 'x'))).toBe(false);
    expect(shouldRetry(0, new ApiError('NOT_FOUND', 404, 'x'))).toBe(false);
    expect(shouldRetry(0, new ApiError('CONFLICT_VERSION', 409, 'x'))).toBe(false);
  });

  it('reports a server fault to Sentry but not a 4xx answer', async () => {
    const capture = vi.spyOn(sentry, 'captureError').mockImplementation(() => {});
    const qc = createQueryClient();
    server.use(
      http.get(url('/v1/admin/a'), () => fail(404, 'NOT_FOUND')),
      http.get(url('/v1/admin/b'), () => fail(500, 'INTERNAL')),
    );
    await qc.fetchQuery({ queryKey: ['a'], queryFn: () => api('/v1/admin/a'), retry: false }).catch(() => {});
    expect(capture).not.toHaveBeenCalled();
    await qc.fetchQuery({ queryKey: ['b'], queryFn: () => api('/v1/admin/b'), retry: false }).catch(() => {});
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]?.[1]).toEqual({ queryKey: ['b'] });
  });
});

describe('query keys', () => {
  it('list and detail keys start with the entity type, so entity:changed{type} invalidates both', async () => {
    const qc = createQueryClient();
    server.use(http.get(url('/v1/x'), () => ok(1)));
    const fn = () => api('/v1/x');
    await qc.fetchQuery({ queryKey: qk.session.list({ q: 'calm' }), queryFn: fn });
    await qc.fetchQuery({ queryKey: qk.session.detail('s1'), queryFn: fn });
    await qc.fetchQuery({ queryKey: qk.theme.list(), queryFn: fn });
    await qc.invalidateQueries({ queryKey: qk.session.all, refetchType: 'none' });
    expect(qc.getQueryState(qk.session.list({ q: 'calm' }))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(qk.session.detail('s1'))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(qk.theme.list())?.isInvalidated).toBe(false);
  });
});
