import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useChangedByOthers } from '../../hooks/useEntity';
import { useAdmin } from '../../hooks/useRole';
import { formatDateTime, formatRelative } from '../../lib/format';
import type { Role } from '../../lib/rbac';
import { StatusText } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { SectionCard } from '../../ui/Card';
import { ConflictDialog, type ConflictField } from '../../ui/ConflictDialog';
import { ConfirmDialog, Dialog } from '../../ui/Dialog';
import { Input, Textarea } from '../../ui/Input';
import { Menu } from '../../ui/Menu';
import { NumberInput } from '../../ui/NumberInput';
import { PageHeader } from '../../ui/PageHeader';
import { Select } from '../../ui/Select';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { Switch } from '../../ui/Switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/Tabs';
import { TimeInput } from '../../ui/TimeInput';
import { toast } from '../../ui/Toast';
import { useConfigForm } from '../config/useConfigForm';
import {
  actionLabel,
  ROLE_INFO,
  semverOk,
  settingsApi,
  useAllConfig,
  useAudit,
  useSettingsCache,
  useTeam,
  type AuditFilters,
  type LegalConfig,
  type MainConfig,
  type TeamMember,
} from './api';

const TABS = [
  { value: 'general', label: 'General' },
  { value: 'team', label: 'Team & roles' },
  { value: 'membership', label: 'Membership' },
  { value: 'releases', label: 'App & releases' },
  { value: 'legal', label: 'Legal & privacy' },
  { value: 'audit', label: 'Audit log' },
] as const;
type Tab = (typeof TABS)[number]['value'];

const MAIN_FIELDS: ConflictField<MainConfig>[] = [
  { key: 'supportEmail', label: 'Support email' },
  { key: 'defaultReminderTime', label: 'Default reminder time' },
  { key: 'languages', label: 'Languages' },
  {
    key: 'minVersion',
    label: 'Minimum app version',
    format: (v) => `iOS ${(v as MainConfig['minVersion']).ios} · Android ${(v as MainConfig['minVersion']).android}`,
  },
  { key: 'maintenance', label: 'Maintenance mode' },
  {
    key: 'features',
    label: 'Feature flags',
    format: (v) =>
      Object.entries(v as MainConfig['features'])
        .filter(([, on]) => on)
        .map(([k]) => k)
        .join(', ') || 'none',
  },
];
const LEGAL_FIELDS: ConflictField<LegalConfig>[] = [
  { key: 'privacyUrl', label: 'Privacy policy URL' },
  { key: 'termsUrl', label: 'Terms URL' },
  { key: 'healthDisclaimer', label: 'Health disclaimer' },
  { key: 'deleteInactiveGuestsMonths', label: 'Delete inactive guests after (months)' },
];
const FEATURES: { key: keyof MainConfig['features']; label: string; description: string }[] = [
  { key: 'challenges', label: 'Challenges', description: 'Group challenges on the Today screen.' },
  { key: 'gratitude', label: 'Gratitude feed', description: 'A shared feed of gratitude posts (moderated in Dedications & gratitude).' },
  { key: 'breathwork', label: 'Breathwork', description: 'Breathwork sessions as their own section.' },
  { key: 'milestones', label: 'Milestones', description: 'Progress milestones (7 days, 30 days …).' },
  { key: 'intent', label: 'Intent question', description: 'Ask “what brings you here?” during onboarding.' },
];

function Row({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

type MainForm = ReturnType<typeof useConfigForm<MainConfig>>;
type LegalForm = ReturnType<typeof useConfigForm<LegalConfig>>;

function General({ form }: { form: MainForm }) {
  const v = form.value!;
  const [langs, setLangs] = useState<string | null>(null);
  return (
    <SectionCard title="General" size="h2">
      <Row>
        <Input label="App name" value="WeHum" readOnly hint="Set in the app stores." />
        <Input
          label="Support email"
          type="email"
          value={v.supportEmail}
          onChange={(e) => form.edit({ supportEmail: e.target.value.trim() })}
          error={/^\S+@\S+\.\S+$/.test(v.supportEmail) ? undefined : 'Enter an email address'}
        />
      </Row>
      <Row>
        <TimeInput
          label="Default reminder time"
          hint="Local time on each phone, for people who did not choose one"
          value={v.defaultReminderTime}
          onChange={(t) => form.edit({ defaultReminderTime: t })}
        />
        <Input
          label="Languages"
          hint="Language codes, comma separated (en, de)"
          value={langs ?? v.languages.join(', ')}
          onChange={(e) => setLangs(e.target.value)}
          onBlur={() => {
            if (langs === null) return;
            const list = langs
              .split(',')
              .map((l) => l.trim().toLowerCase())
              .filter(Boolean);
            if (list.length) form.edit({ languages: list });
            setLangs(null);
          }}
        />
      </Row>
    </SectionCard>
  );
}

function Releases({ form }: { form: MainForm }) {
  const v = form.value!;
  return (
    <SectionCard title="App & releases" size="h2" description="Takes effect in the app within a minute (config changes are pushed live).">
      <Row>
        <Input
          label="Minimum iOS version"
          value={v.minVersion.ios}
          error={semverOk(v.minVersion.ios) ? undefined : 'Use x.y.z, e.g. 1.2.0'}
          onChange={(e) => form.edit({ minVersion: { ...v.minVersion, ios: e.target.value.trim() } })}
        />
        <Input
          label="Minimum Android version"
          value={v.minVersion.android}
          error={semverOk(v.minVersion.android) ? undefined : 'Use x.y.z, e.g. 1.2.0'}
          onChange={(e) => form.edit({ minVersion: { ...v.minVersion, android: e.target.value.trim() } })}
        />
      </Row>
      <p className="text-sm text-text-muted">Older apps are asked to update before they continue (the API answers 426).</p>
      <Switch
        label="Maintenance mode"
        description="The app shows a short “back soon” screen. Use only during planned work."
        checked={v.maintenance}
        onCheckedChange={(c) => form.edit({ maintenance: c })}
      />
      <h3 className="mt-2 text-h3">Feature flags</h3>
      <p className="text-sm text-text-muted">
        Prepare the content first:{' '}
        <Link to="/challenges" className="font-semibold underline underline-offset-2">
          Challenges
        </Link>
        ,{' '}
        <Link to="/coming-soon" className="font-semibold underline underline-offset-2">
          Breathwork &amp; milestones
        </Link>
        , and the gratitude feed is moderated in{' '}
        <Link to="/moderation" className="font-semibold underline underline-offset-2">
          Dedications &amp; gratitude
        </Link>
        .
      </p>
      <div className="flex flex-col gap-3">
        {FEATURES.map((f) => (
          <Switch
            key={f.key}
            label={f.label}
            description={f.description}
            checked={v.features[f.key]}
            onCheckedChange={(c) => form.edit({ features: { ...v.features, [f.key]: c } })}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function Legal({ form }: { form: LegalForm }) {
  const v = form.value!;
  const urlOk = (u: string) => /^https:\/\/\S+$/.test(u);
  return (
    <SectionCard title="Legal & privacy" size="h2">
      <Row>
        <Input
          label="Privacy policy URL"
          value={v.privacyUrl}
          error={urlOk(v.privacyUrl) ? undefined : 'Use an https:// link'}
          onChange={(e) => form.edit({ privacyUrl: e.target.value.trim() })}
        />
        <Input
          label="Terms URL"
          value={v.termsUrl}
          error={urlOk(v.termsUrl) ? undefined : 'Use an https:// link'}
          onChange={(e) => form.edit({ termsUrl: e.target.value.trim() })}
        />
      </Row>
      <Textarea
        label="Health disclaimer"
        rows={4}
        maxLength={1000}
        value={v.healthDisclaimer}
        onChange={(e) => form.edit({ healthDisclaimer: e.target.value })}
      />
      <NumberInput
        label="Delete inactive guest data after"
        unit="months"
        value={v.deleteInactiveGuestsMonths}
        min={1}
        max={60}
        onChange={(n) => n && form.edit({ deleteInactiveGuestsMonths: n })}
      />
    </SectionCard>
  );
}

function Membership() {
  return (
    <SectionCard title="Membership" size="h2">
      <p className="text-body">
        Plans, prices and the Founding offer live in RevenueCat and the stores. See them on{' '}
        <Link to="/subscriptions" className="font-semibold underline underline-offset-2">
          Subscriptions
        </Link>
        .
      </p>
      <Switch
        label="Guests can use the app without an account"
        description="Locked on: Apple requires it, and guests can still subscribe."
        checked
        disabled
        onCheckedChange={() => {}}
      />
    </SectionCard>
  );
}

function InviteDialog({ open, onOpenChange, isOwner }: { open: boolean; onOpenChange: (o: boolean) => void; isOwner: boolean }) {
  const cache = useSettingsCache();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const send = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter an email address');
    setBusy(true);
    try {
      await settingsApi.invite({ email, name: name.trim() || undefined, role });
      toast.success('Invitation sent', `${email} gets an email with a link to set a password.`);
      cache.teamChanged();
      setEmail('');
      setName('');
      onOpenChange(false);
    } catch (e) {
      toast.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite a team member"
      description="They get an email to set a password and two-step sign-in."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void send()}>
            Send invitation
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          value={email}
          error={error}
          onChange={(e) => {
            setEmail(e.target.value.trim());
            setError(undefined);
          }}
        />
        <Input label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <Select
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          options={(Object.keys(ROLE_INFO) as Role[])
            .filter((r) => isOwner || r !== 'owner')
            .map((r) => ({ value: r, label: ROLE_INFO[r].label }))}
          hint={ROLE_INFO[role].text}
        />
      </div>
    </Dialog>
  );
}

function Team() {
  const me = useAdmin();
  const team = useTeam();
  const cache = useSettingsCache();
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [busy, setBusy] = useState(false);
  const isOwner = me?.role === 'owner';
  const change = async (m: TeamMember, patch: Parameters<typeof settingsApi.update>[1], done: string) => {
    try {
      await settingsApi.update(m.id, patch);
      toast.success(done);
      cache.teamChanged();
    } catch (e) {
      toast.apiError(e);
      cache.teamChanged(); // put the select back to the saved role
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await settingsApi.remove(removing!.id);
      toast.success(`${removing!.name} removed from the team`);
      setRemoving(null);
      cache.teamChanged();
    } catch (e) {
      toast.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <SectionCard
      title="Team & roles"
      size="h2"
      action={
        <Button variant="outline" size="sm" onClick={() => setInviting(true)}>
          + Invite member
        </Button>
      }
    >
      {team.isError ? (
        <ErrorState error={team.error} onRetry={() => void team.refetch()} />
      ) : team.isPending ? (
        <SkeletonRows rows={4} label="Loading the team" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <caption className="sr-only">Team members</caption>
            <thead className="text-xs font-semibold uppercase tracking-[0.8px] text-text-faint">
              <tr>
                <th className="py-2 font-semibold">Member</th>
                <th className="py-2 font-semibold">Role</th>
                <th className="py-2 font-semibold">Last sign-in</th>
                <th className="py-2 font-semibold">2-step</th>
                <th className="py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {team.data.map((m) => {
                const self = m.id === me?.id;
                const locked = self || (!isOwner && m.role === 'owner');
                return (
                  <tr key={m.id} className="border-t border-border">
                    <td className="py-3 pr-3">
                      <span className="flex flex-col">
                        <span className="text-body font-semibold">
                          {m.name}
                          {self ? <span className="font-normal text-text-muted"> (you)</span> : null}
                        </span>
                        <span className="text-xs text-text-muted">{m.email}</span>
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      <Select
                        hideLabel
                        size="sm"
                        label={`Role of ${m.name}`}
                        value={m.role}
                        disabled={locked || m.status === 'disabled'}
                        onChange={(e) =>
                          void change(
                            m,
                            { role: e.target.value as Role },
                            `${m.name} is now ${ROLE_INFO[e.target.value as Role].label.toLowerCase()}`,
                          )
                        }
                        options={(Object.keys(ROLE_INFO) as Role[])
                          .filter((r) => isOwner || r !== 'owner' || m.role === 'owner')
                          .map((r) => ({ value: r, label: ROLE_INFO[r].label }))}
                      />
                    </td>
                    <td className="py-3 pr-3 text-sm text-text-muted">
                      {m.status === 'invited'
                        ? 'Invite pending'
                        : m.status === 'disabled'
                          ? 'Disabled'
                          : m.lastSignInAt
                            ? formatRelative(m.lastSignInAt)
                            : 'Never'}
                    </td>
                    <td className="py-3 pr-3">
                      {m.status === 'invited' ? (
                        <span className="text-text-muted">—</span>
                      ) : (
                        <StatusText tone={m.mfaEnabled ? 'success' : 'ember'}>{m.mfaEnabled ? 'On' : 'Off'}</StatusText>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {locked ? null : (
                        <Menu
                          label={`More actions for ${m.name}`}
                          items={[
                            m.status === 'disabled'
                              ? {
                                  key: 'enable',
                                  label: 'Enable',
                                  onSelect: () => void change(m, { status: 'active' }, `${m.name} can sign in again`),
                                }
                              : m.status === 'active'
                                ? {
                                    key: 'disable',
                                    label: 'Disable',
                                    onSelect: () => void change(m, { status: 'disabled' }, `${m.name} is signed out and disabled`),
                                  }
                                : null,
                            { key: 'remove', label: 'Remove from team', danger: true, onSelect: () => setRemoving(m) },
                          ].filter((x): x is NonNullable<typeof x> => !!x)}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ul aria-label="What each role can do" className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(ROLE_INFO) as Role[]).map((r) => (
          <li key={r} className="rounded-tile bg-input px-3.5 py-3">
            <p className="text-sm font-semibold">{ROLE_INFO[r].label}</p>
            <p className="text-sm text-text-muted">{ROLE_INFO[r].text}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-faint">
        There is always at least one active owner. Admins cannot change owners. Nobody changes their own role.
      </p>
      <InviteDialog open={inviting} onOpenChange={setInviting} isOwner={isOwner} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing ? `Remove ${removing.name} from the team?` : ''}
        description="They are signed out everywhere and cannot sign in again. Their past changes stay in the audit log."
        confirmLabel="Remove"
        danger
        loading={busy}
        onConfirm={() => void remove()}
      />
    </SectionCard>
  );
}

function Audit() {
  const team = useTeam();
  const [f, setF] = useState<AuditFilters>({ action: '', targetType: '', actorId: '' });
  const audit = useAudit(f);
  const rows = audit.data?.pages.flatMap((p) => p.data) ?? [];
  const who = (id: string | null) => (id ? (team.data?.find((m) => m.id === id)?.name ?? 'Former team member') : 'System');
  return (
    <SectionCard title="Audit log" size="h2" description="Every change made in the CMS, newest first.">
      <div className="flex flex-wrap gap-3">
        <Select
          inline
          size="sm"
          label="Who"
          value={f.actorId}
          onChange={(e) => setF({ ...f, actorId: e.target.value })}
          options={[{ value: '', label: 'Everyone' }, ...(team.data ?? []).map((m) => ({ value: m.id, label: m.name }))]}
        />
        <Select
          inline
          size="sm"
          label="What"
          value={f.targetType}
          onChange={(e) => setF({ ...f, targetType: e.target.value })}
          options={[
            { value: '', label: 'Everything' },
            ...[
              'session',
              'program',
              'theme',
              'teacher',
              'motd',
              'dailyMessage',
              'config',
              'notification',
              'dedication',
              'user',
              'admin',
            ].map((t) => ({
              value: t,
              label: t,
            })),
          ]}
        />
      </div>
      {audit.isError ? (
        <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
      ) : audit.isPending ? (
        <SkeletonRows rows={6} label="Loading the audit log" />
      ) : rows.length === 0 ? (
        <EmptyState title="No entries" description="Nothing matches these filters." />
      ) : (
        <ul aria-label="Audit log" className="flex flex-col">
          {rows.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-t border-border py-2.5 text-sm first:border-t-0"
            >
              <span className="tabular text-text-muted">{formatDateTime(r.at)}</span>
              <span className="min-w-0">
                <span className="font-semibold">{actionLabel(r.action)}</span>
                <span className="block truncate text-xs text-text-muted">
                  {r.targetType}
                  {r.targetId ? ` · ${r.targetId}` : ''}
                </span>
              </span>
              <span className="truncate text-text-muted">
                {who(r.actorId)}
                {r.actorRole ? ` · ${r.actorRole}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {audit.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          loading={audit.isFetchingNextPage}
          onClick={() => void audit.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
    </SectionCard>
  );
}

/** 19 Settings: team access, membership, app releases and flags, legal pages, audit log. Owners and admins. */
export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.value === params.get('tab')) ? (params.get('tab') as Tab) : 'general';
  const config = useAllConfig();
  const cache = useSettingsCache();
  const mainChange = useChangedByOthers('config', 'main');
  const legalChange = useChangedByOthers('config', 'legal');
  const main = useConfigForm<MainConfig>({
    doc: config.data?.main,
    put: (v, version) => settingsApi.saveConfig('main', v, version),
    onSaved: (doc) => {
      cache.configSaved('main', doc);
      mainChange.dismiss();
      toast.success('Settings saved');
    },
    onError: (e) => toast.apiError(e, 'Could not save the settings.'),
  });
  const legal = useConfigForm<LegalConfig>({
    doc: config.data?.legal,
    put: (v, version) => settingsApi.saveConfig('legal', v, version),
    onSaved: (doc) => {
      cache.configSaved('legal', doc);
      legalChange.dismiss();
      toast.success('Legal settings saved');
    },
    onError: (e) => toast.apiError(e, 'Could not save the legal settings.'),
  });
  const mv = main.value;
  const lv = legal.value;
  const invalid =
    (!!mv && (!semverOk(mv.minVersion.ios) || !semverOk(mv.minVersion.android) || !/^\S+@\S+\.\S+$/.test(mv.supportEmail))) ||
    (!!lv && (!/^https:\/\/\S+$/.test(lv.privacyUrl) || !/^https:\/\/\S+$/.test(lv.termsUrl)));
  const dirty = main.dirty || legal.dirty;
  const usesForms = tab === 'general' || tab === 'releases' || tab === 'legal';

  const someoneElse =
    (mainChange.change && !main.dirty ? mainChange.change : null) ?? (legalChange.change && !legal.dirty ? legalChange.change : null);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Team access, membership, app releases and legal pages"
        actions={
          usesForms || dirty ? (
            <>
              {dirty ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    main.discard();
                    legal.discard();
                  }}
                >
                  Discard
                </Button>
              ) : null}
              <Button
                loading={main.saving || legal.saving}
                disabled={!dirty || invalid}
                onClick={() => {
                  if (main.dirty) main.save();
                  if (legal.dirty) legal.save();
                }}
              >
                Save changes
              </Button>
            </>
          ) : undefined
        }
      />
      {someoneElse ? (
        <p role="status" className="rounded-btn bg-info px-4 py-2.5 text-body text-info-text">
          {someoneElse.by?.name ?? 'Someone'} saved new settings. They are shown below.
        </p>
      ) : null}
      <Tabs
        value={tab}
        onValueChange={(v) => setParams(v === 'general' ? {} : { tab: v }, { replace: true })}
        orientation="vertical"
        className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]"
      >
        <TabsList aria-label="Settings sections" className="flex-col items-stretch rounded-card border border-border bg-surface p-2.5">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              {(t.value === 'general' || t.value === 'releases') && main.dirty ? <span className="sr-only"> (unsaved)</span> : null}
            </TabsTrigger>
          ))}
        </TabsList>
        {config.isError ? (
          <ErrorState error={config.error} onRetry={() => void config.refetch()} />
        ) : !mv || !lv ? (
          <SkeletonRows rows={6} label="Loading settings" />
        ) : (
          <>
            <TabsContent value="general">
              <General form={main} />
            </TabsContent>
            <TabsContent value="team">
              <Team />
            </TabsContent>
            <TabsContent value="membership">
              <Membership />
            </TabsContent>
            <TabsContent value="releases">
              <Releases form={main} />
            </TabsContent>
            <TabsContent value="legal">
              <Legal form={legal} />
            </TabsContent>
            <TabsContent value="audit">
              <Audit />
            </TabsContent>
          </>
        )}
      </Tabs>
      {main.conflict ? (
        <ConflictDialog
          open
          mine={main.conflict.mine}
          theirs={main.conflict.theirs.value}
          fields={MAIN_FIELDS}
          by={mainChange.change?.by?.name}
          saving={main.saving}
          onKeepMine={main.keepMine}
          onTakeTheirs={main.takeTheirs}
        />
      ) : legal.conflict ? (
        <ConflictDialog
          open
          mine={legal.conflict.mine}
          theirs={legal.conflict.theirs.value}
          fields={LEGAL_FIELDS}
          by={legalChange.change?.by?.name}
          saving={legal.saving}
          onKeepMine={legal.keepMine}
          onTakeTheirs={legal.takeTheirs}
        />
      ) : null}
    </>
  );
}
