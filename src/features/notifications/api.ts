import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { qk } from '../../lib/query';

export type Audience = 'all' | 'members' | 'free' | 'trial' | 'guests' | 'founding' | 'country';
export type SendMode = 'now' | 'user_reminder_time' | 'scheduled';
export type NotificationStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed';

/** A one-off announcement (`notifications` table). */
export type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  countries: string[];
  deepLink: string | null;
  sendMode: SendMode;
  sendAt: string | null;
  status: NotificationStatus;
  targeted: number;
  delivered: number;
  opened: number;
  failed: number;
  createdAt: string;
  version: number;
};
export type AutoNotification = { key: string; enabled: boolean; title: string; body: string; delivered: number; opened: number };
export type AudienceCount = { targeted: number; quiet: number; quietHours: { start: string; end: string } };

export type Draft = {
  title: string;
  body: string;
  audience: Audience;
  countries: string[];
  deepLink: string | null;
  sendMode: SendMode;
  sendAt: string | null;
};
export const EMPTY_DRAFT: Draft = { title: '', body: '', audience: 'all', countries: [], deepLink: null, sendMode: 'now', sendAt: null };
export const TITLE_MAX = 50;
export const BODY_MAX = 150;

export const AUDIENCES: { value: Audience; label: string }[] = [
  { value: 'all', label: 'Everyone with push on' },
  { value: 'members', label: 'Members (paying and trial)' },
  { value: 'trial', label: 'People in a free trial' },
  { value: 'free', label: 'Free users' },
  { value: 'guests', label: 'Guests (no account yet)' },
  { value: 'founding', label: 'Founding members' },
  { value: 'country', label: 'People in some countries' },
];
export const audienceLabel = (a: Audience) => AUDIENCES.find((x) => x.value === a)?.label ?? a;

export const SEND_MODES: { value: SendMode; label: string }[] = [
  { value: 'user_reminder_time', label: 'At each user’s daily reminder time' },
  { value: 'now', label: 'Now' },
  { value: 'scheduled', label: 'At a set time' },
];

/** What the push opens in the app. Session and program links carry an id. */
export const OPENS = [
  { value: '', label: 'The app (no special screen)' },
  { value: 'wehum://today', label: 'Today' },
  { value: 'wehum://group', label: 'Group meditation' },
  { value: 'wehum://membership', label: 'Membership' },
  { value: 'session', label: 'A session…' },
  { value: 'program', label: 'A program…' },
] as const;

const KEY = qk.notification.all;

export function useAnnouncements() {
  return useQuery({
    queryKey: qk.notification.list(),
    queryFn: () => api<Announcement[]>('/v1/admin/notifications', { query: { limit: 30 } }).then((r) => r.data),
  });
}

export function useAutomatic() {
  return useQuery({
    queryKey: qk.notification.list({ automatic: true }),
    queryFn: () => api<AutoNotification[]>('/v1/admin/notifications/automatic').then((r) => r.data),
  });
}

/** How many people the audience reaches, and how many of them are in quiet hours at that moment. */
export function useAudienceCount(audience: Audience, countries: string[], at: string | null) {
  return useQuery({
    queryKey: [...KEY, 'audience', audience, countries.join(','), at ?? 'now'],
    queryFn: () =>
      api<AudienceCount>('/v1/admin/notifications/audience', {
        query: { audience, countries: countries.join(','), at: at ?? undefined },
      }).then((r) => r.data),
    enabled: audience !== 'country' || countries.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useLinkTargets(kind: 'session' | 'program' | null) {
  return useQuery({
    queryKey: [kind, 'list', { pick: 'push' }],
    queryFn: () =>
      kind === 'session'
        ? api<{ id: string; title: string }[]>('/v1/admin/sessions', { query: { status: 'live', limit: 100, sort: 'title' } }).then(
            (r) => r.data,
          )
        : api<{ id: string; title: string; status: string }[]>('/v1/admin/programs').then((r) => r.data.filter((p) => p.status === 'live')),
    enabled: !!kind,
    staleTime: 60_000,
  });
}

export const pushApi = {
  create: (d: Draft) => api<Announcement>('/v1/admin/notifications', { method: 'POST', body: d }).then((r) => r.data),
  update: (id: string, d: Partial<Draft>, version: number) =>
    api<Announcement>(`/v1/admin/notifications/${id}`, { method: 'PATCH', body: d, ifMatch: version }).then((r) => r.data),
  test: (id: string, email: string) => api(`/v1/admin/notifications/${id}/test`, { method: 'POST', body: { email } }),
  send: (id: string) =>
    api<Announcement & { quietCount: number }>(`/v1/admin/notifications/${id}/send`, { method: 'POST' }).then((r) => r.data),
  cancel: (id: string) => api<Announcement>(`/v1/admin/notifications/${id}/cancel`, { method: 'POST' }).then((r) => r.data),
  setAutomatic: (key: string, patch: Partial<Pick<AutoNotification, 'enabled' | 'title' | 'body'>>) =>
    api<AutoNotification>(`/v1/admin/notifications/automatic/${key}`, { method: 'PATCH', body: patch }).then((r) => r.data),
};

export function usePushCache() {
  const qc = useQueryClient();
  return {
    refresh: () => void qc.invalidateQueries({ queryKey: KEY }),
    /** Live delivery numbers of one announcement. */
    stats: (p: { id: string; delivered: number; opened: number; failed: number }) =>
      qc.setQueryData<Announcement[]>(qk.notification.list(), (old) => old?.map((n) => (n.id === p.id ? { ...n, ...p } : n))),
  };
}

/** Problems that block saving or sending (the API checks the same). */
export function draftProblems(d: Draft): Partial<Record<keyof Draft, string>> {
  const out: Partial<Record<keyof Draft, string>> = {};
  if (!d.title.trim()) out.title = 'Write a title';
  else if (d.title.length > TITLE_MAX) out.title = `At most ${TITLE_MAX} characters`;
  if (!d.body.trim()) out.body = 'Write the message';
  else if (d.body.length > BODY_MAX) out.body = `At most ${BODY_MAX} characters`;
  if (d.audience === 'country' && !d.countries.length) out.countries = 'Choose at least one country';
  if (d.sendMode === 'scheduled') {
    if (!d.sendAt) out.sendAt = 'Pick a time';
    else if (Date.parse(d.sendAt) < Date.now() + 60_000) out.sendAt = 'Pick a time in the future';
  }
  if (d.deepLink === 'session' || d.deepLink === 'program') out.deepLink = `Choose the ${d.deepLink}`;
  return out;
}

/** The automatic notifications, in the order and with the explanations of the design. */
export const AUTO_INFO: Record<string, { name: string; info: string }> = {
  daily_nudge: { name: 'Daily nudge', info: 'At each user’s chosen reminder time, in their own time zone.' },
  daily_message: { name: 'Daily Message is ready', info: 'Merged with the nudge if it is the same time.' },
  group_warning: { name: 'Group meditation in 10 minutes', info: '10 min before, only for people who tapped “Remind me”.' },
  trial_ending: { name: 'Trial ends in 2 days', info: 'Matches the paywall promise.' },
};
