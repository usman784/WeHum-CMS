import { Outlet, type RouteObject } from 'react-router';
import { useAdmin } from '../hooks/useRole';
import { env } from '../lib/env';
import { session } from '../lib/session';
import { Card } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import { EmptyState } from '../ui/States';
import { RequireRole } from './guards/RequireRole';
import { AppShell } from './layout/AppShell';
import { nav } from './routes';

/** The build phase that delivers each screen (spec §15). Used only by the placeholder pages below. */
const phase: Record<string, string> = {
  dashboard: 'P5',
  analytics: 'P8',
  sessions: 'P3',
  programs: 'P3',
  challenges: 'P3',
  daily: 'P4',
  today: 'P4',
  themes: 'P3',
  teachers: 'P3',
  sounds: 'P3',
  sos: 'P4',
  group: 'P4',
  moderation: 'P7',
  subscriptions: 'P6',
  users: 'P6',
  notifications: 'P7',
  settings: 'P8',
};

function ComingSoon({ title, itemKey }: { title: string; itemKey: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="flex flex-1 items-center justify-center">
        <EmptyState title="This screen is not built yet" description={`It arrives with build phase ${phase[itemKey] ?? 'later'}.`} />
      </Card>
    </>
  );
}

function SignedOut() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-gutter text-center">
      <h1 className="text-h1">WeHum CMS</h1>
      <p className="text-text-muted">Sign-in arrives with build phase P2.</p>
      {env.name !== 'prod' ? (
        <p className="text-sm text-text-muted">
          Preview the shell as{' '}
          {(['owner', 'admin', 'editor', 'moderator'] as const).map((r, i) => (
            <span key={r}>
              {i ? ' · ' : ''}
              <a className="font-semibold text-ember-text underline-offset-2 hover:underline" href={`/?as=${r}`}>
                {r}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

function ShellLayout() {
  const admin = useAdmin();
  if (!admin) return <SignedOut />;
  return (
    <AppShell admin={admin} onSignOut={() => session.set(null)}>
      <Outlet />
    </AppShell>
  );
}

function NotFound() {
  return (
    <Card className="flex flex-1 items-center justify-center">
      <EmptyState title="Page not found" description="The address does not match any CMS screen." />
    </Card>
  );
}

export const routes: RouteObject[] = [
  {
    element: <ShellLayout />,
    children: [
      ...nav
        .flatMap((s) => s.items)
        .map((i) => ({
          path: i.path,
          element: (
            <RequireRole need={i.need}>
              <ComingSoon title={i.label} itemKey={i.key} />
            </RequireRole>
          ),
        })),
      // Living style guide: every UI primitive in both themes. Not shipped to production.
      ...(env.name !== 'prod' ? [{ path: '/kit', lazy: async () => ({ Component: (await import('../features/kit/Page')).KitPage }) }] : []),
      { path: '*', element: <NotFound /> },
    ],
  },
];
