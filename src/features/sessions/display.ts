import { formatDate, formatDateTime } from '../../lib/format';
import type { Session, SessionStatus, SessionType } from './api';

/** Wording follows the client rules (spec §1): "Free for you", "Premium", never "sit". */
export const STATUS: Record<SessionStatus, { label: string; tone: 'success' | 'warning' | 'teal' | 'muted' }> = {
  live: { label: 'Published', tone: 'success' },
  draft: { label: 'Draft', tone: 'warning' },
  scheduled: { label: 'Scheduled', tone: 'teal' },
  archived: { label: 'Archived', tone: 'muted' },
};

export const TYPE_LABEL: Record<SessionType, string> = { audio: 'Audio', video: 'Video', youtube: 'YouTube' };

/** 900 → "15 min", 30 → "1 min", 0 → "—". */
export const lengthLabel = (sec: number) => (sec > 0 ? `${Math.max(1, Math.round(sec / 60))} min` : '—');

/** The "GOES LIVE" column: when it became or becomes visible in the app. */
export function goesLive(s: Pick<Session, 'status' | 'publishAt'>): string {
  if (!s.publishAt || s.status === 'draft') return 'Not set';
  return s.status === 'scheduled' ? formatDateTime(s.publishAt) : formatDate(s.publishAt);
}

/** Small line under the title: the first thing an editor should know about this row. */
export function sessionNote(s: Session, teacherName?: string): string {
  if (s.type === 'youtube') return s.youtubeId ? 'YouTube link' : 'YouTube link missing';
  if (!s.mediaId) return `${TYPE_LABEL[s.type]} missing`;
  if (!s.cover) return 'Cover missing';
  if (s.isSos) return s.sosFeeling ? `SoS · ${s.sosFeeling}` : 'SoS';
  return teacherName ?? (s.access === 'premium' ? 'Premium' : 'Free for you');
}
