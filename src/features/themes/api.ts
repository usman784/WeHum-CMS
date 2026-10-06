import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../../lib/api';
import { qk } from '../../lib/query';

export type Theme = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  iconKey: string | null;
  order: number;
  visible: boolean;
  version: number;
  updatedAt: string;
  /** Meditations in this theme (archived ones not counted) and their shortest / longest length. */
  sessionCount: number;
  minDurationSec: number | null;
  maxDurationSec: number | null;
};

/** Mirrors the backend DTO (`admin/content/themes.ts`). Empty text is sent as null. */
const optionalText = (max: number, what: string) =>
  z
    .string()
    .trim()
    .max(max, `${what} can be at most ${max} characters`)
    .transform((v) => v || null);

export const themeSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60, 'The name can be at most 60 characters'),
  subtitle: optionalText(120, 'The subtitle'),
  description: optionalText(2000, 'The description'),
  iconKey: z.string().max(40).nullable(),
  visible: z.boolean(),
});
export type ThemeInput = z.input<typeof themeSchema>;
export type ThemeValues = z.output<typeof themeSchema>;

const LIST = qk.theme.list();

export function useThemes() {
  return useQuery({ queryKey: LIST, queryFn: () => api<Theme[]>('/v1/admin/themes').then((r) => r.data) });
}

/** Counts come from the list endpoint, so a saved row keeps the counts it had. */
const merge = (old: Theme[] | undefined, row: Theme) => old?.map((t) => (t.id === row.id ? { ...t, ...row } : t));

export const themeApi = {
  create: (v: ThemeValues) => api<Theme>('/v1/admin/themes', { method: 'POST', body: v }).then((r) => r.data),
  update: (id: string, v: Partial<ThemeValues>, version: number) =>
    api<Theme>(`/v1/admin/themes/${id}`, { method: 'PATCH', body: v, ifMatch: version }).then((r) => r.data),
  reorder: (ids: string[]) => api<Theme[]>('/v1/admin/themes/order', { method: 'PUT', body: { ids } }).then((r) => r.data),
  remove: (id: string, reassignTo?: string) => api(`/v1/admin/themes/${id}`, { method: 'DELETE', query: { reassignTo } }),
};

export function useThemeCache() {
  const qc = useQueryClient();
  return {
    saved: (row: Theme) => qc.setQueryData<Theme[]>(LIST, (old) => merge(old, row)),
    added: (row: Theme) =>
      qc.setQueryData<Theme[]>(LIST, (old) => [...(old ?? []), { ...row, sessionCount: 0, minDurationSec: null, maxDurationSec: null }]),
    refresh: () => qc.invalidateQueries({ queryKey: qk.theme.all }),
  };
}

/** Drag reorder: the list changes at once and goes back if the server refuses (spec §6.1 optimistic UI). */
export function useReorderThemes(onError: (e: unknown) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (next: Theme[]) => themeApi.reorder(next.map((t) => t.id)),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: LIST });
      const before = qc.getQueryData<Theme[]>(LIST);
      qc.setQueryData<Theme[]>(
        LIST,
        next.map((t, i) => ({ ...t, order: i })),
      );
      return { before };
    },
    onError: (e, _next, ctx) => {
      qc.setQueryData(LIST, ctx?.before);
      onError(e);
    },
    onSuccess: (rows) => qc.setQueryData(LIST, rows),
  });
}
