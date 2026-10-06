import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../../lib/api';
import { qk } from '../../lib/query';

export type Challenge = {
  id: string;
  name: string;
  days: number;
  /** What counts as a day. */
  counts: 'any' | 'sleep' | 'group';
  minMinutes: number;
  membersOnly: boolean;
  showOnYou: boolean;
  startsAt: string | null;
  status: 'draft' | 'scheduled' | 'live' | 'archived';
  version: number;
  createdAt: string;
  /** Members in the challenge, and how many of them finished every day. */
  participants: number;
  finished: number;
};

export const COUNTS: { value: Challenge['counts']; label: (min: number) => string; short: string }[] = [
  { value: 'any', label: (min) => `Any meditation of ${min} min or more`, short: 'Any meditation' },
  { value: 'sleep', label: () => 'Only sleep meditations', short: 'Sleep meditations' },
  { value: 'group', label: () => 'Only group meditations', short: 'Group meditations' },
];

export const challengeSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80, 'The name can be at most 80 characters'),
  days: z.coerce
    .number({ invalid_type_error: 'Enter a number of days' })
    .int('Use whole days')
    .min(1, 'At least 1 day')
    .max(365, 'At most 365 days'),
  counts: z.enum(['any', 'sleep', 'group']),
  minMinutes: z.coerce
    .number({ invalid_type_error: 'Enter minutes' })
    .int('Use whole minutes')
    .min(1, 'At least 1 minute')
    .max(120, 'At most 120 minutes'),
  membersOnly: z.boolean(),
  showOnYou: z.boolean(),
});
export type ChallengeInput = z.input<typeof challengeSchema>;
export type ChallengeValues = z.output<typeof challengeSchema>;

/** Share of participants who finished, or null when nobody is in it. */
export const challengeFinishRate = (c: Pick<Challenge, 'participants' | 'finished'>) =>
  c.participants > 0 ? c.finished / c.participants : null;

const LIST = qk.challenge.list();

export function useChallenges() {
  return useQuery({ queryKey: LIST, queryFn: () => api<Challenge[]>('/v1/admin/challenges').then((r) => r.data) });
}

/** Whether the app shows challenges at all. Only owners and admins may read the settings; others get `undefined`. */
export function useChallengesFlag(enabled: boolean) {
  return useQuery({
    queryKey: [...qk.config.all, 'main', 'features'],
    queryFn: () =>
      api<{ main?: { value?: { features?: { challenges?: boolean } } } }>('/v1/admin/config').then(
        (r) => r.data.main?.value?.features?.challenges ?? false,
      ),
    enabled,
  });
}

export const challengeApi = {
  create: (v: ChallengeValues) => api<Challenge>('/v1/admin/challenges', { method: 'POST', body: v }).then((r) => r.data),
  update: (id: string, v: Partial<ChallengeValues> & { status?: Challenge['status'] }, version: number) =>
    api<Challenge>(`/v1/admin/challenges/${id}`, { method: 'PATCH', body: v, ifMatch: version }).then((r) => r.data),
};

export function useChallengeCache() {
  const qc = useQueryClient();
  return {
    saved: (row: Challenge) => qc.setQueryData<Challenge[]>(LIST, (old) => old?.map((c) => (c.id === row.id ? { ...c, ...row } : c))),
    added: (row: Challenge) => qc.setQueryData<Challenge[]>(LIST, (old) => [{ ...row, participants: 0, finished: 0 }, ...(old ?? [])]),
  };
}
