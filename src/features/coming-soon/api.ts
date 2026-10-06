import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { qk } from '../../lib/query';
import type { ConfigDoc } from '../config/useConfigForm';

/** A breathing template (backend `breath_patterns`): seconds for in, hold, out, hold. */
export type BreathPattern = {
  id: string;
  name: string;
  subtitle: string;
  inhaleSec: number;
  hold1Sec: number;
  exhaleSec: number;
  hold2Sec: number;
  rounds: number;
  sort: number;
  status: 'draft' | 'live' | 'archived';
  version: number;
};
export type PatternValues = Omit<BreathPattern, 'id' | 'status' | 'version'>;
export const EMPTY_PATTERN: PatternValues = {
  name: '',
  subtitle: '',
  inhaleSec: 4,
  hold1Sec: 0,
  exhaleSec: 4,
  hold2Sec: 0,
  rounds: 10,
  sort: 0,
};

export type Milestone = { key: string; label: string; badge: string; metric: string; target: number; reached: number };
export type BreathworkDoc = ConfigDoc<{ lessons: string[] }>;

const PATTERNS = qk.breathPattern.list();
const LESSONS = [...qk.config.all, 'breathwork'] as const;

export function usePatterns() {
  return useQuery({ queryKey: PATTERNS, queryFn: () => api<BreathPattern[]>('/v1/admin/breath-patterns').then((r) => r.data) });
}
export function useLessons() {
  return useQuery({ queryKey: LESSONS, queryFn: () => api<BreathworkDoc>('/v1/admin/breathwork').then((r) => r.data) });
}
export function useMilestones() {
  return useQuery({ queryKey: ['milestones'], queryFn: () => api<Milestone[]>('/v1/admin/milestones').then((r) => r.data) });
}

export const breathApi = {
  create: (v: PatternValues) => api<BreathPattern>('/v1/admin/breath-patterns', { method: 'POST', body: v }).then((r) => r.data),
  update: (id: string, v: Partial<PatternValues> & { status?: BreathPattern['status'] }, version: number) =>
    api<BreathPattern>(`/v1/admin/breath-patterns/${id}`, { method: 'PATCH', body: v, ifMatch: version }).then((r) => r.data),
  remove: (id: string) => api(`/v1/admin/breath-patterns/${id}`, { method: 'DELETE' }),
  saveLessons: (lessons: string[], version: number) =>
    api<BreathworkDoc>('/v1/admin/breathwork', { method: 'PUT', body: { lessons }, ifMatch: version }).then((r) => r.data),
};

export function useComingSoonCache() {
  const qc = useQueryClient();
  return {
    patternsChanged: () => void qc.invalidateQueries({ queryKey: qk.breathPattern.all }),
    lessonsSaved: (doc: BreathworkDoc) => qc.setQueryData(LESSONS, doc),
  };
}

/** "4 · 7 · 8" (holds of 0 between in and out are left out, as on the app's template cards; box breathing shows all four). */
export function patternLabel(p: Pick<BreathPattern, 'inhaleSec' | 'hold1Sec' | 'exhaleSec' | 'hold2Sec'>) {
  const beats = p.hold2Sec ? [p.inhaleSec, p.hold1Sec, p.exhaleSec, p.hold2Sec] : [p.inhaleSec, p.hold1Sec, p.exhaleSec];
  return beats.join(' · ');
}

/** Same checks as the API (`patternProblem`). */
export function patternProblem(p: Pick<BreathPattern, 'inhaleSec' | 'hold1Sec' | 'exhaleSec' | 'hold2Sec' | 'rounds'>) {
  const beats = [p.inhaleSec, p.hold1Sec, p.exhaleSec, p.hold2Sec];
  if (beats.some((b) => !Number.isInteger(b) || b < 0 || b > 20)) return 'Each beat is 0–20 seconds';
  if (p.inhaleSec < 1 || p.exhaleSec < 1) return 'Breathe in and out for at least 1 second';
  if (beats.reduce((a, b) => a + b, 0) > 60) return 'One round is at most 60 seconds';
  if (!Number.isInteger(p.rounds) || p.rounds < 1 || p.rounds > 100) return 'Rounds are 1–100';
  return null;
}
