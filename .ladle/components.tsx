import type { GlobalProvider } from '@ladle/react';
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router';
import '../src/styles/globals.css';
import { Toaster } from '../src/ui/Toast';
import { TooltipProvider } from '../src/ui/Tooltip';

/** Wraps every Ladle story: app styles, router context, tooltips, toasts, and Ladle's theme switch mapped to our tokens. */
export const Provider: GlobalProvider = ({ children, globalState }) => {
  const theme = globalState.theme === 'light' ? 'light' : 'dark';
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return (
    <MemoryRouter>
      <TooltipProvider>
        <div className="p-6">{children}</div>
        <Toaster />
      </TooltipProvider>
    </MemoryRouter>
  );
};
