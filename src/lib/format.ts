/** Display formatting. Dates show in the admin's time zone; pass `timeZone: 'UTC'` for UTC tooltips (spec §6.1). */
const LOCALE = 'en-US';

export const formatNumber = (n: number) => new Intl.NumberFormat(LOCALE).format(n);

/** 1,284 → "1.3K", 18,230 → "18K". For tight spots only; tables show full numbers. */
export const formatCompact = (n: number) => new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export const formatPercent = (ratio: number, digits = 0) =>
  new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: digits }).format(ratio);

export const formatUsd = (amount: number) =>
  new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD', maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);

/** 95 → "1:35", 3600 → "1:00:00". */
export function formatDuration(totalSec: number) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

type DateInput = Date | string | number;
const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d));

/** "Oct 8, 2026" */
export const formatDate = (d: DateInput, timeZone?: string) =>
  new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric', year: 'numeric', timeZone }).format(toDate(d));

/** "Oct 8, 2026, 07:00" */
export const formatDateTime = (d: DateInput, timeZone?: string) =>
  new Intl.DateTimeFormat(LOCALE, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(toDate(d));

/** "2026-10-08 07:00 UTC" — for tooltips next to a local time. */
export const formatUtc = (d: DateInput) => `${toDate(d).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

const STEPS: [limitSec: number, divisor: number, unit: Intl.RelativeTimeFormatUnit][] = [
  [60, 1, 'second'],
  [3600, 60, 'minute'],
  [86_400, 3600, 'hour'],
  [86_400 * 30, 86_400, 'day'],
  [86_400 * 365, 86_400 * 30, 'month'],
  [Infinity, 86_400 * 365, 'year'],
];

/** "2 min ago", "in 3 hr", "just now". */
export function formatRelative(d: DateInput, now: Date = new Date()) {
  const diffSec = (toDate(d).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diffSec);
  if (abs < 45) return 'just now';
  const [, divisor, unit] = STEPS.find(([limit]) => abs < limit)!;
  return new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto', style: 'short' }).format(Math.round(diffSec / divisor), unit);
}

/** "RR" from "Raphael Reiter". */
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
