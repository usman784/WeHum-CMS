import * as RadixTabs from '@radix-ui/react-tabs';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../lib/cn';

/** Underline tabs (Radix: arrow keys, roving focus, aria wiring). Use `orientation="vertical"` for the Settings side list. */
export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...p }: ComponentPropsWithoutRef<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn(
        'flex gap-1 data-[orientation=horizontal]:border-b data-[orientation=horizontal]:border-border',
        'data-[orientation=vertical]:flex-col data-[orientation=vertical]:rounded-card data-[orientation=vertical]:border data-[orientation=vertical]:border-border data-[orientation=vertical]:bg-surface data-[orientation=vertical]:p-2.5',
        className,
      )}
      {...p}
    />
  );
}

export function TabsTrigger({ className, ...p }: ComponentPropsWithoutRef<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'text-body font-medium text-text-muted transition-colors hover:text-text data-[state=active]:font-semibold data-[state=active]:text-ember-text',
        'data-[orientation=horizontal]:-mb-px data-[orientation=horizontal]:h-11 data-[orientation=horizontal]:border-b-2 data-[orientation=horizontal]:border-transparent data-[orientation=horizontal]:px-3.5 data-[orientation=horizontal]:data-[state=active]:border-ember',
        'data-[orientation=vertical]:h-[42px] data-[orientation=vertical]:rounded-input data-[orientation=vertical]:px-3.5 data-[orientation=vertical]:text-left data-[orientation=vertical]:data-[state=active]:bg-ember/15',
        className,
      )}
      {...p}
    />
  );
}

export function TabsContent({ className, ...p }: ComponentPropsWithoutRef<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn('min-w-0', className)} {...p} />;
}
