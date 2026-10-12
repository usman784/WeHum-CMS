import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { isHHmm } from '../../lib/tz';
import type { ConfigDoc } from '../config/useConfigForm';

export const LENGTHS = [10, 30, 45] as const;
export type Length = (typeof LENGTHS)[number];

export type Cadence = 'daily' | 'hourly';
export type GroupValue = {
  startUtc: string;
  lengthMin: Length;
  lobbyOpenMin: number;
  reminderMin: number;
  /** Daily = one start a day; hourly = a sit on the hour inside `hourly` (UTC). */
  cadence: Cadence;
  hourly: { fromHourUtc: number; toHourUtc: number; lengthMin: Length };
  /** The options on the "Intention for this sit" picker. */
  intentions: string[];
  /** The "Today's focus" card in the lobby (empty title = hidden). */
  focus: { title: string; summary: string; quote: string; attribution: string };
  doorsOpenSec: number;
};
export type GroupDay = { date: string; title: string; groupJoined: number; soloCount: number; practicedToday: number };
export type Group = ConfigDoc<GroupValue> & { history: GroupDay[] };

/** Choices of the two lobby selects. A saved value that is not in the list (set through the API) is added when shown. */
export const LOBBY_OPEN = [5, 10, 15, 20, 30, 60];
export const REMINDER = [5, 10, 15, 30];

/** The problem with these settings, or null. The API checks the same. */
export function groupProblem(v: GroupValue): string | null {
  if (!isHHmm(v.startUtc)) return 'Enter the start time as hours and minutes.';
  if (v.cadence === 'hourly' && v.hourly.toHourUtc < v.hourly.fromHourUtc) return 'The last hour must not be before the first.';
  return null;
}

/** Values saved before the redesign have no cadence, intentions or focus: show the defaults. */
export function withDefaults(v: Partial<GroupValue> & Pick<GroupValue, 'startUtc' | 'lengthMin' | 'lobbyOpenMin' | 'reminderMin'>): GroupValue {
  return {
    cadence: 'daily',
    hourly: { fromHourUtc: 6, toHourUtc: 22, lengthMin: 10 },
    intentions: [],
    focus: { title: '', summary: '', quote: '', attribution: 'Raphael' },
    doorsOpenSec: 60,
    ...v,
  };
}

/** "Mon, Oct 5" for a `yyyy-MM-dd` UTC day. */
export const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );

const KEY = ['config', 'group'] as const;

export function useGroup() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<Group>('/v1/admin/group').then((r) => r.data),
    select: (g): Group => ({ ...g, value: withDefaults(g.value) }),
  });
}

export const groupApi = {
  save: (value: GroupValue, version: number) =>
    api<ConfigDoc<GroupValue>>('/v1/admin/group', { method: 'PUT', body: value, ifMatch: version }).then((r) => r.data),
};

export function useGroupCache() {
  const qc = useQueryClient();
  return { saved: (doc: ConfigDoc<GroupValue>) => qc.setQueryData<Group>(KEY, (old) => (old ? { ...old, ...doc } : old)) };
}
