import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { qk } from '../../lib/query';
import type { ConfigDoc } from '../config/useConfigForm';

/** One post in the queue (`CommunityService.queue`). People are first name + country only. */
export type Post = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  userId: string;
  firstName: string;
  country: string | null;
  text: string;
  status: 'visible' | 'flagged' | 'hidden';
  /** "profanity", "crisis" … set by the rules when the post was written. */
  autoFlags: string[];
  reportCount: number;
  /** Why people reported it ("spam", "abusive", "self_harm", "personal_info", "other"). */
  reasons: string[];
  /** Crisis words: shown first, and the writer saw the SoS help card. */
  crisis: boolean;
  holdingCount: number;
  userMuted: boolean;
  createdAt: string;
  moderatedAt: string | null;
};
export type ModStats = { posts: number; flagged: number; hidden: number; kept: number; open: number };
export type ModRules = {
  dailyLimit: number;
  autoHideReports: number;
  blockLinks: boolean;
  profanity: boolean;
  crisisWords: string[];
  muteAfterHides: number;
};

export const FILTERS = [
  { value: 'review', label: 'Needs review' },
  { value: 'flagged', label: 'Auto-flagged' },
  { value: 'all', label: 'All posts' },
  { value: 'hidden', label: 'Hidden' },
] as const;
export type ModFilter = (typeof FILTERS)[number]['value'];
export type QueueFilters = { filter: ModFilter; sessionId: string };

export function useQueue(f: QueueFilters) {
  return useInfiniteQuery({
    queryKey: qk.moderation(f),
    queryFn: ({ pageParam }) =>
      api<Post[]>('/v1/admin/moderation', {
        query: { filter: f.filter, sessionId: f.sessionId || undefined, limit: 30, cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useModStats() {
  return useQuery({
    queryKey: qk.moderation({ stats: true }),
    queryFn: () => api<ModStats>('/v1/admin/moderation/stats').then((r) => r.data),
  });
}

/** Sessions for the "Session" filter: the published ones, by title. */
export function useSessionOptions() {
  return useQuery({
    queryKey: qk.session.list({ pick: 'moderation' }),
    queryFn: () =>
      api<{ id: string; title: string }[]>('/v1/admin/sessions', { query: { status: 'live', limit: 100, sort: 'title' } }).then(
        (r) => r.data,
      ),
    staleTime: 60_000,
  });
}

const RULES_KEY = ['config', 'moderation'] as const;
export function useRules() {
  return useQuery({ queryKey: RULES_KEY, queryFn: () => api<ConfigDoc<ModRules>>('/v1/admin/moderation/rules').then((r) => r.data) });
}

export const modApi = {
  hide: (id: string) =>
    api<{ id: string; status: string; autoMuted: boolean }>(`/v1/admin/moderation/${id}/hide`, { method: 'POST' }).then((r) => r.data),
  keep: (id: string) => api<{ id: string; status: string }>(`/v1/admin/moderation/${id}/keep`, { method: 'POST' }).then((r) => r.data),
  bulk: (action: 'hide' | 'keep', ids: string[]) =>
    api<{ results: { id: string; ok: boolean; error?: string }[] }>('/v1/admin/moderation/bulk', {
      method: 'POST',
      body: { action, ids },
    }).then((r) => r.data),
  mute: (userId: string, muted: boolean) => api(`/v1/admin/users/${userId}/mute`, { method: 'POST', body: { muted } }),
  saveRules: (value: ModRules, version: number) =>
    api<ConfigDoc<ModRules>>('/v1/admin/moderation/rules', { method: 'PUT', body: value, ifMatch: version }).then((r) => r.data),
};

export function useModCache() {
  const qc = useQueryClient();
  return {
    /** Something changed in the queue (a decision, a new post): re-read lists and today's numbers. */
    refresh: () => void qc.invalidateQueries({ queryKey: ['moderation'] }),
    rulesSaved: (doc: ConfigDoc<ModRules>) => qc.setQueryData(RULES_KEY, doc),
  };
}

const REASON: Record<string, string> = {
  spam: 'spam',
  abusive: 'abusive',
  self_harm: 'self-harm',
  personal_info: 'personal info',
  other: 'other',
};
const FLAG: Record<string, string> = { link: 'link detected', profanity: 'profanity', crisis: 'crisis words', handle: 'handle detected' };

/** The chips on a post: reports first (ember), then what the rules found (teal). */
export function reasonChips(p: Pick<Post, 'reportCount' | 'reasons' | 'autoFlags'>): { text: string; tone: 'ember' | 'teal' }[] {
  const out: { text: string; tone: 'ember' | 'teal' }[] = [];
  if (p.reportCount > 0)
    out.push({
      text: `Reported ×${p.reportCount}${p.reasons.length ? ` · ${p.reasons.map((r) => REASON[r] ?? r).join(', ')}` : ''}`,
      tone: 'ember',
    });
  for (const f of p.autoFlags) out.push({ text: `Auto · ${FLAG[f] ?? f}`, tone: 'teal' });
  return out;
}
