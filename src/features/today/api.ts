import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { qk } from '../../lib/query';
import { addDays } from '../daily/api';
import type { ConfigDoc } from '../config/useConfigForm';

export const LENGTHS = [10, 30, 45] as const;
export type Length = (typeof LENGTHS)[number];

export type Variant = { mediaId: string; status: 'uploading' | 'processing' | 'ready' | 'failed'; durationSec: number | null };

/** One day of the Meditation of the Day, as the API lists it. A day nobody has chosen has `sessionId: null`. */
export type MotdDay = {
  date: string;
  sessionId: string | null;
  sessionTitle?: string;
  sessionStatus?: 'draft' | 'scheduled' | 'live' | 'archived';
  groupStartUtc?: string | null;
  groupLengthMin?: Length | null;
  variants: Record<Length, Variant | null> | null;
  /** All three lengths uploaded and processed. */
  complete: boolean;
  practicedToday?: number;
  version?: number;
};

export type TodayRules = {
  emptyRoomThreshold: number;
  freeHomePick: 'random' | 'newest';
  showDailyMessage: boolean;
  sections: { progress: boolean; liveCounter: boolean; worldMap: boolean };
};

export const FREE_PICKS: { value: TodayRules['freeHomePick']; label: string }[] = [
  { value: 'random', label: 'A random free meditation each day' },
  { value: 'newest', label: 'The newest free meditation' },
];

/** The Monday on or before a `yyyy-MM-dd` day. */
export const weekStart = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
export const weekDays = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

/** "Sep 28 – Oct 4" */
export function weekLabel(start: string): string {
  const f = (d: string, withMonth = true) =>
    new Intl.DateTimeFormat('en-US', { month: withMonth ? 'short' : undefined, day: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${d}T00:00:00Z`),
    );
  return `${f(start)} – ${f(addDays(start, 6))}`;
}

/** Lengths that still need a file, e.g. [45]. Empty for a day that has no meditation (nothing to upload yet). */
export const missingLengths = (d: MotdDay): Length[] =>
  d.sessionId && d.variants ? LENGTHS.filter((l) => d.variants![l]?.status !== 'ready') : [];

/** The line under the title in the list. */
export function dayNote(d: MotdDay): string {
  if (!d.sessionId) return 'Not chosen yet · falls back to the most played session';
  const missing = missingLengths(d);
  if (missing.length === 0) return '10 · 30 · 45 min ready';
  const waiting = LENGTHS.filter((l) => d.variants?.[l] && d.variants[l]!.status !== 'ready' && d.variants[l]!.status !== 'failed');
  return `Missing ${missing.map((l) => `${l} min`).join(', ')}${waiting.length ? ' (processing)' : ''}`;
}

export function useMotdWeek(from: string) {
  const to = addDays(from, 6);
  return useQuery({
    queryKey: qk.motd.list({ from, to }),
    queryFn: () => api<MotdDay[]>('/v1/admin/motd', { query: { from, to } }).then((r) => r.data),
  });
}

export const motdApi = {
  set: (date: string, body: { sessionId: string; groupStartUtc?: string | null; groupLengthMin?: Length | null }, version?: number) =>
    api<{ version: number }>(`/v1/admin/motd/${date}`, { method: 'PUT', body, ifMatch: version }).then((r) => r.data),
  variant: (date: string, len: Length, mediaId: string) =>
    api<{ version: number }>(`/v1/admin/motd/${date}/variants/${len}`, { method: 'PUT', body: { mediaId } }).then((r) => r.data),
  swap: (a: string, b: string) => api<MotdDay[]>('/v1/admin/motd/swap', { method: 'POST', body: { a, b } }).then((r) => r.data),
};

const RULES_KEY = ['config', 'today'] as const;

export function useTodayRules() {
  return useQuery({ queryKey: RULES_KEY, queryFn: () => api<ConfigDoc<TodayRules>>('/v1/admin/config/today').then((r) => r.data) });
}

export const rulesApi = {
  save: (value: TodayRules, version: number) =>
    api<ConfigDoc<TodayRules>>('/v1/admin/config/today', { method: 'PUT', body: value, ifMatch: version }).then((r) => r.data),
};

export function useTodayCache(from: string) {
  const qc = useQueryClient();
  const key = qk.motd.list({ from, to: addDays(from, 6) });
  return {
    rules: (doc: ConfigDoc<TodayRules>) => qc.setQueryData(RULES_KEY, doc),
    days: (fn: (days: MotdDay[]) => MotdDay[]) => qc.setQueryData<MotdDay[]>(key, (old) => (old ? fn(old) : old)),
    refresh: () => qc.invalidateQueries({ queryKey: qk.motd.all }),
  };
}
