import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cn } from '../lib/cn';

export type NavItem = { key: string; label: string; path: string; icon: ReactNode; badge?: number };
export type NavSection = { section: string; items: NavItem[] };

/**
 * Sidebar links (design: Sidebar.dc.html). Under 1200 px the sidebar shows icons only (spec §5):
 * labels stay in the accessibility tree and appear as a native tooltip.
 */
export function SidebarNav({ sections }: { sections: NavSection[] }) {
  return (
    <>
      {sections.map((s, i) => (
        <div key={s.section || `section-${i}`} role="group" aria-label={s.section || undefined} className="flex flex-col gap-0.5">
          {s.section ? (
            <div aria-hidden className="hidden px-3 pb-1 pt-3 text-overline font-semibold uppercase text-text-faint nav:block">
              {s.section}
            </div>
          ) : null}
          {/* Collapsed: a thin rule replaces the section name. */}
          {s.section && i > 0 ? <div aria-hidden className="mx-3 my-2 border-t border-border nav:hidden" /> : null}
          {s.items.map((item) => (
            <NavLink
              key={item.key}
              to={item.path}
              end={item.path === '/'}
              title={item.label}
              className={({ isActive }) =>
                cn(
                  'relative flex min-h-9 items-center justify-center gap-3 rounded-input px-3 text-body transition-colors nav:justify-start',
                  isActive ? 'bg-ember/15 font-semibold text-ember-text' : 'font-medium text-text-muted hover:text-text',
                )
              }
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="sr-only min-w-0 flex-1 nav:not-sr-only">{item.label}</span>
              {item.badge ? (
                <span className="tabular absolute right-1 top-0.5 rounded-full bg-ember px-1.5 text-overline font-bold tracking-normal text-ember-on nav:static nav:px-2 nav:py-0.5">
                  {item.badge > 99 ? '99+' : item.badge}
                  <span className="sr-only"> to review</span>
                </span>
              ) : null}
            </NavLink>
          ))}
        </div>
      ))}
    </>
  );
}
