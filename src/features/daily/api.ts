import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { qk } from '../../lib/query';

export type MessageType = 'audio' | 'video' | 'text';
export type MessageStatus = 'draft' | 'scheduled' | 'live' | 'archived';

export type DailyMessage = {
  /** The day it is for, `yyyy-MM-dd` (UTC). One message per day. */
  date: string;
  type: MessageType;
  title: string;
  text: string | null;
  mediaId: string | null;
  imageMediaId: string | null;
  durationSec: number | null;
  themeTag: string | null;
  status: MessageStatus;
  version: number;
  updatedAt: string;
};

/** What the API stores for a day; it replaces the whole message. */
export type MessageBody = {
  type: MessageType;
  title: string;
  text: string | null;
  mediaId: string | null;
  imageMediaId: string | null;
  durationSec: number | null;
  themeTag: string | null;
  status: MessageStatus;
};

export const TYPES: { value: MessageType; label: string }[] = [
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'text', label: 'Text' },
];

const DAY = 86_400_000;
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(parse(d) + n * DAY);
/** `2026-10` for a day. */
export const monthOf = (d: string) => d.slice(0, 7);
export const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
export const dayTitle = (d: string) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${d}T00:00:00Z`),
  );

/** The weeks shown for a month, Monday first: every day from the Monday on or before the 1st to the Sunday on or after the last. */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const last = addDays(`${addMonths(month, 1)}-01`, -1);
  const tail = 6 - ((new Date(`${last}T00:00:00Z`).getUTCDay() + 6) % 7);
  const out: string[] = [];
  for (let d = addDays(first, -lead); d <= addDays(last, tail); d = addDays(d, 1)) out.push(d);
  return out;
}

export type DayState = { key: 'live-today' | 'published' | 'scheduled' | 'draft' | 'archived' | 'missing' | 'empty'; label: string };

/** What a calendar cell says. "Missing" only for days that are still to come (today and the next 6): the app would have nothing to show. */
export function dayState(date: string, m: DailyMessage | undefined, today: string): DayState {
  if (!m) return date >= today && date < addDays(today, 7) ? { key: 'missing', label: 'Missing' } : { key: 'empty', label: '' };
  if (m.status === 'live') return date === today ? { key: 'live-today', label: 'Live' } : { key: 'published', label: 'Published' };
  if (m.status === 'scheduled') return { key: 'scheduled', label: 'Scheduled' };
  if (m.status === 'archived') return { key: 'archived', label: 'Archived' };
  return { key: 'draft', label: 'Draft' };
}

/** Days from today on (within a week) that have no message the app can show: a draft is not shown either. */
export function daysWithoutMessage(byDate: Map<string, DailyMessage>, today: string, days = 7): string[] {
  return Array.from({ length: days }, (_, i) => addDays(today, i)).filter((d) => {
    const s = byDate.get(d)?.status;
    return s !== 'live' && s !== 'scheduled';
  });
}

/** Why this message cannot be scheduled or published yet, or null. The API checks the same. */
export function messageBlocker(b: Pick<MessageBody, 'type' | 'title' | 'text' | 'mediaId'>, uploading: boolean): string | null {
  if (!b.title.trim()) return 'Enter a title first.';
  if (b.type === 'text' && !b.text?.trim()) return 'Write the text first.';
  if (b.type !== 'text' && uploading) return 'Wait until the file has finished uploading and processing.';
  if (b.type !== 'text' && !b.mediaId) return `Upload the ${b.type} file first.`;
  return null;
}

export function useDailyMessages(from: string, to: string) {
  return useQuery({
    queryKey: qk.dailyMessage.list({ from, to }),
    queryFn: () => api<DailyMessage[]>('/v1/admin/daily-messages', { query: { from, to } }).then((r) => r.data),
  });
}

export const dailyApi = {
  put: (date: string, body: MessageBody, version?: number) =>
    api<DailyMessage>(`/v1/admin/daily-messages/${date}`, { method: 'PUT', body, ifMatch: version }).then((r) => r.data),
  remove: (date: string) => api<void>(`/v1/admin/daily-messages/${date}`, { method: 'DELETE' }),
};

export const toBody = (m: DailyMessage, status: MessageStatus = m.status): MessageBody => ({
  type: m.type,
  title: m.title,
  text: m.text,
  mediaId: m.mediaId,
  imageMediaId: m.imageMediaId,
  durationSec: m.durationSec,
  themeTag: m.themeTag,
  status,
});

/** Keeps the month on screen current after a save, without waiting for a re-read. Other months are re-read when opened. */
export function useDailyCache(from: string, to: string) {
  const qc = useQueryClient();
  const key = qk.dailyMessage.list({ from, to });
  const sorted = (rows: DailyMessage[]) => rows.sort((a, b) => a.date.localeCompare(b.date));
  return {
    saved: (row: DailyMessage) => {
      qc.setQueryData<DailyMessage[]>(key, (old) => (old ? sorted([...old.filter((m) => m.date !== row.date), row]) : old));
      void qc.invalidateQueries({ queryKey: qk.dailyMessage.all, refetchType: 'inactive' }); // other months: re-read when opened
    },
    removed: (date: string) => qc.setQueryData<DailyMessage[]>(key, (old) => old?.filter((m) => m.date !== date)),
  };
}
