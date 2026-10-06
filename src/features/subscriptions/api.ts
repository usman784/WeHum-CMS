import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, download } from '../../lib/api';
import { qk } from '../../lib/query';

/** `GET /v1/admin/subscriptions/summary` (backend `subscriptions.admin.ts`). Money is RevenueCat's own USD price. */
export type Founding = { taken: number; cap: number; left: number; open: boolean; closedAt: string | null; productId: string };
export type SubsSummary = {
  payingMembers: { total: number; founding: number; annual: number; monthly: number };
  inTrial: number;
  mrrUsd: number;
  /** Share of trials started in the last 30 days that became paid; null when none started. */
  trialToPaid: number | null;
  trialsStarted30d: number;
  cancelled: number;
  paymentProblems: number;
  founding: Founding;
  plans: { productId: string | null; priceUsd: number | null; trialDays: number; active: number }[];
};

export type Member = {
  userId: string;
  name: string | null;
  email: string | null;
  country: string | null;
  productId: string | null;
  periodType: string | null;
  store: string | null;
  active: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  willRenew: boolean;
  billingIssue: boolean;
  isFounding: boolean;
};

export type SubsEvent = {
  id: string;
  type: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  productId: string | null;
  periodType: string | null;
  priceUsd: number | null;
  eventAt: string;
};

export const MEMBER_TABS = [
  { value: 'all', label: 'All' },
  { value: 'trial', label: 'Trial' },
  { value: 'annual', label: 'Annual' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'problem', label: 'Payment problem' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;
export type MemberTab = (typeof MEMBER_TABS)[number]['value'];

export function useSubsSummary() {
  return useQuery({
    queryKey: qk.subscriptions.summary,
    queryFn: () => api<SubsSummary>('/v1/admin/subscriptions/summary').then((r) => r.data),
  });
}

export function useMembers(tab: MemberTab) {
  return useInfiniteQuery({
    queryKey: qk.subscriptions.members({ tab }),
    queryFn: ({ pageParam }) => api<Member[]>('/v1/admin/subscriptions/members', { query: { tab, limit: 30, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useSubsEvents() {
  return useQuery({
    queryKey: qk.subscriptions.events,
    queryFn: () => api<SubsEvent[]>('/v1/admin/subscriptions/events', { query: { limit: 8 } }).then((r) => r.data),
  });
}

export const subsApi = {
  closeFounding: () => api<Founding>('/v1/admin/offers/founding/close', { method: 'POST' }).then((r) => r.data),
  exportMembers: (tab: MemberTab) => download('/v1/admin/subscriptions/members/export', `wehum-members-${tab}.csv`, { tab }),
};

/** "Annual · Founding", "Monthly", "Annual" from a product id (store product ids are the source, spec §8.4). */
export function planName(productId: string | null, isFounding = false) {
  if (!productId) return '—';
  if (/monthly/i.test(productId)) return 'Monthly';
  if (isFounding || /founding/i.test(productId)) return 'Annual · Founding';
  return 'Annual';
}

/** Plan price as the design writes it: "$59 / year", "$9.99 / month". */
export function priceLabel(productId: string | null, priceUsd: number | null) {
  if (priceUsd === null) return '—';
  const n = Number.isInteger(priceUsd) ? `$${priceUsd}` : `$${priceUsd.toFixed(2)}`;
  return `${n} / ${/monthly/i.test(productId ?? '') ? 'month' : 'year'}`;
}

/** RevenueCat event → one line of the "Latest events" feed. */
const EVENT_TITLE: Record<string, string> = {
  INITIAL_PURCHASE: 'New member',
  RENEWAL: 'Renewed',
  CANCELLATION: 'Auto-renew turned off',
  UNCANCELLATION: 'Auto-renew turned on again',
  BILLING_ISSUE: 'Payment problem',
  EXPIRATION: 'Membership ended',
  PRODUCT_CHANGE: 'Changed plan',
  TRANSFER: 'Moved to another account',
  SUBSCRIPTION_PAUSED: 'Paused',
  REFUND: 'Refund',
  NON_RENEWING_PURCHASE: 'Gift or one-time purchase',
  TEMPORARY_ENTITLEMENT_GRANT: 'Temporary access (store outage)',
};
export type EventTone = 'success' | 'teal' | 'warning' | 'muted';
export function eventLine(e: SubsEvent): { title: string; tone: EventTone } {
  if (e.type === 'INITIAL_PURCHASE' && e.periodType === 'trial') return { title: 'Started free trial', tone: 'teal' };
  if (e.type === 'RENEWAL' && e.periodType === 'normal') return { title: 'Paid renewal', tone: 'success' };
  if (e.type === 'INITIAL_PURCHASE')
    return { title: `New ${/monthly/i.test(e.productId ?? '') ? 'monthly' : 'annual'} member`, tone: 'success' };
  const title = EVENT_TITLE[e.type] ?? e.type.toLowerCase().replace(/_/g, ' ');
  const tone: EventTone = ['BILLING_ISSUE', 'REFUND'].includes(e.type)
    ? 'warning'
    : ['CANCELLATION', 'EXPIRATION'].includes(e.type)
      ? 'muted'
      : 'teal';
  return { title, tone };
}
