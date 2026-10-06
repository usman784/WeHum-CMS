import { useState } from 'react';
import { formatNumber } from '../../lib/format';
import { Button } from '../../ui/Button';
import type { Trends } from './api';

type Day = Trends['perDay'][number];

const dayLabel = (d: string) => String(Number(d.slice(8, 10)));
const longDay = (d: string) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${d}T00:00:00Z`),
  );

/** Which day labels to show so they never collide: all up to 16 days, then every 2nd / 7th. */
const labelEvery = (n: number) => (n <= 16 ? 1 : n <= 31 ? 2 : 7);

/**
 * Meditations per day, solo and group stacked (design: Analytics.dc.html). Bars share one baseline; the group segment
 * sits on top with a 2 px surface gap and a rounded top. Hover or focus a day for its numbers; "Show table" lists them.
 */
export function DayBars({ days }: { days: Day[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...days.map((d) => d.solo + d.group));
  const every = labelEvery(days.length);
  const a = active === null ? null : days[active];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-sm text-text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-chart-solo" /> Solo
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-chart-group" /> Group
        </span>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" aria-pressed={table} onClick={() => setTable((t) => !t)}>
          {table ? 'Show chart' : 'Show table'}
        </Button>
      </div>
      {table ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Meditations per day (UTC)</caption>
            <thead className="text-xs uppercase tracking-wide text-text-faint">
              <tr>
                <th className="py-1.5">Day</th>
                <th className="py-1.5 text-right">Solo</th>
                <th className="py-1.5 text-right">Group</th>
                <th className="py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="tabular border-t border-border">
                  <td className="py-1.5">{longDay(d.date)}</td>
                  <td className="py-1.5 text-right">{formatNumber(d.solo)}</td>
                  <td className="py-1.5 text-right">{formatNumber(d.group)}</td>
                  <td className="py-1.5 text-right font-semibold">{formatNumber(d.solo + d.group)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <ul
            aria-label="Meditations per day"
            className="flex h-56 items-end gap-[2px] border-b border-border"
            onMouseLeave={() => setActive(null)}
          >
            {days.map((d, i) => {
              const total = d.solo + d.group;
              const h = (total / max) * 100;
              return (
                <li key={d.date} className="flex h-full min-w-0 flex-1">
                  {/* hit target: the whole column, not just the bar */}
                  <button
                    type="button"
                    aria-label={`${longDay(d.date)}: ${formatNumber(total)} meditations, ${formatNumber(d.solo)} solo, ${formatNumber(d.group)} group`}
                    className="relative flex size-full cursor-default flex-col justify-end outline-none"
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  >
                    <span className="flex w-full flex-col justify-end gap-[2px]" style={{ height: `${h}%` }}>
                      {d.group ? (
                        <span
                          aria-hidden
                          className="rounded-t-[4px] bg-chart-group"
                          style={{ flexGrow: d.group, flexBasis: 0, minHeight: 2 }}
                        />
                      ) : null}
                      {d.solo ? (
                        <span
                          aria-hidden
                          className={`bg-chart-solo ${d.group ? '' : 'rounded-t-[4px]'}`}
                          style={{ flexGrow: d.solo, flexBasis: 0, minHeight: 2 }}
                        />
                      ) : null}
                    </span>
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute inset-0 rounded-[4px] ${active === i ? 'bg-text/5 ring-2 ring-ember-soft' : ''}`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
          <div aria-hidden className="mt-2 flex gap-[2px] text-center text-xs text-text-faint">
            {days.map((d, i) => (
              <span key={d.date} className="min-w-0 flex-1 truncate">
                {i % every === 0 ? dayLabel(d.date) : ''}
              </span>
            ))}
          </div>
          {a ? (
            <div
              role="tooltip"
              className="pointer-events-none absolute top-0 z-10 rounded-tile border border-border-strong bg-surface-alt px-3 py-2 text-sm shadow-lg"
              style={{ left: `clamp(0px, calc(${((active! + 0.5) / days.length) * 100}% - 70px), calc(100% - 140px))` }}
            >
              <p className="font-semibold text-text">{longDay(a.date)}</p>
              <p className="tabular text-text-muted">
                {formatNumber(a.solo + a.group)} meditations
                <br />
                {formatNumber(a.solo)} solo · {formatNumber(a.group)} group
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
