import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { qk } from '../../lib/query';
import type { Role } from '../../lib/rbac';
import type { ConfigDoc } from '../config/useConfigForm';

/** `app_config.main` (backend `CONFIG_SCHEMAS.main`). */
export type MainConfig = {
  minVersion: { ios: string; android: string };
  /** Newest release per store; apps below it (but above minVersion) get a dismissible prompt. */
  latestVersion?: { ios: string; android: string };
  storeUrls?: { ios: string; android: string };
  maintenance: boolean;
  features: { challenges: boolean; gratitude: boolean; breathwork: boolean; milestones: boolean; intent: boolean };
  supportEmail: string;
  defaultReminderTime: string;
  languages: string[];
};
/** `app_config.legal`. */
export type LegalConfig = { privacyUrl: string; termsUrl: string; healthDisclaimer: string; deleteInactiveGuestsMonths: number };
export type AllConfig = { main: ConfigDoc<MainConfig>; legal: ConfigDoc<LegalConfig> } & Record<string, ConfigDoc<unknown>>;

export type TeamMember = {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: 'active' | 'invited' | 'disabled';
  mfaEnabled: boolean;
  lastSignInAt: string | null;
  createdAt: string;
};

export type AuditEntry = {
  id: number;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  requestId: string | null;
  at: string;
};
export type AuditFilters = { action: string; targetType: string; actorId: string };

const CONFIG_KEY = [...qk.config.all, 'all'] as const;

export function useAllConfig() {
  return useQuery({ queryKey: CONFIG_KEY, queryFn: () => api<AllConfig>('/v1/admin/config').then((r) => r.data) });
}

export function useTeam() {
  return useQuery({ queryKey: qk.admin.list(), queryFn: () => api<TeamMember[]>('/v1/admin/team').then((r) => r.data) });
}

export function useAudit(f: AuditFilters) {
  return useInfiniteQuery({
    queryKey: ['audit', f],
    queryFn: ({ pageParam }) =>
      api<AuditEntry[]>('/v1/admin/audit', {
        query: {
          action: f.action || undefined,
          targetType: f.targetType || undefined,
          actorId: f.actorId || undefined,
          limit: 50,
          cursor: pageParam,
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
}

export const settingsApi = {
  saveConfig: <T>(key: 'main' | 'legal', value: T, version: number) =>
    api<ConfigDoc<T>>(`/v1/admin/config/${key}`, { method: 'PUT', body: value, ifMatch: version }).then((r) => r.data),
  invite: (b: { email: string; name?: string; role: Role }) =>
    api<TeamMember>('/v1/admin/team/invite', { method: 'POST', body: b }).then((r) => r.data),
  update: (id: string, b: Partial<Pick<TeamMember, 'role' | 'name'>> & { status?: 'active' | 'disabled' }) =>
    api<TeamMember>(`/v1/admin/team/${id}`, { method: 'PATCH', body: b }).then((r) => r.data),
  remove: (id: string) => api(`/v1/admin/team/${id}`, { method: 'DELETE' }),
};

export function useSettingsCache() {
  const qc = useQueryClient();
  return {
    configSaved: <T>(key: 'main' | 'legal', doc: ConfigDoc<T>) =>
      qc.setQueryData<AllConfig>(CONFIG_KEY, (old) => (old ? ({ ...old, [key]: doc } as AllConfig) : old)),
    teamChanged: () => void qc.invalidateQueries({ queryKey: qk.admin.all }),
  };
}

export const ROLE_INFO: Record<Role, { label: string; text: string }> = {
  owner: { label: 'Owner', text: 'Everything, incl. billing and deleting the app data' },
  admin: { label: 'Admin', text: 'All content, users, settings except owners' },
  editor: { label: 'Editor', text: 'Sessions, programs, daily messages, push drafts' },
  moderator: { label: 'Moderator', text: 'Dedications queue only' },
};

/** "config.update" → "Config update"; the audit list's action column. */
export const actionLabel = (a: string) => {
  const s = a.replace(/[._]/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const semverOk = (v: string) => /^\d+\.\d+\.\d+$/.test(v);
