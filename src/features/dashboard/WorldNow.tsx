import { useState } from 'react';
import { formatNumber } from '../../lib/format';
import { StatusText } from '../../ui/Badge';
import { SectionCard } from '../../ui/Card';
import { Segmented } from '../../ui/Segmented';
import { countryName, flagOf } from '../users/api';
import type { CityCount } from './api';
import { project } from './projection';
import { WORLD, WORLD_VIEWBOX } from './world-map';

type Count = { c: string; n: number };
type Mode = 'online' | 'meditating';
type View = 'country' | 'city';
const TONE: Record<Mode, string> = { online: '--c-success', meditating: '--c-teal-text' };

/**
 * Where people are right now, live from the dashboard socket, as a world map shaded by country (darker = more people)
 * or as a dot per city (bigger = more people): the switch above the map. Online = the app is open; Meditating = a
 * meditation is playing. Never who or where exactly (cities are rounded to ~10 km); people who hide their country count
 * in the total but are on no country or city. Loaded on its own (the outlines are ~30 KB).
 */
export default function WorldNow({
  online,
  meditating,
  onlineCities = [],
  meditatingCities = [],
  onlineTotal,
  meditatingTotal,
}: {
  online: Count[];
  meditating: Count[];
  onlineCities?: CityCount[];
  meditatingCities?: CityCount[];
  onlineTotal: number;
  meditatingTotal: number;
}) {
  const [mode, setMode] = useState<Mode>('online');
  const [view, setView] = useState<View>('country');
  const cities = mode === 'online' ? onlineCities : meditatingCities;
  const inCities = cities.reduce((a, r) => a + r.n, 0);
  const cityMax = Math.max(1, ...cities.map((r) => r.n));
  const rows = mode === 'online' ? online : meditating;
  const total = mode === 'online' ? onlineTotal : meditatingTotal;
  const by = new Map(rows.map((r) => [r.c.toUpperCase(), r.n]));
  const max = Math.max(1, ...rows.map((r) => r.n));
  const word = mode === 'online' ? 'online' : 'meditating';
  return (
    <SectionCard
      title="Where people are right now"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Map detail"
            value={view}
            onChange={setView}
            options={[
              { value: 'country', label: 'By country' },
              { value: 'city', label: 'By city' },
            ]}
          />
          <Segmented
            label="Show on the map"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'online', label: `Online · ${formatNumber(onlineTotal)}` },
              { value: 'meditating', label: `Meditating · ${formatNumber(meditatingTotal)}` },
            ]}
          />
        </div>
      }
    >
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
        <figure className="flex flex-col gap-2">
          <svg
            viewBox={WORLD_VIEWBOX}
            role="img"
            aria-label={`World map: people ${word} by ${view}`}
            className="h-auto w-full"
            data-testid="world-map"
          >
            {Object.entries(WORLD).map(([code, d]) => {
              const n = view === 'country' ? (by.get(code) ?? 0) : 0;
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
            {view === 'city'
              ? cities.map((r) => {
                  const [x, y] = project(r.lat, r.lng);
                  return (
                    <circle
                      key={`${r.c}|${r.name}`}
                      cx={x}
                      cy={y}
                      r={3 + 9 * Math.sqrt(r.n / cityMax)}
                      data-city={r.name}
                      data-n={r.n}
                      style={{ fill: `rgb(var(${TONE[mode]}) / 0.55)`, stroke: `rgb(var(${TONE[mode]}))`, strokeWidth: 1 }}
                    >
                      <title>{`${r.name}, ${countryName(r.c)} · ${formatNumber(r.n)} ${word}`}</title>
                    </circle>
                  );
                })
              : null}
          </svg>
          <figcaption className="flex items-center gap-2 text-xs text-text-muted">
            <span>{view === 'city' ? 'Smaller' : 'Fewer'}</span>
            <span
              aria-hidden
              className="h-2 w-24 rounded-full"
              style={{ background: `linear-gradient(90deg, rgb(var(${TONE[mode]}) / 0.25), rgb(var(${TONE[mode]}) / 1))` }}
            />
            <span>{view === 'city' ? 'Bigger' : 'More'}</span>
            <span className="ml-auto">{view === 'city' ? 'Cities only (rounded to ~10 km), never who' : 'Countries only, never who'}</span>
          </figcaption>
        </figure>
        {view === 'city' ? (
          cities.length === 0 ? (
            <p className="text-sm text-text-muted">
              {total
                ? `${formatNumber(total)} ${word}, but no city yet: it appears as people update the app and share their location.`
                : `Nobody is ${word} right now.`}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <StatusText tone="success">
                {formatNumber(inCities)} {word} in {cities.length} {cities.length === 1 ? 'city' : 'cities'}
              </StatusText>
              <ul aria-label={`People ${word} by city`} className="flex flex-col">
                {cities.slice(0, 8).map((r) => (
                  <li key={`${r.c}|${r.name}`} className="flex min-h-10 items-center gap-3 border-t border-border first:border-t-0">
                    <span aria-hidden className="w-6 text-lg">
                      {flagOf(r.c)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-body">
                      {r.name}
                      <span className="text-text-muted"> · {countryName(r.c)}</span>
                    </span>
                    <span className="tabular text-sm text-text-muted">{formatNumber(r.n)}</span>
                  </li>
                ))}
                {cities.length > 8 ? (
                  <li className="border-t border-border pt-2 text-sm text-text-muted">+{cities.length - 8} more cities</li>
                ) : null}
              </ul>
              {total > inCities ? (
                <p className="text-xs text-text-muted">
                  {formatNumber(total - inCities)} {word} with no city yet (older app, location not shared, or hidden).
                </p>
              ) : null}
            </div>
          )
        ) : rows.length === 0 ? (
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
