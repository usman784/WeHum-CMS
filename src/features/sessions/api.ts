import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../../lib/api';
import { qk } from '../../lib/query';

export type SessionType = 'audio' | 'video' | 'youtube';
export type SessionStatus = 'draft' | 'scheduled' | 'live' | 'archived';
export type Access = 'free' | 'premium';

/** A meditation as the admin API returns it (`backend/src/modules/admin/content/sessions.ts`). */
export type Session = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  type: SessionType;
  access: Access;
  themeId: string | null;
  teacherId: string | null;
  tags: string[];
  durationSec: number;
  mediaId: string | null;
  youtubeId: string | null;
  coverMediaId: string | null;
  coverUrl: string | null;
  cover: { url: string; blurhash: string | null } | null;
  downloadable: boolean;
  isSos: boolean;
  sosFeeling: string | null;
  sosSubtitle: string | null;
  status: SessionStatus;
  publishAt: string | null;
  plays: number;
  completions: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

export type SessionDetail = Session & {
  /** Where this meditation is used. A meditation in a future MOTD or a program cannot be archived or deleted. */
  usage: { motdDates: string[]; programs: { id: string; title: string; day: number }[]; dedications: number };
};

/** The tabs of screen 03 (spec §9). "Free for you" and "Premium" filter by access; "SoS" by the SoS flag. */
export const TABS = [
  { value: 'all', label: 'All' },
  { value: 'free', label: 'Free for you' },
  { value: 'premium', label: 'Premium' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'drafts', label: 'Drafts' },
  { value: 'sos', label: 'SoS' },
  { value: 'archived', label: 'Archived' },
] as const;
export type Tab = (typeof TABS)[number]['value'];

export type SessionFilters = { tab: Tab; q: string; theme: string; teacher: string; type: '' | SessionType };
export const NO_FILTERS: SessionFilters = { tab: 'all', q: '', theme: '', teacher: '', type: '' };

/** Filters → query string of `GET /v1/admin/sessions`. */
export function listQuery(f: SessionFilters) {
  const byTab: Record<Tab, Record<string, string>> = {
    all: {},
    free: { access: 'free' },
    premium: { access: 'premium' },
    scheduled: { tab: 'scheduled' },
    drafts: { tab: 'drafts' },
    sos: { sos: 'true' },
    archived: { tab: 'archived' },
  };
  return {
    ...byTab[f.tab],
    q: f.q.trim() || undefined,
    theme: f.theme || undefined,
    teacher: f.teacher || undefined,
    type: f.type || undefined,
  };
}

const PAGE = 50;

/** All pages loaded so far, for the virtual table. The total is the same on every page. */
export function useSessions(filters: SessionFilters) {
  return useInfiniteQuery({
    queryKey: qk.session.list(filters),
    queryFn: ({ pageParam }) => api<Session[]>('/v1/admin/sessions', { query: { ...listQuery(filters), limit: PAGE, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    placeholderData: keepPreviousData, // the table does not flash while typing in the search box (spec §12)
  });
}

export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: qk.session.detail(id ?? ''),
    queryFn: () => api<SessionDetail>(`/v1/admin/sessions/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

/** Search for the "choose a meditation" pickers (program days, MOTD). */
export function useSessionSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: qk.session.list({ pick: q }),
    queryFn: () =>
      api<Session[]>('/v1/admin/sessions', { query: { q: q.trim() || undefined, limit: 20, sort: 'title' } }).then((r) => r.data),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export type YoutubeInfo = { youtubeId: string; title: string | null; thumbnailUrl: string; durationSec: number | null };
export type BulkResult = { results: { id: string; ok: boolean; error?: { code: string; message: string } }[]; ok: number; failed: number };

type Body = Partial<SessionValues> & { type?: SessionType };
const one = (path: string, init: Parameters<typeof api>[1]) => api<Session>(`/v1/admin/sessions${path}`, init).then((r) => r.data);

export const sessionApi = {
  create: (b: Body & { title: string; type: SessionType }) => one('', { method: 'POST', body: b }),
  update: (id: string, b: Body, version: number) => one(`/${id}`, { method: 'PATCH', body: b, ifMatch: version }),
  publish: (id: string, version?: number) => one(`/${id}/publish`, { method: 'POST', ifMatch: version }),
  schedule: (id: string, publishAt: string, version?: number) =>
    one(`/${id}/schedule`, { method: 'POST', body: { publishAt }, ifMatch: version }),
  archive: (id: string, version?: number) => one(`/${id}/archive`, { method: 'POST', ifMatch: version }),
  duplicate: (id: string) => one(`/${id}/duplicate`, { method: 'POST' }),
  remove: (id: string) => api(`/v1/admin/sessions/${id}`, { method: 'DELETE' }),
  bulk: (action: 'publish' | 'archive', ids: string[]) =>
    api<BulkResult>('/v1/admin/sessions/bulk', { method: 'POST', body: { action, ids } }).then((r) => r.data),
  resolveYoutube: (url: string) => api<YoutubeInfo>('/v1/admin/youtube/resolve', { method: 'POST', body: { url } }).then((r) => r.data),
};

export function useSessionCache() {
  const qc = useQueryClient();
  return {
    /** After a save: the open detail gets the new row (usage stays), lists and the theme/teacher counts are re-read. */
    saved: (row: Session) => {
      qc.setQueryData<SessionDetail>(qk.session.detail(row.id), (old) => (old ? { ...old, ...row } : old));
      void qc.invalidateQueries({ queryKey: [...qk.session.all, 'list'] });
      void qc.invalidateQueries({ queryKey: qk.theme.all });
      void qc.invalidateQueries({ queryKey: qk.teacher.all });
    },
    changed: () => qc.invalidateQueries({ queryKey: qk.session.all }),
  };
}

// ───────────── editor form ─────────────

const nullableText = (max: number, what: string) =>
  z
    .string()
    .trim()
    .max(max, `${what} can be at most ${max} characters`)
    .transform((v) => v || null);

/** "work stress, Morning" → ["work stress", "morning"]. At most 12 tags of 30 characters, no repeats. */
export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))]; // prettier-ignore
}

export const sessionSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(120, 'The title can be at most 120 characters'),
  description: nullableText(160, 'The description'),
  type: z.enum(['audio', 'video', 'youtube']),
  access: z.enum(['free', 'premium']),
  themeId: z.string().transform((v) => v || null),
  teacherId: z.string().transform((v) => v || null),
  tags: z.string().transform((v, ctx) => {
    const tags = parseTags(v);
    if (tags.length > 12) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use at most 12 tags' });
    if (tags.some((t) => t.length > 30)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A tag can be at most 30 characters' });
    return tags;
  }),
  mediaId: z.string().uuid().nullable(),
  youtubeId: z.string().nullable(),
  coverMediaId: z.string().uuid().nullable(),
  coverUrl: z.string().nullable(),
  durationSec: z.number().int().nullable(),
  downloadable: z.boolean(),
  sosFeeling: nullableText(40, 'The feeling'),
  sosSubtitle: nullableText(80, 'The subtitle'),
});
export type SessionInput = z.input<typeof sessionSchema>;
export type SessionValues = z.output<typeof sessionSchema>;

export const blankSession: SessionInput = {
  title: '',
  description: '',
  type: 'audio',
  access: 'premium',
  themeId: '',
  teacherId: '',
  tags: '',
  mediaId: null,
  youtubeId: null,
  coverMediaId: null,
  coverUrl: null,
  durationSec: null,
  downloadable: true,
  sosFeeling: '',
  sosSubtitle: '',
};

export const sessionToForm = (s: Session): SessionInput => ({
  title: s.title,
  description: s.description ?? '',
  type: s.type,
  access: s.access,
  themeId: s.themeId ?? '',
  teacherId: s.teacherId ?? '',
  tags: s.tags.join(', '),
  mediaId: s.mediaId,
  youtubeId: s.youtubeId,
  coverMediaId: s.coverMediaId,
  coverUrl: s.coverUrl,
  durationSec: s.durationSec || null,
  downloadable: s.downloadable,
  sosFeeling: s.sosFeeling ?? '',
  sosSubtitle: s.sosSubtitle ?? '',
});

/**
 * Form values → request body. YouTube items are always free and carry no file; uploads carry no YouTube id.
 * `durationSec` is only sent when known (the API takes it from the processed file otherwise).
 */
export function toBody(v: SessionValues): Body {
  const { durationSec, ...rest } = v;
  const youtube = v.type === 'youtube';
  return {
    ...rest,
    access: youtube ? 'free' : v.access,
    mediaId: youtube ? null : v.mediaId,
    youtubeId: youtube ? v.youtubeId : null,
    downloadable: youtube ? false : v.downloadable,
    ...(durationSec ? { durationSec } : {}),
  } as Body;
}

/**
 * Only the fields this admin changed. A save that sends the whole form would undo what someone else saved in
 * other fields meanwhile (spec §6.1: nothing is overwritten silently). Changing the type changes the fields it implies.
 */
export function changedBody(v: SessionValues, dirtyFields: Record<string, unknown>): Body {
  const keys = new Set(Object.keys(dirtyFields));
  if (keys.has('type')) ['access', 'mediaId', 'youtubeId', 'downloadable'].forEach((k) => keys.add(k));
  return Object.fromEntries(Object.entries(toBody(v)).filter(([k]) => keys.has(k))) as Body;
}

/** Why "Publish" cannot work yet, or null when it can (the API checks the same: nothing goes live without something to play). */
export function publishBlocker(
  v: { type: SessionType; mediaId: string | null; youtubeId: string | null },
  mediaReady: boolean,
  uploading: boolean,
) {
  if (v.type === 'youtube') return v.youtubeId ? null : 'Add the YouTube link first.';
  if (uploading) return 'Wait until the file has finished uploading and processing.';
  if (!v.mediaId) return `Upload the ${v.type} file first.`;
  return mediaReady ? null : 'The file is still being processed.';
}
