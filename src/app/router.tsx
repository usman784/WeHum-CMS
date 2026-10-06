import { lazy, Suspense, useEffect, type ComponentType, type LazyExoticComponent } from 'react';
import { Navigate, Outlet, useLocation, type RouteObject } from 'react-router';
import { signOut } from '../features/auth/api';
import { IdleWarning } from '../features/auth/components/SessionDialogs';
import { useModerationCount, useOwnAdminSync } from '../features/auth/effects';
import { useLiveInvalidation } from '../hooks/useLive';
import { useSessionState } from '../hooks/useRole';
import { env } from '../lib/env';
import type { Admin } from '../lib/session';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/States';
import { RequireRole } from './guards/RequireRole';
import { AppShell } from './layout/AppShell';
import { nav } from './routes';

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

/**
 * The screens, each in its own chunk (spec §6.1 route-level code splitting). Every nav key has one.
 */
const pages: Record<string, LazyExoticComponent<ComponentType>> = {
  dashboard: lazy(async () => ({ default: (await import('../features/dashboard/Page')).DashboardPage })),
  analytics: lazy(async () => ({ default: (await import('../features/analytics/Page')).AnalyticsPage })),
  themes: lazy(async () => ({ default: (await import('../features/themes/Page')).ThemesPage })),
  challenges: lazy(async () => ({ default: (await import('../features/challenges/Page')).ChallengesPage })),
  programs: lazy(async () => ({ default: (await import('../features/programs/Page')).ProgramsPage })),
  sounds: lazy(async () => ({ default: (await import('../features/sounds/Page')).SoundsPage })),
  sessions: lazy(async () => ({ default: (await import('../features/sessions/Page')).SessionsPage })),
  teachers: lazy(async () => ({ default: (await import('../features/teachers/Page')).TeachersPage })),
  today: lazy(async () => ({ default: (await import('../features/today/Page')).TodayPage })),
  daily: lazy(async () => ({ default: (await import('../features/daily/Page')).DailyMessagesPage })),
  sos: lazy(async () => ({ default: (await import('../features/sos/Page')).SosPage })),
  group: lazy(async () => ({ default: (await import('../features/group/Page')).GroupMeditationPage })),
  subscriptions: lazy(async () => ({ default: (await import('../features/subscriptions/Page')).SubscriptionsPage })),
  users: lazy(async () => ({ default: (await import('../features/users/Page')).UsersPage })),
  moderation: lazy(async () => ({ default: (await import('../features/moderation/Page')).ModerationPage })),
  notifications: lazy(async () => ({ default: (await import('../features/notifications/Page')).NotificationsPage })),
  settings: lazy(async () => ({ default: (await import('../features/settings/Page')).SettingsPage })),
};

function PageLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-5">
      <Skeleton className="h-9 w-60" />
      <Skeleton className="h-[420px] rounded-card" />
    </div>
  );
}

function screen(key: string) {
  const Page = pages[key]!;
  return (
    <Suspense fallback={<PageLoading />}>
      <Page />
    </Suspense>
  );
}

const SessionEditor = lazy(async () => ({ default: (await import('../features/sessions/Editor')).SessionEditorPage }));
const ComingSoon = lazy(async () => ({ default: (await import('../features/coming-soon/Page')).ComingSoonPage }));
const UserDetail = lazy(async () => ({ default: (await import('../features/users/Detail')).UserDetailPage }));

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
          element: <RequireRole need={i.need}>{screen(i.key)}</RequireRole>,
        })),
      {
        path: '/sessions/:id',
        element: (
          <RequireRole need="content.edit">
            <Suspense fallback={<PageLoading />}>
              <SessionEditor />
            </Suspense>
          </RequireRole>
        ),
      },
      {
        path: '/users/:id',
        element: (
          <RequireRole need="users.view">
            <Suspense fallback={<PageLoading />}>
              <UserDetail />
            </Suspense>
          </RequireRole>
        ),
      },
      {
        path: '/coming-soon',
        element: (
          <RequireRole need="content.edit">
            <Suspense fallback={<PageLoading />}>
              <ComingSoon />
            </Suspense>
          </RequireRole>
        ),
      },
      // Living style guide: every UI primitive in both themes. Not shipped to production.
      ...(env.name !== 'prod' ? [{ path: '/kit', lazy: async () => ({ Component: (await import('../features/kit/Page')).KitPage }) }] : []),
      { path: '*', element: <NotFound /> },
    ],
  },
];
