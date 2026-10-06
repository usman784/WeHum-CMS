import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { qk } from '../../lib/query';

export type Attention =
  | { kind: 'reported_dedications'; count: number }
  | { kind: 'missing_daily_message'; date: string }
  | { kind: 'motd_missing_variant'; date: string; title: string; lengths: number[] }
  | { kind: 'motd_missing'; date: string }
  | { kind: 'founding'; taken: number; cap: number };

export type DashboardKpis = {
  liveNow: number;
  liveCountries: number;
  meditationsToday: number;
  meditationsLastWeekSameDay: number;
  meditationsDeltaPct: number | null;
  payingMembers: number;
  inTrial: number;
  mrrUsd: number;
  library: { sessions: number; programs: number; themes: number };
  founding?: { taken: number; cap: number; open: boolean };
  moderationOpen?: number;
};

export type Dashboard = {
  at: number;
  kpis: DashboardKpis;
  moderationOpen: number;
  dailyMessages: {
    date: string;
    title: string | null;
    type: 'audio' | 'video' | 'text' | null;
    status: 'draft' | 'scheduled' | 'live' | 'archived' | 'missing';
  }[];
  topSessions: { id: string; title: string; theme: string | null; plays: number; completion: number | null }[];
  needsAttention: Attention[];
  nextGroup: { startsAt: string; title: string | null; lengthMin: number; state: string; waiting: number };
};

/** Moderators get only the moderation slice. */
export type DashboardSlim = { at: number; moderationOpen: number; needsAttention: Attention[] };
export const isFull = (d: Dashboard | DashboardSlim): d is Dashboard => 'kpis' in d && !!(d as Dashboard).kpis?.library;

export function useDashboard() {
  return useQuery({
    queryKey: qk.dashboard,
    queryFn: () => api<Dashboard | DashboardSlim>('/v1/admin/dashboard').then((r) => r.data),
    staleTime: 15_000,
  });
}

/** "Mon, Sep 28" */
export const shortDay = (date: string) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
