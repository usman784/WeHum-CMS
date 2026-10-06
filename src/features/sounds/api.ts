import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../../lib/api';
import { qk } from '../../lib/query';

export type BlockKind = 'opening' | 'core' | 'closing' | 'sound' | 'bell' | 'loop';

export type SoundBlock = {
  id: string;
  kind: BlockKind;
  name: string;
  mediaId: string;
  durationSec: number;
  loopable: boolean;
  /** Postgres numeric: arrives as text, e.g. "-16.10". Null when it could not be measured. */
  loudnessLufs: string | null;
  access: 'free' | 'premium';
  order: number;
  visible: boolean;
  version: number;
};

/** Tab order and wording of screen 11 (spec §9). */
export const KINDS: { value: BlockKind; label: string; one: string; usedIn: string; tip: { title: string; body: string } }[] = [
  {
    value: 'opening',
    label: 'Openings',
    one: 'opening',
    usedIn: 'Build your own',
    tip: { title: 'Openings', body: 'Short voice openings that play first. Upload finished files; keep them 1–3 minutes.' },
  },
  {
    value: 'core',
    label: 'Core blocks',
    one: 'core block',
    usedIn: 'Build your own',
    tip: {
      title: 'Core blocks',
      body: 'The main part of a custom meditation. Guided blocks need a few spoken cues spread out, so the app can stretch them to the chosen length.',
    },
  },
  {
    value: 'closing',
    label: 'Closings',
    one: 'closing',
    usedIn: 'Build your own',
    tip: { title: 'Closings', body: 'How the meditation ends. A voice close, bells, or nothing.' },
  },
  {
    value: 'sound',
    label: 'Sounds',
    one: 'sound',
    usedIn: 'Build your own',
    tip: { title: 'Sounds', body: 'Background loops must end where they start, so the app can repeat them without a click.' },
  },
  {
    value: 'bell',
    label: 'Bells',
    one: 'bell',
    usedIn: 'Silence Room, Build your own',
    tip: {
      title: 'Bells',
      body: 'Used at the start, at intervals and at the end. Trim silence at the start of the file so the strike lands on time.',
    },
  },
  {
    value: 'loop',
    label: 'OM & mantra loops',
    one: 'loop',
    usedIn: 'Advanced builder',
    tip: {
      title: 'OM & mantra loops',
      body: 'Short pieces the advanced builder repeats. The start and end must match so loops join without a click.',
    },
  },
];

export const LUFS_TARGET = -16;
export const LUFS_TOLERANCE = 1;

/** Loudness verdict for the "Loudness check" card: every block should sit at −16 LUFS ±1 so joined blocks sound equally loud. */
export function loudness(lufs: string | number | null): { text: string; ok: boolean } | null {
  if (lufs === null) return null;
  const n = Number(lufs);
  if (!Number.isFinite(n)) return null;
  const shown = `${n.toFixed(1).replace('-', '−')} LUFS`;
  if (n > LUFS_TARGET + LUFS_TOLERANCE) return { text: `${shown} · too loud`, ok: false };
  if (n < LUFS_TARGET - LUFS_TOLERANCE) return { text: `${shown} · too quiet`, ok: false };
  return { text: `${shown} ✓`, ok: true };
}

/** 125 → "2 min", 40 → "40 s", 150 with loop → "2.5 min loop". */
export function blockLength(b: Pick<SoundBlock, 'durationSec' | 'loopable'>): string {
  const s = b.durationSec;
  if (!s) return '—';
  const base = s < 60 ? `${s} s` : `${Number((s / 60).toFixed(1))} min`;
  return b.loopable ? `${base} loop` : base;
}

export const blockSchema = z.object({
  name: z.string().trim().min(1, 'Enter the name people see in the app').max(80, 'The name can be at most 80 characters'),
  access: z.enum(['free', 'premium']),
  loopable: z.boolean(),
  visible: z.boolean(),
});
export type BlockValues = z.infer<typeof blockSchema>;

const LIST = qk.soundBlock.list();

export function useSoundBlocks() {
  return useQuery({ queryKey: LIST, queryFn: () => api<SoundBlock[]>('/v1/admin/sound-blocks').then((r) => r.data) });
}

export const blockApi = {
  create: (b: BlockValues & { kind: BlockKind; mediaId: string }) =>
    api<SoundBlock>('/v1/admin/sound-blocks', { method: 'POST', body: b }).then((r) => r.data),
  update: (id: string, b: Partial<BlockValues> & { mediaId?: string }, version: number) =>
    api<SoundBlock>(`/v1/admin/sound-blocks/${id}`, { method: 'PATCH', body: b, ifMatch: version }).then((r) => r.data),
  reorder: (ids: string[]) => api<SoundBlock[]>('/v1/admin/sound-blocks/order', { method: 'PUT', body: { ids } }).then((r) => r.data),
};

export function useBlockCache() {
  const qc = useQueryClient();
  return {
    saved: (row: SoundBlock) => qc.setQueryData<SoundBlock[]>(LIST, (old) => old?.map((b) => (b.id === row.id ? row : b))),
    added: (row: SoundBlock) => qc.setQueryData<SoundBlock[]>(LIST, (old) => [...(old ?? []), row]),
  };
}

/** Reorder inside one kind: shown at once, undone if the server refuses. */
export function useReorderBlocks(onError: (e: unknown) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (next: SoundBlock[]) => blockApi.reorder(next.map((b) => b.id)),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: LIST });
      const before = qc.getQueryData<SoundBlock[]>(LIST);
      const order = new Map(next.map((b, i) => [b.id, i]));
      qc.setQueryData<SoundBlock[]>(LIST, (old) =>
        old
          ?.map((b) => (order.has(b.id) ? { ...b, order: order.get(b.id)! } : b))
          .sort((a, b) => a.kind.localeCompare(b.kind) || a.order - b.order || a.id.localeCompare(b.id)),
      );
      return { before };
    },
    onError: (e, _n, ctx) => {
      qc.setQueryData(LIST, ctx?.before);
      onError(e);
    },
    onSuccess: (rows) => qc.setQueryData(LIST, rows),
  });
}
