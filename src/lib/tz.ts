/**
 * Time-zone helpers (spec §6.1): group meditation and MOTD times are stored and edited in UTC,
 * and shown with local previews for these four cities. Uses the browser's Intl data, so DST is always current.
 */
export const PREVIEW_ZONES = [
  { city: 'Berlin', zone: 'Europe/Berlin' },
  { city: 'New York', zone: 'America/New_York' },
  { city: 'Lahore', zone: 'Asia/Karachi' },
  { city: 'Sydney', zone: 'Australia/Sydney' },
] as const;

export const isHHmm = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** The UTC instant for `HH:mm` on a given UTC calendar day (`yyyy-MM-dd`). */
export function utcInstant(hhmm: string, utcDate: string): Date {
  return new Date(`${utcDate}T${hhmm}:00.000Z`);
}

export const todayUtc = (now: Date = new Date()) => now.toISOString().slice(0, 10);

const parts = (d: Date, zone: string) => {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};

export type LocalPreview = {
  city: string;
  zone: string;
  time: string;
  /** −1 = the day before the UTC date, +1 = the day after. */ dayShift: -1 | 0 | 1;
};

/** Local clock times for a UTC time. `utcDate` matters: the same UTC time maps to different local times in summer and winter. */
export function localPreviews(hhmm: string, utcDate: string = todayUtc()): LocalPreview[] {
  if (!isHHmm(hhmm)) return [];
  const at = utcInstant(hhmm, utcDate);
  return PREVIEW_ZONES.map(({ city, zone }) => {
    const local = parts(at, zone);
    const dayShift = local.date === utcDate ? 0 : local.date > utcDate ? 1 : -1;
    return { city, zone, time: local.time, dayShift };
  });
}

/** The admin's own zone, e.g. "Europe/Berlin". */
export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
