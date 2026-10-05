import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, useLocation, type RouteObject } from 'react-router';
import { signOut } from '../features/auth/api';
import { IdleWarning } from '../features/auth/components/SessionDialogs';
import { useModerationCount, useOwnAdminSync } from '../features/auth/effects';
import { useLiveInvalidation } from '../hooks/useLive';
import { useSessionState } from '../hooks/useRole';
import { env } from '../lib/env';
import type { Admin } from '../lib/session';
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

/** First paint while the silent refresh runs: nothing to read, so only say that it is loading. */
function Splash() {
  return (
    <div role="status" aria-label="Loading WeHum CMS" className="flex h-full items-center justify-center">
      <span className="size-8 animate-spin rounded-full border-2 border-ember border-t-transparent" aria-hidden />
    </div>
  );
}

// The sign-in form (react-hook-form, zod, QR code) stays out of the first load. The dialog that reuses it is
// fetched right after the shell appears, so it is already there when a session ends, even if the network is gone by then.
const loadReLogin = () => import('../features/auth/components/ReLoginDialog');
const ReLoginDialog = lazy(async () => ({ default: (await loadReLogin()).ReLoginDialog }));

/** Everything that needs a signed-in admin lives here, so none of it runs on the sign-in pages. */
function SignedInShell({ admin, expired }: { admin: Admin; expired: boolean }) {
  useLiveInvalidation();
  useOwnAdminSync();
  const moderationOpen = useModerationCount();
  useEffect(() => {
    void loadReLogin().catch(() => {});
  }, []);
  return (
    <>
      <AppShell admin={admin} moderationOpen={moderationOpen} onSignOut={() => void signOut('user')}>
        <Outlet />
      </AppShell>
      <IdleWarning enabled={!expired} />
      <Suspense fallback={null}>{expired ? <ReLoginDialog admin={admin} open /> : null}</Suspense>
    </>
  );
}

function ShellLayout() {
  const { status, admin } = useSessionState();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (!admin) {
    const next = location.pathname + location.search;
    return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <SignedInShell admin={admin} expired={status === 'expired'} />;
}

function NotFound() {
  return (
    <Card className="flex flex-1 items-center justify-center">
      <EmptyState title="Page not found" description="The address does not match any CMS screen." />
    </Card>
  );
}

const auth = () => import('../features/auth/Page');

export const routes: RouteObject[] = [
  { path: '/login', lazy: async () => ({ Component: (await auth()).LoginPage }) },
  { path: '/forgot-password', lazy: async () => ({ Component: (await auth()).ForgotPasswordPage }) },
  { path: '/reset-password', lazy: async () => ({ Component: (await auth()).ResetPasswordPage }) },
  { path: '/accept-invite', lazy: async () => ({ Component: (await auth()).AcceptInvitePage }) },
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
