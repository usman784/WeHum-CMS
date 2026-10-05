import {
  AudioLines,
  Bell,
  CalendarDays,
  ChartNoAxesColumn,
  Clock,
  CreditCard,
  Heart,
  LayoutDashboard,
  LayoutGrid,
  MessageSquare,
  Settings,
  Shield,
  Smartphone,
  Sun,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import logo from '../../assets/logo.svg';
import { initials } from '../../lib/format';
import { can, type Role } from '../../lib/rbac';
import type { Admin } from '../../lib/session';
import { SidebarNav, type NavSection } from '../../ui/SidebarNav';
import { nav } from '../routes';

const icon = (I: typeof Bell) => <I size={18} strokeWidth={1.8} aria-hidden />;

/** Same glyph ideas as design/source/Sidebar.dc.html, drawn with lucide. */
const icons: Record<string, ReactNode> = {
  dashboard: icon(LayoutDashboard),
  analytics: icon(ChartNoAxesColumn),
  sessions: icon(AudioLines),
  programs: icon(CalendarDays),
  challenges: icon(Trophy),
  daily: icon(Sun),
  today: icon(Smartphone),
  themes: icon(LayoutGrid),
  teachers: icon(UserRound),
  sounds: icon(Bell),
  sos: icon(Heart),
  group: icon(Clock),
  moderation: icon(Shield),
  subscriptions: icon(CreditCard),
  users: icon(Users),
  notifications: icon(MessageSquare),
  settings: icon(Settings),
};

const roleName: Record<Role, string> = { owner: 'Owner', admin: 'Admin', editor: 'Editor', moderator: 'Moderator' };

/** Nav sections this role may see. An empty section is dropped. */
export function navFor(role: Role | undefined, moderationOpen = 0): NavSection[] {
  return nav
    .map((s) => ({
      section: s.section,
      items: s.items
        .filter((i) => can(role, i.need))
        .map((i) => ({
          key: i.key,
          label: i.label,
          path: i.path,
          icon: icons[i.key],
          badge: i.key === 'moderation' ? moderationOpen : undefined,
        })),
    }))
    .filter((s) => s.items.length > 0);
}

type Props = {
  admin: Admin;
  /** Open moderation items for the badge (live from `moderation:count`). */
  moderationOpen?: number;
  onSignOut: () => void;
};

/** App sidebar: logo, links by role, user card with sign out. 248 px wide; icons only under 1200 px. */
export function Sidebar({ admin, moderationOpen = 0, onSignOut }: Props) {
  const sections = navFor(admin.role, moderationOpen);
  const settings = sections.filter((s) => !s.section);
  const main = sections.filter((s) => s.section);
  return (
    <nav
      aria-label="CMS navigation"
      className="sticky top-0 flex h-screen w-[72px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-sidebar px-3.5 py-[18px] nav:w-sidebar"
    >
      <div className="flex items-center justify-center gap-2.5 px-2.5 pb-3.5 pt-0.5 nav:justify-start">
        <img src={logo} alt="" className="size-[30px]" />
        <div className="hidden flex-col nav:flex">
          <span className="text-[17px] font-bold leading-tight tracking-[-0.2px]">WeHum</span>
          <span className="text-overline font-semibold uppercase text-ember-text">Admin CMS</span>
        </div>
      </div>

      <SidebarNav sections={main} />
      <div className="min-h-3 flex-1" />
      <SidebarNav sections={settings} />

      <div className="mt-1.5 flex items-center justify-center gap-2.5 rounded-tile border border-border bg-surface p-1.5 nav:justify-start nav:px-3 nav:py-2.5">
        <span
          aria-hidden
          className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-teal text-sm font-bold text-teal-text"
        >
          {initials(admin.name)}
        </span>
        <span className="hidden min-w-0 flex-1 flex-col nav:flex">
          <span className="truncate text-sm font-semibold">{admin.name}</span>
          <span className="text-xs text-text-muted">
            {roleName[admin.role]} ·{' '}
            <button type="button" onClick={onSignOut} className="rounded underline-offset-2 hover:text-text hover:underline">
              Sign out
            </button>
          </span>
        </span>
      </div>
      {/* Collapsed sidebar: the card has no room for text, so sign out gets its own small button. */}
      <button type="button" onClick={onSignOut} className="mt-1 rounded-input py-1 text-xs text-text-muted hover:text-text nav:hidden">
        Sign out
      </button>
    </nav>
  );
}
