import { cn } from '../lib/cn';

type SparkProps = {
  /** Values in time order. */
  data: number[];
  /** Says what the line shows, e.g. "Meditations per day, last 7 days: rising". */
  label: string;
  width?: number;
  height?: number;
  className?: string;
};

/** Tiny trend line, plain SVG (no chart library in the initial bundle). */
export function Sparkline({ data, label, width = 96, height = 28, className }: SparkProps) {
  if (data.length < 2) return <svg role="img" aria-label={label} width={width} height={height} className={className} />;
  const min = Math.min(...data);
  const range = Math.max(...data) - min || 1;
  const pad = 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('text-ember', className)}
    >
      <polyline points={pts.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type StatBarProps = {
  /** 0–1. Values outside are clamped. */
  value: number;
  /** Names the bar, e.g. "Completion". */
  label: string;
  /** Show "82%" after the bar. */
  showValue?: boolean;
  tone?: 'ember' | 'success' | 'vibration';
  className?: string;
};

const fills = { ember: 'bg-ember', success: 'bg-success', vibration: 'bg-vibration' };

/** Horizontal progress bar (design: Main.dc.html completion, Subscriptions founding counter). */
export function StatBar({ value, label, showValue, tone = 'ember', className }: StatBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 flex-1 rounded-full bg-border-strong"
      >
        <div className={cn('h-1.5 rounded-full', fills[tone])} style={{ width: `${pct}%` }} />
      </div>
      {showValue ? <span className="tabular w-9 text-right text-xs text-text-muted">{pct}%</span> : null}
    </div>
  );
}
