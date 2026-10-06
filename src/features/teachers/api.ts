import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../../lib/api';
import { qk } from '../../lib/query';

export type Teacher = {
  id: string;
  name: string;
  role: string | null;
  specialty: string | null;
  bio: string | null;
  quote: string | null;
  photoMediaId: string | null;
  photoUrl: string | null;
  youtubeUrl: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
  visible: boolean;
  canLeadGroup: boolean;
  version: number;
  updatedAt: string;
  /** Meditations voiced by this teacher (archived ones not counted). */
  sessionCount: number;
};

const text = (max: number, what: string) =>
  z
    .string()
    .trim()
    .max(max, `${what} can be at most ${max} characters`)
    .transform((v) => v || null);

/** "youtube.com/raphael" → "https://youtube.com/raphael". Empty → null. Anything that is not a web address is refused. */
export function toUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes('.') ? u.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

/** "@raphael.meditates" or a full link → the Instagram profile URL. */
export function toInstagramUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^@?[\w.]{1,30}$/.test(v)) return `https://instagram.com/${v.replace(/^@/, '')}`;
  const u = toUrl(v);
  return u && /(^|\.)instagram\.com$/.test(new URL(u).hostname) ? u : null;
}

/** The handle to show in the form for a stored profile URL. */
export const instagramHandle = (url: string | null) => {
  const m = url ? /instagram\.com\/([\w.]+)/.exec(url) : null;
  return m ? `@${m[1]}` : (url ?? '');
};

const link = (convert: (v: string) => string | null, message: string) =>
  z.string().transform((v, ctx) => {
    const out = convert(v);
    if (v.trim() && !out) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    return out;
  });

export const teacherSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80, 'The name can be at most 80 characters'),
  role: text(80, 'The role label'),
  specialty: text(120, 'The specialty'),
  bio: text(4000, 'The bio'),
  quote: text(280, 'The quote'),
  youtubeUrl: link(toUrl, 'Enter a link, for example youtube.com/yourchannel'),
  instagramUrl: link(toInstagramUrl, 'Enter a handle like @name, or an instagram.com link'),
  websiteUrl: link(toUrl, 'Enter a web address, for example https://example.com'),
  photoMediaId: z.string().uuid().nullable(),
  visible: z.boolean(),
  canLeadGroup: z.boolean(),
});
export type TeacherInput = z.input<typeof teacherSchema>;
export type TeacherValues = z.output<typeof teacherSchema>;

const LIST = qk.teacher.list();

export function useTeachers() {
  return useQuery({ queryKey: LIST, queryFn: () => api<Teacher[]>('/v1/admin/teachers').then((r) => r.data) });
}

export const teacherApi = {
  create: (v: TeacherValues) => api<Teacher>('/v1/admin/teachers', { method: 'POST', body: v }).then((r) => r.data),
  update: (id: string, v: Partial<TeacherValues>, version: number) =>
    api<Teacher>(`/v1/admin/teachers/${id}`, { method: 'PATCH', body: v, ifMatch: version }).then((r) => r.data),
};

export function useTeacherCache() {
  const qc = useQueryClient();
  return {
    saved: (row: Teacher) => qc.setQueryData<Teacher[]>(LIST, (old) => old?.map((t) => (t.id === row.id ? { ...t, ...row } : t))),
    added: (row: Teacher) =>
      qc.setQueryData<Teacher[]>(LIST, (old) => [...(old ?? []), { ...row, sessionCount: 0 }].sort((a, b) => a.name.localeCompare(b.name))),
  };
}
