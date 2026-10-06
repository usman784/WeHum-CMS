/**
 * The 12 theme icons from the design (design/source/Disciplines.dc.html). The key is stored as `iconKey`;
 * the app draws the same key with its own icon set.
 */
export const THEME_ICONS = [
  {
    key: 'infinity',
    name: 'Infinity',
    d: 'M7 8c-2.2 0-4 1.8-4 4s1.8 4 4 4c3.5 0 6.5-8 10-8 2.2 0 4 1.8 4 4s-1.8 4-4 4c-3.5 0-6.5-8-10-8z',
  },
  { key: 'heart', name: 'Heart', d: 'M12 20s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.7-7 10-7 10z' },
  { key: 'focus', name: 'Focus', d: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4' },
  { key: 'wind', name: 'Wind', d: 'M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h7' },
  { key: 'moon', name: 'Moon', d: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z' },
  { key: 'timer', name: 'Timer', d: 'M12 9v4l2 2M10 2h4M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z' },
  { key: 'sun', name: 'Sun', d: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { key: 'wave', name: 'Wave', d: 'M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0' },
  { key: 'leaf', name: 'Leaf', d: 'M5 19c0-8 6-14 14-14 0 8-6 14-14 14zM5 19l7-7' },
  { key: 'bowl', name: 'Bowl', d: 'M3 11h18a9 9 0 0 1-18 0zM8 20h8' },
  { key: 'spark', name: 'Spark', d: 'M12 3v4M12 17v4M3 12h4M17 12h4' },
  { key: 'mountain', name: 'Mountain', d: 'M3 20l6-10 4 6 3-4 5 8z' },
] as const;

/** Keys used by the first seed data that are not in the picker: drawn with the closest picker icon. */
const ALIASES: Record<string, string> = { sunrise: 'sun', breath: 'wind', reset: 'timer', body: 'focus' };

export function ThemeIcon({ iconKey, size = 22, className }: { iconKey: string | null; size?: number; className?: string }) {
  const key = iconKey ? (ALIASES[iconKey] ?? iconKey) : null;
  const icon = THEME_ICONS.find((i) => i.key === key) ?? THEME_ICONS[0];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={icon.d} />
    </svg>
  );
}
