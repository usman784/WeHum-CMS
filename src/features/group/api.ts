import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { isHHmm } from '../../lib/tz';
import type { ConfigDoc } from '../config/useConfigForm';

export const LENGTHS = [10, 30, 45] as const;
export type Length = (typeof LENGTHS)[number];

export type Cadence = 'daily' | 'hourly';
/** The Global meditation: once a week, everyone at the same time. Not the same thing as the group sits. */
export type GlobalValue = {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday (UTC). */
  weekday: number;
  startUtc: string;
  lengthMin: Length;
  lobbyOpenMin: number;
  reminderMin: number;
  title: string;
};
export const DEFAULT_GLOBAL: GlobalValue = {
  enabled: true,
  weekday: 0,
  startUtc: '16:00',
  lengthMin: 30,
  lobbyOpenMin: 30,
  reminderMin: 60,
  title: 'Global meditation',
};
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** How many hours between two group sits. */
export const STEPS = [1, 2, 3, 4, 6, 8, 12];
export type GroupValue = {
  startUtc: string;
  lengthMin: Length;
  lobbyOpenMin: number;
  reminderMin: number;
  /** Daily = one start a day; hourly = a sit every `stepHours` hours inside `hourly` (UTC). */
  cadence: Cadence;
  hourly: { fromHourUtc: number; toHourUtc: number; lengthMin: Length; stepHours: number };
  global: GlobalValue;
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
export const GLOBAL_LOBBY_OPEN = [10, 15, 30, 60, 120];
export const GLOBAL_REMINDER = [15, 30, 60, 120, 180];

/** The UTC times of the group sits through the day, e.g. every 4 hours from 0 to 23: 00:00, 04:00 … 20:00. */
export const sitHours = (h: Pick<GroupValue['hourly'], 'fromHourUtc' | 'toHourUtc' | 'stepHours'> & Partial<GroupValue['hourly']>) => {
  const out: string[] = [];
  for (let x = h.fromHourUtc; x <= h.toHourUtc; x += Math.max(1, h.stepHours)) out.push(`${String(x).padStart(2, '0')}:00`);
  return out;
};

/** The problem with these settings, or null. The API checks the same. */
export function groupProblem(v: GroupValue): string | null {
  if (!isHHmm(v.startUtc)) return 'Enter the start time as hours and minutes.';
  if (v.cadence === 'hourly' && v.hourly.toHourUtc < v.hourly.fromHourUtc) return 'The last hour must not be before the first.';
  if (v.global.enabled && !isHHmm(v.global.startUtc)) return 'Enter the Global meditation time as hours and minutes.';
  return null;
}

/** Values saved before the redesign have no cadence, intentions or focus: show the defaults. */
export function withDefaults(
  v: Partial<GroupValue> & Pick<GroupValue, 'startUtc' | 'lengthMin' | 'lobbyOpenMin' | 'reminderMin'>,
): GroupValue {
  const base = {
    cadence: 'daily' as Cadence,
    hourly: { fromHourUtc: 0, toHourUtc: 23, lengthMin: 30 as Length, stepHours: 4 },
    intentions: [],
    focus: { title: '', summary: '', quote: '', attribution: 'Raphael' },
    doorsOpenSec: 60,
    ...v,
  };
  // an hourly window saved before the step existed meant "every hour"
  const hourly = v.hourly ? { ...v.hourly, stepHours: v.hourly.stepHours ?? 1 } : base.hourly;
  return { ...base, hourly, global: { ...DEFAULT_GLOBAL, ...(v.global ?? {}) } };
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
