import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';

/** Mount once near the root so tooltips share one delay timer. */
export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RadixTooltip.Provider delayDuration={300} skipDelayDuration={200}>
    {children}
  </RadixTooltip.Provider>
);

type Props = {
  content: ReactNode;
  /** One focusable element (button, link). For a disabled button, wrap it in a <span tabIndex={0}> so it can still be hovered and focused. */
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
};

/** Hint on hover and keyboard focus (e.g. the UTC time next to a local time, or why a button is disabled). */
export function Tooltip({ content, children, side = 'top' }: Props) {
  if (!content) return children;
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-[70] max-w-xs rounded-input border border-border-strong bg-surface-alt px-2.5 py-1.5 text-xs text-text shadow-lg"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
