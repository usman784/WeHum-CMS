import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { isHHmm } from '../../lib/tz';
import type { ConfigDoc } from '../config/useConfigForm';

export const LENGTHS = [10, 30, 45] as const;
export type Length = (typeof LENGTHS)[number];

export type GroupValue = { startUtc: string; lengthMin: Length; lobbyOpenMin: number; reminderMin: number };
export type GroupDay = { date: string; title: string; groupJoined: number; soloCount: number; practicedToday: number };
export type Group = ConfigDoc<GroupValue> & { history: GroupDay[] };

/** Choices of the two lobby selects. A saved value that is not in the list (set through the API) is added when shown. */
export const LOBBY_OPEN = [5, 10, 15, 20, 30, 60];
export const REMINDER = [5, 10, 15, 30];

/** The problem with these settings, or null. The API checks the same. */
export function groupProblem(v: GroupValue): string | null {
  return isHHmm(v.startUtc) ? null : 'Enter the start time as hours and minutes.';
}

/** "Mon, Oct 5" for a `yyyy-MM-dd` UTC day. */
export const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );

const KEY = ['config', 'group'] as const;

export function useGroup() {
  return useQuery({ queryKey: KEY, queryFn: () => api<Group>('/v1/admin/group').then((r) => r.data) });
}

export const groupApi = {
  save: (value: GroupValue, version: number) =>
    api<ConfigDoc<GroupValue>>('/v1/admin/group', { method: 'PUT', body: value, ifMatch: version }).then((r) => r.data),
};

export function useGroupCache() {
  const qc = useQueryClient();
  return { saved: (doc: ConfigDoc<GroupValue>) => qc.setQueryData<Group>(KEY, (old) => (old ? { ...old, ...doc } : old)) };
}
