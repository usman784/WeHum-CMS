import { Moon, Sun, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useOnline } from '../../hooks/useOnline';
import { useTheme } from '../../hooks/useTheme';
import type { Admin } from '../../lib/session';
import { IconButton } from '../../ui/IconButton';
import { ConnectionPill } from './ConnectionPill';
import { Sidebar } from './Sidebar';

type Props = {
  admin: Admin;
  moderationOpen?: number;
  onSignOut: () => void;
  children: ReactNode;
};

/**
 * Frame for every signed-in screen (spec §5): sidebar + content with padding 28 px 32 px and gap 20 px.
 * The slim top bar holds the connection pill and the theme switch.
 */
export function AppShell({ admin, moderationOpen, onSignOut, children }: Props) {
  const { theme, toggleTheme } = useTheme();
  const online = useOnline();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <div className="flex min-h-full">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-btn focus:bg-ember focus:px-4 focus:py-2 focus:font-bold focus:text-ember-on"
      >
        Skip to content
      </a>
      <Sidebar admin={admin} moderationOpen={moderationOpen} onSignOut={onSignOut} />
      <div className="flex min-w-0 flex-1 flex-col">
        {!online ? (
          <div role="alert" className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-2 text-sm font-semibold text-warning">
            <WifiOff size={16} aria-hidden />
            You are offline. You can keep reading; changes are disabled until the connection is back.
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2 px-gutter pt-4">
          <ConnectionPill />
          <IconButton label={`Switch to ${next} theme`} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
          </IconButton>
        </div>
        <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col gap-5 px-gutter pb-7 pt-3 outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
