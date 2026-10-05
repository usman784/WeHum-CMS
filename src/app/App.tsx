import { Moon, Sun } from 'lucide-react';
import logo from '../assets/logo.svg';
import { useSocketStatus } from '../hooks/useLive';
import { useTheme } from '../hooks/useTheme';
import { cn } from '../lib/cn';
import { env } from '../lib/env';
import { sendSentryTestEvent, sentryEnabled } from '../lib/sentry';
import type { SocketStatus } from '../lib/socket';
import { Button } from '../ui/Button';

const pill: Record<SocketStatus, { label: string; dot: string }> = {
  live: { label: 'Live', dot: 'bg-success' },
  reconnecting: { label: 'Reconnecting…', dot: 'bg-warning' },
  offline: { label: 'Offline', dot: 'bg-text-faint' },
};

const swatches = [
  'bg-bg',
  'bg-surface',
  'bg-surface-alt',
  'bg-input',
  'bg-ember',
  'bg-teal',
  'bg-success',
  'bg-danger',
  'bg-info',
  'bg-lilac',
];

/**
 * Phase P0 shell: proves tokens, fonts, theme switch and providers work.
 * P1 replaces the body with AppShell + Sidebar; P2 adds the router and sign-in.
 */
export function App() {
  const { theme, toggleTheme } = useTheme();
  const status = useSocketStatus();
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-gutter py-4">
        <img src={logo} alt="" className="size-8" />
        <span className="text-h3">WeHum CMS</span>
        <span className="rounded-full bg-ember/15 px-2.5 py-1 text-overline uppercase text-ember-text">{env.name}</span>
        <div className="ml-auto flex items-center gap-3">
          <span
            role="status"
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-soft"
          >
            <span className={cn('size-2 rounded-full', pill[status].dot)} aria-hidden />
            {pill[status].label}
          </span>
          <Button variant="outline" size="sm" onClick={toggleTheme} aria-label={`Switch to ${next} theme`}>
            {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-5 px-gutter py-7">
        <div>
          <p className="text-overline uppercase text-ember-text">Foundation</p>
          <h1 className="text-h1">The CMS foundation is ready</h1>
          <p className="mt-1 text-text-muted">Screens arrive phase by phase. This page checks tokens, type and theme.</p>
        </div>

        <section aria-labelledby="tokens" className="rounded-card border border-border bg-surface p-6">
          <h2 id="tokens" className="text-h3">
            Tokens
          </h2>
          <ul className="mt-4 flex flex-wrap gap-3">
            {swatches.map((s) => (
              <li key={s} className="flex flex-col items-center gap-2">
                <span className={cn('size-12 rounded-tile border border-border-strong', s)} />
                <span className="text-xs text-text-faint">{s.slice(3)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 h-2 rounded-full bg-vibration" aria-hidden />
        </section>

        <section aria-labelledby="buttons" className="rounded-card border border-border bg-surface p-6">
          <h2 id="buttons" className="text-h3">
            Buttons
          </h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ghost">Ghost</Button>
            <Button loading>Loading</Button>
          </div>
          <p className="tabular mt-4 text-kpi">1,284</p>
        </section>

        {env.name !== 'prod' && sentryEnabled() ? (
          <div>
            <Button variant="secondary" size="sm" onClick={() => sendSentryTestEvent()}>
              Send Sentry test event
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
