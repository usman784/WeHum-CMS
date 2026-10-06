import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSocketEvent } from '../../hooks/useLive';
import { useAdmin, useCan } from '../../hooks/useRole';
import { formatDate, formatNumber, formatPercent } from '../../lib/format';
import { Badge, StatusText, type BadgeTone } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { SectionCard } from '../../ui/Card';
import { ConfirmDialog } from '../../ui/Dialog';
import { Input, Textarea } from '../../ui/Input';
import { PageHeader } from '../../ui/PageHeader';
import { PhonePreview } from '../../ui/PhonePreview';
import { Select } from '../../ui/Select';
import { SkeletonRows } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/States';
import { Switch } from '../../ui/Switch';
import { toast } from '../../ui/Toast';
import {
  AUDIENCES,
  audienceLabel,
  AUTO_INFO,
  BODY_MAX,
  draftProblems,
  EMPTY_DRAFT,
  OPENS,
  pushApi,
  SEND_MODES,
  TITLE_MAX,
  useAnnouncements,
  useAudienceCount,
  useAutomatic,
  useLinkTargets,
  usePushCache,
  type Announcement,
  type Audience,
  type Draft,
} from './api';

/** "wehum://session/abc" → the select value ("session") and the id. */
function splitLink(link: string | null): { kind: string; id: string } {
  if (!link) return { kind: '', id: '' };
  const m = link.match(/^wehum:\/\/(session|program)\/(.+)$/);
  if (m) return { kind: m[1]!, id: m[2]! };
  return { kind: link, id: '' };
}

/** `datetime-local` value (the admin's own clock) ↔ ISO. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

type ComposerProps = {
  d: Draft;
  setD: (fn: (d: Draft) => Draft) => void;
  editing: Announcement | null;
  onDone: () => void;
};

function Composer({ d, setD, editing, onDone }: ComposerProps) {
  const admin = useAdmin();
  const canSend = useCan('push.send');
  const cache = usePushCache();
  const [saved, setSaved] = useState<{ id: string; version: number } | null>(null);
  const [countries, setCountries] = useState('');
  const [busy, setBusy] = useState<'test' | 'save' | 'send' | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setD(() => ({
      title: editing.title,
      body: editing.body,
      audience: editing.audience,
      countries: editing.countries,
      deepLink: editing.deepLink,
      sendMode: editing.sendMode,
      sendAt: editing.sendAt,
    }));
    setCountries(editing.countries.join(', '));
    setSaved({ id: editing.id, version: editing.version });
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = splitLink(d.deepLink);
  const targets = useLinkTargets(link.kind === 'session' || link.kind === 'program' ? link.kind : null);
  const count = useAudienceCount(d.audience, d.countries, d.sendMode === 'scheduled' ? d.sendAt : null);
  const problems = draftProblems(d);
  const ok = Object.keys(problems).length === 0;
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const err = (k: keyof Draft) => (touched ? problems[k] : undefined);

  const reset = () => {
    setD(() => EMPTY_DRAFT);
    setCountries('');
    setSaved(null);
    setTouched(false);
    onDone();
  };

  /** Create the draft, or save my changes to it. Returns its id. */
  const persist = async () => {
    const body = { ...d, sendAt: d.sendMode === 'scheduled' ? d.sendAt : null };
    const row = saved ? await pushApi.update(saved.id, body, saved.version) : await pushApi.create(body);
    setSaved({ id: row.id, version: row.version });
    cache.refresh();
    return row.id;
  };

  const run = async (kind: 'test' | 'save' | 'send', fn: () => Promise<void>) => {
    setTouched(true);
    if (!ok) return;
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      toast.apiError(e);
    } finally {
      setBusy(null);
    }
  };

  const sendLabel = d.sendMode === 'now' ? 'Send now' : 'Schedule';
  const quietNote =
    count.data && d.sendMode === 'now' && count.data.quiet > 0
      ? `${formatNumber(count.data.quiet)} of them are in quiet hours (${count.data.quietHours.start}–${count.data.quietHours.end} their time) and get it at ${count.data.quietHours.end}.`
      : null;

  return (
    <SectionCard title={saved ? 'Edit announcement' : 'New announcement'} className="min-w-0">
      <Input
        label="Title"
        hint={`${d.title.length} / ${TITLE_MAX}`}
        value={d.title}
        maxLength={TITLE_MAX}
        error={err('title')}
        onChange={(e) => set({ title: e.target.value })}
      />
      <Textarea
        label="Message"
        rows={3}
        value={d.body}
        maxLength={BODY_MAX}
        error={err('body')}
        onChange={(e) => set({ body: e.target.value })}
      />
      <Select
        label="Audience"
        value={d.audience}
        onChange={(e) => set({ audience: e.target.value as Audience })}
        options={AUDIENCES}
        hint={
          d.audience === 'country' && !d.countries.length
            ? undefined
            : count.data
              ? `${formatNumber(count.data.targeted)} ${count.data.targeted === 1 ? 'person' : 'people'} with push on`
              : 'Counting…'
        }
      />
      {d.audience === 'country' ? (
        <Input
          label="Countries"
          hint="Two-letter codes, comma separated, e.g. DE, AT, CH"
          value={countries}
          error={err('countries')}
          onChange={(e) => {
            setCountries(e.target.value);
            set({
              countries: e.target.value
                .split(',')
                .map((c) => c.trim().toUpperCase())
                .filter((c) => /^[A-Z]{2}$/.test(c)),
            });
          }}
        />
      ) : null}
      <Select
        label="Opens"
        value={link.kind}
        onChange={(e) => set({ deepLink: e.target.value || null })}
        options={OPENS.map((o) => ({ value: o.value, label: o.label }))}
        error={err('deepLink')}
      />
      {link.kind === 'session' || link.kind === 'program' ? (
        <Select
          label={link.kind === 'session' ? 'Session' : 'Program'}
          value={link.id}
          placeholder={targets.isPending ? 'Loading…' : `Choose a ${link.kind}`}
          onChange={(e) => set({ deepLink: e.target.value ? `wehum://${link.kind}/${e.target.value}` : link.kind })}
          options={(targets.data ?? []).map((t) => ({ value: t.id, label: t.title }))}
        />
      ) : null}
      <Select
        label="When"
        value={d.sendMode}
        onChange={(e) => set({ sendMode: e.target.value as Draft['sendMode'] })}
        options={SEND_MODES}
      />
      {d.sendMode === 'scheduled' ? (
        <Input
          type="datetime-local"
          label="Send at (your time)"
          value={toLocalInput(d.sendAt)}
          error={err('sendAt')}
          onChange={(e) => set({ sendAt: fromLocalInput(e.target.value) })}
        />
      ) : null}
      {quietNote ? (
        <p role="status" className="rounded-tile bg-warning/15 px-3.5 py-2.5 text-sm text-warning">
          {quietNote}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2.5">
        <Button
          variant="outline"
          loading={busy === 'test'}
          disabled={!!busy}
          onClick={() =>
            void run('test', async () => {
              const id = await persist();
              await pushApi.test(id, admin!.email);
              toast.success('Test sent', `To the app signed in as ${admin!.email}.`);
            })
          }
        >
          Send test to me
        </Button>
        <Button
          variant="outline"
          loading={busy === 'save'}
          disabled={!!busy}
          onClick={() =>
            void run('save', async () => {
              await persist();
              toast.success('Draft saved');
            })
          }
        >
          Save draft
        </Button>
        {canSend ? (
          <Button
            loading={busy === 'send'}
            disabled={!!busy}
            onClick={() => {
              setTouched(true);
              if (ok) setConfirm(true);
            }}
          >
            {sendLabel}
          </Button>
        ) : (
          <p className="self-center text-sm text-text-muted">An owner or admin sends it.</p>
        )}
        {saved ? (
          <Button variant="ghost" disabled={!!busy} onClick={reset}>
            New announcement
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={d.sendMode === 'now' ? 'Send this now?' : 'Schedule this announcement?'}
        description={`“${d.title}” goes to ${audienceLabel(d.audience).toLowerCase()}${count.data ? ` (${formatNumber(count.data.targeted)} people)` : ''}${
          d.sendMode === 'scheduled' && d.sendAt
            ? ` on ${new Date(d.sendAt).toLocaleString()}`
            : d.sendMode === 'user_reminder_time'
              ? ' at each person’s reminder time'
              : ''
        }. Announcements are for real news only.`}
        confirmLabel={sendLabel}
        loading={busy === 'send'}
        onConfirm={() =>
          void run('send', async () => {
            const id = await persist();
            const r = await pushApi.send(id);
            setConfirm(false);
            toast.success(
              r.status === 'scheduled' ? 'Scheduled' : 'Sending',
              `${formatNumber(r.targeted)} people${r.quietCount ? `, ${formatNumber(r.quietCount)} get it after quiet hours` : ''}.`,
            );
            reset();
          })
        }
      />
    </SectionCard>
  );
}

function LockScreen({ title, body }: { title: string; body: string }) {
  return (
    <PhonePreview caption="Lock screen preview" className="shrink-0">
      <p className="tabular mt-6 text-center text-[56px] font-bold leading-none">07:00</p>
      <div className="mt-4 flex flex-col gap-1 rounded-tile bg-surface p-3.5">
        <span className="flex items-center justify-between text-xs text-text-muted">
          <span className="font-bold uppercase tracking-wide">WeHum</span>
          <span>now</span>
        </span>
        <span className="text-body font-semibold">{title || 'Title'}</span>
        <span className="text-sm text-text-soft">{body || 'Your message shows here.'}</span>
      </div>
    </PhonePreview>
  );
}

function Automatic() {
  const auto = useAutomatic();
  const cache = usePushCache();
  const canEdit = useCan('settings.manage');
  const toggle = async (key: string, enabled: boolean) => {
    try {
      await pushApi.setAutomatic(key, { enabled });
      toast.success(`${AUTO_INFO[key]?.name ?? key} ${enabled ? 'on' : 'off'}`);
      cache.refresh();
    } catch (e) {
      toast.apiError(e);
    }
  };
  return (
    <SectionCard
      title="Automatic notifications"
      description="At most one nudge a day per person. Announcements below are for real news only, never a marketing blast."
    >
      {auto.isError ? (
        <ErrorState error={auto.error} onRetry={() => void auto.refetch()} />
      ) : auto.isPending ? (
        <SkeletonRows rows={4} label="Loading automatic notifications" />
      ) : (
        <div className="flex flex-col gap-3">
          {auto.data.map((a) => (
            <Switch
              key={a.key}
              label={AUTO_INFO[a.key]?.name ?? a.key}
              description={`${AUTO_INFO[a.key]?.info ?? ''} “${a.title}: ${a.body}”${a.delivered ? ` · ${formatNumber(a.delivered)} delivered, ${formatPercent(a.opened / a.delivered)} opened` : ''}`}
              checked={a.enabled}
              disabled={!canEdit}
              onCheckedChange={(on) => void toggle(a.key, on)}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

const STATUS: Record<Announcement['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'warning' },
  scheduled: { label: 'Scheduled', tone: 'teal' },
  sending: { label: 'Sending', tone: 'info' },
  sent: { label: 'Sent', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' },
};

function History({ onEdit }: { onEdit: (a: Announcement) => void }) {
  const list = useAnnouncements();
  const cache = usePushCache();
  const canSend = useCan('push.send');
  const [cancel, setCancel] = useState<Announcement | null>(null);
  const [busy, setBusy] = useState(false);
  useSocketEvent('notification:stats', cache.stats);
  const doCancel = async () => {
    setBusy(true);
    try {
      await pushApi.cancel(cancel!.id);
      toast.success('Cancelled');
      setCancel(null);
      cache.refresh();
    } catch (e) {
      toast.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <SectionCard title="Sent and planned">
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <SkeletonRows rows={3} label="Loading announcements" />
      ) : list.data.length === 0 ? (
        <p className="text-sm text-text-muted">No announcements yet.</p>
      ) : (
        <ul aria-label="Announcements" className="flex flex-col">
          {list.data.map((n) => {
            const when = n.sendAt ?? n.createdAt;
            return (
              <li key={n.id} className="flex items-center gap-3 border-t border-border py-3 first:border-t-0">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-semibold">{n.title}</span>
                  <span className="truncate text-xs text-text-muted">
                    {formatDate(when)} · {audienceLabel(n.audience)}
                    {n.delivered
                      ? ` · ${formatNumber(n.delivered)} delivered`
                      : n.targeted
                        ? ` · ${formatNumber(n.targeted)} targeted`
                        : ''}
                  </span>
                </span>
                {n.status === 'sent' || (n.status === 'sending' && n.delivered) ? (
                  <StatusText tone="success">{n.delivered ? `${formatPercent(n.opened / n.delivered)} opened` : '—'}</StatusText>
                ) : (
                  <Badge tone={STATUS[n.status].tone} size="sm">
                    {STATUS[n.status].label}
                  </Badge>
                )}
                {n.status === 'draft' ? (
                  <Button size="sm" variant="outline" onClick={() => onEdit(n)}>
                    Edit
                  </Button>
                ) : null}
                {canSend && (n.status === 'scheduled' || n.status === 'sending') ? (
                  <Button size="sm" variant="outline" onClick={() => setCancel(n)}>
                    Cancel
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={!!cancel}
        onOpenChange={(o) => !o && setCancel(null)}
        title="Cancel this announcement?"
        description={cancel ? `“${cancel.title}” is not sent to anyone who has not got it yet.` : undefined}
        confirmLabel="Cancel announcement"
        cancelLabel="Keep it"
        danger
        loading={busy}
        onConfirm={() => void doCancel()}
      />
    </SectionCard>
  );
}

/** 18 Push notifications: compose with live audience count, lock-screen preview, automatic notifications and history. */
export function NotificationsPage() {
  const [params] = useSearchParams();
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [draft, setDraft] = useState<Draft>(() => {
    const a = params.get('audience');
    return AUDIENCES.some((x) => x.value === a) ? { ...EMPTY_DRAFT, audience: a as Audience } : EMPTY_DRAFT;
  });
  return (
    <>
      <PageHeader title="Push Notifications" subtitle="The app promises “no spam, no guilt”. Keep one-off sends rare." />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px_minmax(0,1fr)]">
        <Composer d={draft} setD={setDraft} editing={editing} onDone={() => setEditing(null)} />
        <LockScreen title={draft.title} body={draft.body} />
        <div className="flex min-w-0 flex-col gap-5">
          <Automatic />
          <History onEdit={setEditing} />
        </div>
      </div>
    </>
  );
}
