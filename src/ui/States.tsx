import { CircleAlert, Inbox, Lock, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError, isNetworkError } from '../lib/api';
import { cn } from '../lib/cn';
import { Button } from './Button';

type BaseProps = {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  role?: 'status' | 'alert';
};

function State({ icon, title, description, action, className, role }: BaseProps) {
  return (
    <div role={role} className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      {icon ? <span className="flex size-12 items-center justify-center rounded-tile bg-surface-alt text-text-muted">{icon}</span> : null}
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-h3">{title}</p>
        {description ? <p className="text-sm text-text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Nothing to show yet. */
export function EmptyState(p: Omit<BaseProps, 'role'>) {
  return <State icon={<Inbox size={22} aria-hidden />} {...p} />;
}

type ErrorProps = {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
};

/** Failed to load. Shows the API `traceId` so support can find the request in the backend logs (spec §7). */
export function ErrorState({ error, title, onRetry, className }: ErrorProps) {
  const offline = isNetworkError(error);
  const traceId = error instanceof ApiError ? error.traceId : undefined;
  const message = error instanceof Error ? error.message : undefined;
  return (
    <State
      role="alert"
      className={className}
      icon={offline ? <WifiOff size={22} aria-hidden /> : <CircleAlert size={22} aria-hidden />}
      title={title ?? (offline ? 'Cannot reach the server' : 'Something went wrong')}
      description={
        <>
          {offline ? 'Check your connection and try again.' : (message ?? 'Please try again.')}
          {traceId ? <span className="tabular mt-1 block text-xs text-text-faint">Reference: {traceId}</span> : null}
        </>
      }
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}

/** The signed-in admin's role does not allow this page or action (spec §6.2). */
export function NoPermission({ className }: { className?: string }) {
  return (
    <State
      role="status"
      className={className}
      icon={<Lock size={22} aria-hidden />}
      title="No permission"
      description="Your role does not include this area. Ask an owner or admin if you need access."
    />
  );
}
