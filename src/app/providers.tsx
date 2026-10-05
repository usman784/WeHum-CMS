import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import type { ReactNode } from 'react';
import { queryClient } from '../lib/query';
import { Button } from '../ui/Button';
import { Toaster } from '../ui/Toast';
import { TooltipProvider } from '../ui/Tooltip';

/** Last-resort screen when a render error escapes every feature boundary. */
function Crash({ eventId }: { eventId?: string }) {
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-gutter text-center">
      <h1 className="text-h1">Something went wrong</h1>
      <p className="text-text-muted">The error was reported. Reload the page to continue.</p>
      {eventId ? <p className="tabular text-xs text-text-faint">Reference: {eventId}</p> : null}
      <Button variant="secondary" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
}

export function Providers({ children, client = queryClient }: { children: ReactNode; client?: QueryClient }) {
  return (
    <Sentry.ErrorBoundary fallback={({ eventId }) => <Crash eventId={eventId} />}>
      <QueryClientProvider client={client}>
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  );
}
