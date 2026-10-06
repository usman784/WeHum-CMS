import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, download } from '../../lib/api';
import { qk } from '../../lib/query';

/** Periods the API accepts (UTC days, `AnalyticsService.assertPeriod`). */
export const PERIODS = [7, 14, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export type Kpi = { value: number | null; previous: number | null; deltaPct: number | null };
export type Trends = {
  period: number;
  from: string;
  to: string;
  tz: 'UTC';
  kpis: { activeUsers: Kpi; meditations: Kpi; minutes: Kpi; avgLengthMin: Kpi; newPaying: Kpi };
  perDay: { date: string; solo: number; group: number; minutes: number; activeUsers: number; newUsers: number }[];
  byTheme: { theme: string; minutes: number; share: number }[];
  countries: { country: string; members: number; share: number }[];
  peakLive: number;
};
export const FUNNEL_STEPS = ['installed', 'introDone', 'firstMeditation', 'continuedFree', 'trialStarted', 'savedAccount', 'paid'] as const;
export type FunnelStep = { key: (typeof FUNNEL_STEPS)[number]; count: number; share: number | null };
export type Funnel = { period: number; from: string; to: string; steps: FunnelStep[] };
export type Retention = { retention: { day: number; cohort: number; retained: number; rate: number | null }[]; at: string };

export const FUNNEL_LABEL: Record<FunnelStep['key'], string> = {
  installed: 'Installed',
  introDone: 'Finished intro (setup done)',
  firstMeditation: 'Finished first meditation (beta focus)',
  continuedFree: 'Continued free (guest)',
  trialStarted: 'Started 7-day trial (no login)',
  savedAccount: 'Saved an account (optional)',
  paid: 'Became paid member',
};

export function useTrends(period: Period) {
  return useQuery({
    queryKey: qk.analytics({ period }),
    queryFn: () => api<Trends>('/v1/admin/analytics', { query: { period } }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
}
export function useFunnel(period: Period) {
  return useQuery({
    queryKey: qk.analytics({ period, funnel: true }),
    queryFn: () => api<Funnel>('/v1/admin/analytics/funnel', { query: { period } }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
}
export function useRetention() {
  return useQuery({
    queryKey: qk.analytics({ retention: true }),
    queryFn: () => api<Retention>('/v1/admin/analytics/retention').then((r) => r.data),
  });
}

export const analyticsApi = {
  exportCsv: (period: Period) => download('/v1/admin/analytics/export', `wehum-analytics-${period}d.csv`, { period }),
};

/** "8.9k", "39.9k", "512k" for the KPI tiles (design: Analytics.dc.html). */
export function compact(n: number | null) {
  if (n === null) return '—';
  if (Math.abs(n) < 10_000) return new Intl.NumberFormat('en-US').format(n);
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n).toLowerCase();
}

/** "+9% vs prior" (or "−0.4 min vs prior" for the average length, which is compared in minutes). */
export function deltaText(k: Kpi, unit?: 'min') {
  if (k.value === null || k.previous === null || (!k.previous && unit !== 'min')) return 'No data for the prior period';
  if (unit === 'min') {
    const d = Math.round((k.value - k.previous) * 10) / 10;
    return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)} min vs prior`;
  }
  const p = k.deltaPct ?? 0;
  return `${p > 0 ? '+' : p < 0 ? '−' : '±'}${Math.abs(Math.round(p))}% vs prior`;
}
