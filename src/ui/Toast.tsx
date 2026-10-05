import * as RadixToast from '@radix-ui/react-toast';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useSyncExternalStore, type ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { cn } from '../lib/cn';

type Tone = 'success' | 'error' | 'info';
type ToastItem = { id: number; tone: Tone; title: string; description?: string; traceId?: string };

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const push = (t: Omit<ToastItem, 'id'>) => {
  seq += 1;
  items = [...items, { id: seq, ...t }];
  emit();
  return seq;
};

/**
 * Toasts from anywhere (components, mutation callbacks): `toast.success('Saved')`.
 * `toast.apiError(e)` shows the API message and its traceId (spec §13 "error → toast").
 */
export const toast = {
  success: (title: string, description?: string) => push({ tone: 'success', title, description }),
  info: (title: string, description?: string) => push({ tone: 'info', title, description }),
  error: (title: string, description?: string) => push({ tone: 'error', title, description }),
  apiError: (e: unknown, fallback = 'Something went wrong') =>
    push({
      tone: 'error',
      title: e instanceof Error && e.message ? e.message : fallback,
      traceId: e instanceof ApiError ? e.traceId : undefined,
    }),
  dismiss: (id: number) => {
    items = items.filter((t) => t.id !== id);
    emit();
  },
  clear: () => {
    items = [];
    emit();
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const icons: Record<Tone, ReactNode> = {
  success: <CircleCheck size={18} aria-hidden className="text-success" />,
  error: <CircleAlert size={18} aria-hidden className="text-danger-text" />,
  info: <Info size={18} aria-hidden className="text-info-text" />,
};

/** Mount once near the root. Errors stay 8 s, the rest 4 s; hovering or focusing a toast pauses its timer. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items);
  return (
    <RadixToast.Provider swipeDirection="right" label="Notifications">
      {list.map((t) => (
        <RadixToast.Root
          key={t.id}
          type={t.tone === 'error' ? 'foreground' : 'background'}
          duration={t.tone === 'error' ? 8000 : 4000}
          onOpenChange={(open) => {
            if (!open) toast.dismiss(t.id);
          }}
          className={cn(
            'flex items-start gap-3 rounded-tile border bg-surface p-3.5 shadow-xl',
            t.tone === 'error' ? 'border-danger-border' : 'border-border-strong',
          )}
        >
          <span className="mt-0.5">{icons[t.tone]}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <RadixToast.Title className="text-body font-semibold">{t.title}</RadixToast.Title>
            {t.description ? <RadixToast.Description className="text-sm text-text-muted">{t.description}</RadixToast.Description> : null}
            {t.traceId ? <span className="tabular text-xs text-text-faint">Reference: {t.traceId}</span> : null}
          </div>
          <RadixToast.Close aria-label="Dismiss" className="rounded-input p-1 text-text-muted hover:text-text">
            <X size={16} aria-hidden />
          </RadixToast.Close>
        </RadixToast.Root>
      ))}
      <RadixToast.Viewport className="fixed bottom-4 right-4 z-[60] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
    </RadixToast.Provider>
  );
}
