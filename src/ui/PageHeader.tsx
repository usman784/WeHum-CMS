import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../lib/cn';
import { formatRelative, formatUtc } from '../lib/format';
import { Tooltip } from './Tooltip';

type Props = {
  title: ReactNode;
  /** Small ember line above the title on editors, e.g. "SESSIONS · EDIT". */
  overline?: string;
  subtitle?: ReactNode;
  /** Count chip next to the title, e.g. "142 MEDITATIONS". */
  badge?: ReactNode;
  /** Shows a back button that links here (editors). */
  backTo?: string;
  backLabel?: string;
  /** Buttons on the right. */
  actions?: ReactNode;
  /** Use "h2" only where a page already has its <h1> (e.g. the component gallery). */
  as?: 'h1' | 'h2';
  className?: string;
};

/** Page title row (design: every screen's <header>). Renders the page's only <h1>. */
export function PageHeader({
  title,
  overline,
  subtitle,
  badge,
  backTo,
  backLabel = 'Back',
  actions,
  as: Heading = 'h1',
  className,
}: Props) {
  return (
    <header className={cn('flex flex-wrap items-center gap-4', className)}>
      {backTo ? (
        <Link
          to={backTo}
          aria-label={backLabel}
          className="flex size-11 shrink-0 items-center justify-center rounded-btn border border-border-strong bg-surface text-text hover:border-outline"
        >
          <ChevronLeft size={18} aria-hidden />
        </Link>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {overline ? <span className="text-xs font-semibold uppercase tracking-[1.2px] text-ember-text">{overline}</span> : null}
        <div className="flex flex-wrap items-center gap-2.5">
          <Heading className="text-h1">{title}</Heading>
          {badge}
        </div>
        {subtitle ? <p className="text-body text-text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}

/** "Edited by Lena · 2 min ago", with the exact UTC time on hover and focus. */
export function AuditStamp({
  by,
  at,
  verb = 'Edited',
  className,
}: {
  by?: string | null;
  at: string | Date;
  verb?: string;
  className?: string;
}) {
  return (
    <Tooltip content={formatUtc(at)}>
      {/* Focusable so keyboard users can open the tooltip with the exact time. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <span tabIndex={0} className={cn('rounded text-sm text-text-muted', className)}>
        {verb}
        {by ? ` by ${by}` : ''} · <time dateTime={new Date(at).toISOString()}>{formatRelative(at)}</time>
      </span>
    </Tooltip>
  );
}
