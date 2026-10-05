import { QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import axe from 'axe-core';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { createQueryClient } from '../lib/query';
import { Toaster } from '../ui/Toast';
import { TooltipProvider } from '../ui/Tooltip';

/** Render with everything a component may need: router, query client, tooltips, toasts. */
export function renderUi(ui: ReactElement, { route = '/', ...options }: RenderOptions & { route?: string } = {}) {
  const client = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={client}>
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
  return render(ui, { wrapper, ...options });
}

/**
 * axe rule ids that fail on this DOM. Colour contrast needs real layout and paint, which jsdom does not have:
 * it is checked in a real browser by the Playwright suite (e2e/kit.spec.ts) in both themes.
 */
export async function a11yViolations(node: Element = document.body): Promise<string[]> {
  const { violations } = await axe.run(node, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
}
