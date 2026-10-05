import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import logo from '../../../assets/logo.svg';
import { formatNumber } from '../../../lib/format';
import { authApi } from '../api';

/** Live "meditated together today" number (spec §6.3: public snapshot every 15 s). Shows a dash when it cannot load. */
function useMeditatedToday() {
  const { data } = useQuery({
    queryKey: ['public', 'live'],
    queryFn: authApi.publicLive,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: false,
  });
  return data?.meditatedToday ?? null;
}

/**
 * Left hero of the sign-in screens (design: Login.dc.html). The hero is teal in both themes,
 * so it pins the dark tokens. Hidden under 1024 px, where the form takes the full width.
 */
function Hero() {
  const count = useMeditatedToday();
  return (
    <section
      data-theme="dark"
      aria-label="WeHum"
      className="relative hidden flex-col justify-between overflow-hidden bg-teal p-14 text-text lg:flex"
    >
      <div className="flex items-center gap-3">
        <img src={logo} alt="" className="size-10" />
        <span className="text-2xl font-bold">WeHum</span>
      </div>
      <div className="relative flex items-center justify-center">
        <svg width="360" height="360" viewBox="0 0 360 360" aria-hidden className="max-w-full">
          <circle cx="180" cy="180" r="170" fill="none" className="stroke-teal-text/30" strokeWidth="1" strokeDasharray="3 7" />
          <circle
            cx="180"
            cy="180"
            r="130"
            fill="none"
            className="stroke-ember"
            strokeWidth="6"
            strokeDasharray="560 260"
            strokeLinecap="round"
            transform="rotate(-80 180 180)"
          />
          <circle
            cx="180"
            cy="180"
            r="130"
            fill="none"
            className="stroke-success"
            strokeWidth="6"
            strokeDasharray="120 700"
            strokeLinecap="round"
            transform="rotate(150 180 180)"
          />
          <circle cx="180" cy="50" r="7" className="fill-success" />
          <circle cx="62" cy="236" r="6" className="fill-ember-soft" />
          <circle cx="300" cy="250" r="5" className="fill-success" />
        </svg>
        <p className="absolute flex flex-col items-center gap-1 text-center">
          <span className="tabular text-[52px] font-bold leading-none" data-testid="meditated-today">
            {count === null ? '—' : formatNumber(count)}
          </span>
          <span className="text-[15px] text-teal-text">meditated together today</span>
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="max-w-[440px] text-[28px] font-bold leading-tight">Everything people hear in WeHum starts here.</p>
        <p className="text-[15px] text-teal-text">Sessions, programs, daily messages and the community, in one place.</p>
      </div>
    </section>
  );
}

type Props = {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Small line under the form. */
  footer?: ReactNode;
};

/** Two-column frame for sign in, forgot password, reset password and accept invite. */
export function AuthLayout({ title, subtitle, children, footer }: Props) {
  return (
    <div className="grid min-h-full grid-cols-1 lg:grid-cols-2">
      <Hero />
      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="flex w-full max-w-[400px] flex-col gap-[18px]">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[1.2px] text-ember-text">Admin CMS</span>
            <h1 className="text-[30px] font-bold leading-9 tracking-[-0.4px]">{title}</h1>
            {subtitle ? <p className="text-body text-text-muted">{subtitle}</p> : null}
          </div>
          {children}
          {footer ? <p className="text-center text-sm text-text-faint">{footer}</p> : null}
        </div>
      </main>
    </div>
  );
}

/** Red or neutral message box above a form. `role="alert"` so it is read out when it appears. */
export function FormMessage({ tone = 'error', children }: { tone?: 'error' | 'info'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'rounded-btn border border-danger-border bg-danger/10 px-3.5 py-3 text-sm font-semibold text-danger-text'
          : 'rounded-btn border border-border-strong bg-surface px-3.5 py-3 text-sm text-text-body'
      }
    >
      {children}
    </div>
  );
}
