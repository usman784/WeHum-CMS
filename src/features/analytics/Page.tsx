import { Download } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { formatNumber, formatPercent } from '../../lib/format';
import { Button } from '../../ui/Button';
import { SectionCard } from '../../ui/Card';
import { StatBar } from '../../ui/Charts';
import { KpiTile } from '../../ui/KpiTile';
import { PageHeader } from '../../ui/PageHeader';
import { Segmented } from '../../ui/Segmented';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { toast } from '../../ui/Toast';
import { countryName } from '../users/api';
import { DayBars } from './DayBars';
import { analyticsApi, compact, deltaText, FUNNEL_LABEL, PERIODS, useFunnel, useRetention, useTrends, type Kpi, type Period } from './api';

const tone = (k: Kpi, lowerIsBetter = false) => {
  if (k.deltaPct === null || k.value === null || k.previous === null) return 'muted' as const;
  const up = k.value >= k.previous;
  return up !== lowerIsBetter ? ('success' as const) : ('warning' as const);
};

function Funnel({ period }: { period: Period }) {
  const f = useFunnel(period);
  return (
    <SectionCard title="Conversion funnel">
      {f.isError ? (
        <ErrorState error={f.error} onRetry={() => void f.refetch()} />
      ) : f.isPending ? (
        <SkeletonRows rows={7} label="Loading the funnel" />
      ) : !f.data.steps[0]?.count ? (
        <EmptyState title="No installs in this period" description="The funnel fills from the app’s own events, a day behind." />
      ) : (
        <ol aria-label="Conversion funnel" className="flex flex-col gap-3">
          {f.data.steps.map((s) => (
            <li key={s.key} className="flex flex-col gap-1.5">
              <span className="flex items-center gap-3 text-sm">
                <span className="flex-1">{FUNNEL_LABEL[s.key]}</span>
                <span className="tabular font-semibold">{formatNumber(s.count)}</span>
                <span className="tabular w-12 text-right text-text-muted">
                  {s.share === null ? '—' : formatPercent(s.share, s.share < 0.1 ? 1 : 0)}
                </span>
              </span>
              <StatBar value={s.share ?? 0} label={`${FUNNEL_LABEL[s.key]}: ${s.share === null ? 'no data' : formatPercent(s.share, 1)}`} />
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-text-faint">Trials and paid from RevenueCat; app steps from the app’s own events.</p>
    </SectionCard>
  );
}

function Retention() {
  const r = useRetention();
  return (
    <SectionCard title="Retention" description="Share of people who meditated again exactly N days after joining.">
      {r.isError ? (
        <ErrorState error={r.error} onRetry={() => void r.refetch()} />
      ) : r.isPending ? (
        <SkeletonRows rows={3} label="Loading retention" />
      ) : (
        <ul aria-label="Retention" className="flex flex-col gap-3">
          {r.data.retention.map((x) => (
            <li key={x.day} className="grid grid-cols-[56px_minmax(0,1fr)_48px] items-center gap-3 text-sm">
              <span className="text-text-muted">Day {x.day}</span>
              <StatBar value={x.rate ?? 0} tone="success" label={`Day ${x.day} retention`} />
              <span className="tabular text-right font-semibold">{x.rate === null ? '—' : formatPercent(x.rate)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function ShareList({
  title,
  note,
  rows,
}: {
  title: string;
  note?: string;
  rows: { name: string; value: number; share: number; unit?: string }[];
}) {
  return (
    <SectionCard title={title} description={note}>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">No data in this period.</p>
      ) : (
        <ul aria-label={title} className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li key={r.name} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_72px_44px] items-center gap-3 text-sm">
              <span className="truncate">{r.name}</span>
              <StatBar value={r.share} tone="success" label={`${r.name}: ${formatPercent(r.share)}`} />
              <span className="tabular text-right font-semibold">
                {formatNumber(r.value)}
                {r.unit ? <span className="font-normal text-text-muted"> {r.unit}</span> : null}
              </span>
              <span className="tabular text-right text-text-muted">{formatPercent(r.share)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** 02 Analytics: how people practice, where they drop off and what converts. Daily aggregates, UTC days. */
export function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const asked = Number(params.get('period'));
  const period: Period = (PERIODS as readonly number[]).includes(asked) ? (asked as Period) : 14;
  const t = useTrends(period);
  const [exporting, setExporting] = useState(false);
  const setPeriod = (p: Period) => setParams(p === 14 ? {} : { period: String(p) }, { replace: true });

  const exportCsv = async () => {
    setExporting(true);
    try {
      await analyticsApi.exportCsv(period);
    } catch (e) {
      toast.apiError(e);
    } finally {
      setExporting(false);
    }
  };

  const k = t.data?.kpis;
  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="How people practice, where they drop off, and what converts. Days are UTC; today fills in through the day."
        actions={
          <>
            <Segmented
              label="Period"
              value={String(period)}
              onChange={(v) => setPeriod(Number(v) as Period)}
              options={PERIODS.map((p) => ({ value: String(p), label: `${p} days` }))}
            />
            <Button variant="outline" loading={exporting} onClick={() => void exportCsv()}>
              <Download size={16} aria-hidden />
              Export CSV
            </Button>
          </>
        }
      />
      {t.isError ? (
        <ErrorState error={t.error} onRetry={() => void t.refetch()} />
      ) : !t.data || !k ? (
        <SkeletonRows rows={6} label="Loading analytics" />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
            <KpiTile
              size="sm"
              label="Active users"
              value={compact(k.activeUsers.value)}
              hint={deltaText(k.activeUsers)}
              hintTone={tone(k.activeUsers)}
            />
            <KpiTile
              size="sm"
              label="Meditations"
              value={compact(k.meditations.value)}
              hint={deltaText(k.meditations)}
              hintTone={tone(k.meditations)}
            />
            <KpiTile
              size="sm"
              label="Minutes meditated"
              value={compact(k.minutes.value)}
              hint={deltaText(k.minutes)}
              hintTone={tone(k.minutes)}
            />
            <KpiTile
              size="sm"
              label="Avg length"
              value={k.avgLengthMin.value === null ? '—' : `${k.avgLengthMin.value} min`}
              hint={deltaText(k.avgLengthMin, 'min')}
              hintTone={tone(k.avgLengthMin)}
            />
            <KpiTile
              size="sm"
              label="New paying"
              value={compact(k.newPaying.value)}
              hint={deltaText(k.newPaying)}
              hintTone={tone(k.newPaying)}
            />
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <SectionCard
              title="Meditations per day"
              description={t.data.peakLive ? `Most people meditating together: ${formatNumber(t.data.peakLive)}` : undefined}
            >
              {t.data.perDay.length ? (
                <DayBars days={t.data.perDay} />
              ) : (
                <EmptyState title="No meditations in this period" description="Numbers appear after the nightly roll-up." />
              )}
            </SectionCard>
            <Funnel period={period} />
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-3">
            <Retention />
            <ShareList
              title="Minutes by theme"
              rows={t.data.byTheme.map((x) => ({ name: x.theme, value: x.minutes, share: x.share, unit: 'min' }))}
            />
            <ShareList
              title="Meditators by country"
              note="People who meditated, counted once per day."
              rows={t.data.countries.map((x) => ({
                name: x.country === 'Other' ? 'Other countries' : x.country === '??' ? 'Unknown' : countryName(x.country),
                value: x.members,
                share: x.share,
              }))}
            />
          </div>
        </>
      )}
    </>
  );
}
