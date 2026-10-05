import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatCompact,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRelative,
  formatUsd,
  formatUtc,
  initials,
} from './format';
import { isHHmm, localPreviews, todayUtc, utcInstant } from './tz';

describe('format', () => {
  it('numbers, compact, percent, money', () => {
    expect(formatNumber(3180)).toBe('3,180');
    expect(formatCompact(1284)).toBe('1.3K');
    expect(formatCompact(18230)).toBe('18.2K');
    expect(formatPercent(0.82)).toBe('82%');
    expect(formatPercent(0.0125, 1)).toBe('1.3%');
    expect(formatUsd(3904)).toBe('$3,904');
    expect(formatUsd(9.99)).toBe('$9.99');
  });

  it('durations and file sizes', () => {
    expect(formatDuration(95)).toBe('1:35');
    expect(formatDuration(900)).toBe('15:00');
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(-5)).toBe('0:00');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(14 * 1024 * 1024)).toBe('14 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB');
  });

  it('dates in a given zone, and the UTC form for tooltips', () => {
    const d = '2026-10-08T05:00:00.000Z';
    expect(formatDate(d, 'UTC')).toBe('Oct 8, 2026');
    expect(formatDateTime(d, 'Europe/Berlin')).toBe('Oct 8, 2026, 07:00');
    expect(formatDateTime(d, 'Asia/Karachi')).toBe('Oct 8, 2026, 10:00');
    expect(formatUtc(d)).toBe('2026-10-08 05:00 UTC');
  });

  it('relative time, past and future', () => {
    const now = new Date('2026-10-08T12:00:00Z');
    const ago = (sec: number) => formatRelative(new Date(now.getTime() - sec * 1000), now);
    expect(ago(10)).toBe('just now');
    expect(ago(120)).toBe('2 min. ago');
    expect(ago(3 * 3600)).toBe('3 hr. ago');
    expect(ago(86_400)).toBe('yesterday');
    expect(ago(40 * 86_400)).toBe('last mo.');
    expect(ago(-2 * 3600)).toBe('in 2 hr.');
  });

  it('initials', () => {
    expect(initials('Raphael Reiter')).toBe('RR');
    expect(initials('  usman ')).toBe('U');
    expect(initials('Anna Maria von Berg')).toBe('AM');
    expect(initials('')).toBe('');
  });
});

describe('tz', () => {
  it('validates HH:mm', () => {
    expect(['00:00', '13:05', '23:59'].every(isHHmm)).toBe(true);
    expect(['24:00', '7:00', '12:60', '', 'noon'].some(isHHmm)).toBe(false);
  });

  it('builds the UTC instant and today in UTC', () => {
    expect(utcInstant('13:00', '2026-07-01').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(todayUtc(new Date('2026-10-05T23:30:00-05:00'))).toBe('2026-10-06');
  });

  it('previews local times and flags a different calendar day', () => {
    const by = (hhmm: string, date: string) =>
      Object.fromEntries(localPreviews(hhmm, date).map((p) => [p.city, `${p.time}${p.dayShift ? `(${p.dayShift})` : ''}`]));
    expect(by('13:00', '2026-07-01')).toEqual({ Berlin: '15:00', 'New York': '09:00', Lahore: '18:00', Sydney: '23:00' });
    expect(by('13:00', '2026-12-01')).toEqual({ Berlin: '14:00', 'New York': '08:00', Lahore: '18:00', Sydney: '00:00(1)' });
    expect(by('02:00', '2026-07-01')).toMatchObject({ 'New York': '22:00(-1)', Sydney: '12:00' });
    expect(localPreviews('', '2026-07-01')).toEqual([]);
  });
});
