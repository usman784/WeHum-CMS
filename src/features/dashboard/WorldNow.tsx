import { useState } from 'react';
import { formatNumber } from '../../lib/format';
import { StatusText } from '../../ui/Badge';
import { SectionCard } from '../../ui/Card';
import { Segmented } from '../../ui/Segmented';
import { countryName, flagOf } from '../users/api';
import { WORLD, WORLD_VIEWBOX } from './world-map';

type Count = { c: string; n: number };
type Mode = 'online' | 'meditating';
const TONE: Record<Mode, string> = { online: '--c-success', meditating: '--c-teal-text' };

/**
 * Where people are right now, as a world map shaded by country (darker = more people), live from the dashboard socket.
 * Online = the app is open; Meditating = a meditation is playing. Country level only, never who or where exactly;
 * people who hide their country count in the total but are on no country. Loaded on its own (the outlines are ~30 KB).
 */
export default function WorldNow({
  online,
  meditating,
  onlineTotal,
  meditatingTotal,
}: {
  online: Count[];
  meditating: Count[];
  onlineTotal: number;
  meditatingTotal: number;
}) {
  const [mode, setMode] = useState<Mode>('online');
  const rows = mode === 'online' ? online : meditating;
  const total = mode === 'online' ? onlineTotal : meditatingTotal;
  const by = new Map(rows.map((r) => [r.c.toUpperCase(), r.n]));
  const max = Math.max(1, ...rows.map((r) => r.n));
  const word = mode === 'online' ? 'online' : 'meditating';
  return (
    <SectionCard
      title="Where people are right now"
      action={
        <Segmented
          label="Show on the map"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'online', label: `Online · ${formatNumber(onlineTotal)}` },
            { value: 'meditating', label: `Meditating · ${formatNumber(meditatingTotal)}` },
          ]}
        />
      }
    >
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
        <figure className="flex flex-col gap-2">
          <svg
            viewBox={WORLD_VIEWBOX}
            role="img"
            aria-label={`World map: people ${word} by country`}
            className="h-auto w-full"
            data-testid="world-map"
          >
            {Object.entries(WORLD).map(([code, d]) => {
              const n = by.get(code) ?? 0;
              // square root: one busy country should not wash out all the others
              const a = n ? 0.25 + 0.75 * Math.sqrt(n / max) : 0;
              return (
                <path
                  key={code}
                  d={d}
                  data-country={code}
                  data-n={n || undefined}
                  style={{
                    fill: n ? `rgb(var(${TONE[mode]}) / ${a.toFixed(2)})` : 'rgb(var(--c-surface-alt))',
                    stroke: 'rgb(var(--c-border-strong))',
                    strokeWidth: 0.6,
                  }}
                >
                  <title>{`${countryName(code)} · ${n ? `${formatNumber(n)} ${word}` : `nobody ${word}`}`}</title>
                </path>
              );
            })}
          </svg>
          <figcaption className="flex items-center gap-2 text-xs text-text-muted">
            <span>Fewer</span>
            <span
              aria-hidden
              className="h-2 w-24 rounded-full"
              style={{ background: `linear-gradient(90deg, rgb(var(${TONE[mode]}) / 0.25), rgb(var(${TONE[mode]}) / 1))` }}
            />
            <span>More</span>
            <span className="ml-auto">Countries only, never who</span>
          </figcaption>
        </figure>
        {rows.length === 0 ? (
          <p className="text-sm text-text-muted">
            {total ? `${formatNumber(total)} ${word}, country hidden.` : `Nobody is ${word} right now.`}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <StatusText tone="success">
              {formatNumber(total)} {word} in {rows.length} {rows.length === 1 ? 'country' : 'countries'}
            </StatusText>
            <ul aria-label={`People ${word} by country`} className="flex flex-col">
              {rows.slice(0, 8).map((r) => (
                <li key={r.c} className="flex min-h-10 items-center gap-3 border-t border-border first:border-t-0">
                  <span aria-hidden className="w-6 text-lg">
                    {flagOf(r.c)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body">{countryName(r.c)}</span>
                  <span className="tabular text-sm text-text-muted">{formatNumber(r.n)}</span>
                </li>
              ))}
              {rows.length > 8 ? (
                <li className="border-t border-border pt-2 text-sm text-text-muted">+{rows.length - 8} more countries</li>
              ) : null}
            </ul>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
