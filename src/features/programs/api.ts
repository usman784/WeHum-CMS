import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../../lib/api';
import { qk } from '../../lib/query';
import type { SessionStatus, SessionType } from '../sessions/api';

export type ProgramDay = {
  day: number;
  sessionId: string;
  /** Optional day title; the meditation's own title is used when empty. */
  title: string | null;
  session: { id: string; title: string; durationSec: number; status: SessionStatus; type: SessionType; themeId: string | null } | null;
};

export type Program = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  access: 'free' | 'premium';
  unlockRule: 'next_day_0700' | 'immediate';
  status: 'draft' | 'live' | 'archived' | 'scheduled';
  version: number;
  updatedAt: string;
  days: ProgramDay[];
  /** Members who started the program, and who finished every day. */
  kpis: { started: number; completed: number };
};

/** The two unlock rules the app supports. There are no rest days and no grace days (spec §9). */
export const UNLOCK_RULES = [
  { value: 'next_day_0700', label: "Next day at 07:00 (member's time)" },
  { value: 'immediate', label: 'Right after the previous day' },
];

export const programSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(120, 'The title can be at most 120 characters'),
  description: z
    .string()
    .trim()
    .max(2000, 'The description can be at most 2000 characters')
    .transform((v) => v || null),
  access: z.enum(['free', 'premium']),
  unlockRule: z.enum(['next_day_0700', 'immediate']),
});
export type ProgramInput = z.input<typeof programSchema>;
export type ProgramValues = z.output<typeof programSchema>;

export type DayDraft = { key: string; sessionId: string; title: string | null; session: ProgramDay['session'] };

/** Days are always numbered 1…n in list order, with no gaps: the API refuses anything else. */
export const toDaysBody = (days: DayDraft[]) => days.map((d, i) => ({ day: i + 1, sessionId: d.sessionId, title: d.title }));

export const totalMinutes = (days: { session: ProgramDay['session'] }[]) =>
  Math.round(days.reduce((sum, d) => sum + (d.session?.durationSec ?? 0), 0) / 60);

/** Share of starters who finished, or null when nobody has started. */
export const finishRate = (k: Program['kpis']) => (k.started > 0 ? k.completed / k.started : null);

/** Why the program cannot go live yet, or null. */
export function programBlocker(days: DayDraft[]): string | null {
  if (!days.length) return 'Add at least one day first.';
  const notLive = days.filter((d) => d.session && d.session.status !== 'live').length;
  return notLive
    ? `${notLive} ${notLive === 1 ? 'day uses a meditation that is' : 'days use meditations that are'} not published yet.`
    : null;
}

const LIST = qk.program.list();

export function usePrograms() {
  return useQuery({ queryKey: LIST, queryFn: () => api<Program[]>('/v1/admin/programs').then((r) => r.data) });
}

export const programApi = {
  create: (title: string) => api<Program>('/v1/admin/programs', { method: 'POST', body: { title } }).then((r) => r.data),
  update: (id: string, b: Partial<ProgramValues> & { status?: 'draft' | 'live' | 'archived' }, version: number) =>
    api<Program>(`/v1/admin/programs/${id}`, { method: 'PATCH', body: b, ifMatch: version }).then((r) => r.data),
  putDays: (id: string, days: DayDraft[], version: number) =>
    api<Program>(`/v1/admin/programs/${id}/days`, { method: 'PUT', body: { days: toDaysBody(days) }, ifMatch: version }).then(
      (r) => r.data,
    ),
};

export function useProgramCache() {
  const qc = useQueryClient();
  return {
    saved: (row: Program) => qc.setQueryData<Program[]>(LIST, (old) => old?.map((p) => (p.id === row.id ? row : p))),
    added: (row: Program) =>
      qc.setQueryData<Program[]>(LIST, (old) => [...(old ?? []), row].sort((a, b) => a.title.localeCompare(b.title))),
    refresh: () => qc.invalidateQueries({ queryKey: qk.program.all }),
  };
}
