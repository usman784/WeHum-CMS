import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { qk } from '../../lib/query';
import type { ConfigDoc } from '../config/useConfigForm';

export const MAX_TILES = 8;

export type SosValue = {
  title: string;
  subtitle: string;
  help: { title: string; body: string; bookingUrl: string; contactEmail: string };
};
export type SosTile = {
  sessionId: string;
  title: string;
  /** Text on the tile in the app. */
  feeling: string;
  subtitle: string | null;
  durationSec: number;
  status: 'draft' | 'scheduled' | 'live' | 'archived';
  order: number | null;
};
export type Sos = ConfigDoc<SosValue> & { tiles: SosTile[] };

const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SosErrors = Partial<Record<'title' | 'subtitle' | 'helpTitle' | 'helpBody' | 'bookingUrl' | 'contactEmail', string>>;

/** The same limits as the API; empty object = fine. */
export function sosErrors(v: SosValue): SosErrors {
  const e: SosErrors = {};
  if (!v.title.trim()) e.title = 'Enter a title';
  else if (v.title.trim().length > 60) e.title = 'At most 60 characters';
  if (v.subtitle.trim().length > 120) e.subtitle = 'At most 120 characters';
  if (!v.help.title.trim()) e.helpTitle = 'Enter a title';
  else if (v.help.title.trim().length > 60) e.helpTitle = 'At most 60 characters';
  if (v.help.body.trim().length > 400) e.helpBody = 'At most 400 characters';
  if (!URL_RE.test(v.help.bookingUrl.trim())) e.bookingUrl = 'Enter a link that starts with https://';
  if (!EMAIL_RE.test(v.help.contactEmail.trim())) e.contactEmail = 'Enter a valid email address';
  return e;
}

const tidy = (v: SosValue): SosValue => ({
  title: v.title.trim(),
  subtitle: v.subtitle.trim(),
  help: {
    title: v.help.title.trim(),
    body: v.help.body.trim(),
    bookingUrl: v.help.bookingUrl.trim(),
    contactEmail: v.help.contactEmail.trim(),
  },
});

export function useSos() {
  return useQuery({ queryKey: qk.sos.list(), queryFn: () => api<Sos>('/v1/admin/sos').then((r) => r.data) });
}

export const sosApi = {
  saveTexts: (value: SosValue, version: number) =>
    api<ConfigDoc<SosValue>>('/v1/admin/sos', { method: 'PUT', body: tidy(value), ifMatch: version }).then((r) => r.data),
  /** The sessions in this order are the tiles; every other session stops being one. */
  order: (ids: string[]) => api<Sos>('/v1/admin/sos/order', { method: 'PUT', body: { ids } }).then((r) => r.data),
};

export function useSosCache() {
  const qc = useQueryClient();
  const key = qk.sos.list();
  return {
    saved: (doc: ConfigDoc<SosValue>) => qc.setQueryData<Sos>(key, (old) => (old ? { ...old, ...doc } : old)),
    replace: (sos: Sos) => qc.setQueryData<Sos>(key, sos),
    tiles: (tiles: SosTile[]) => qc.setQueryData<Sos>(key, (old) => (old ? { ...old, tiles } : old)),
  };
}
