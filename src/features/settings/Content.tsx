import { Plus, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useChangedByOthers } from '../../hooks/useEntity';
import { Button } from '../../ui/Button';
import { SectionCard } from '../../ui/Card';
import { IconButton } from '../../ui/IconButton';
import { Input, Textarea } from '../../ui/Input';
import { ListEditor } from '../../ui/ListEditor';
import { NumberInput } from '../../ui/NumberInput';
import { Select } from '../../ui/Select';
import { Switch } from '../../ui/Switch';
import { toast } from '../../ui/Toast';
import { useConfigForm } from '../config/useConfigForm';
import { ImagePicker } from '../../ui/ImagePicker';
import { useMediaUpload } from '../media/api';
import {
  settingsApi,
  useAllConfig,
  useSettingsCache,
  type BrandingConfig,
  type ConfigKey,
  type PushConfig,
  type NewsletterConfig,
  newsletterApi,
  type CrisisConfig,
  type CrisisLine,
  type CrisisRegion,
  type DownloadsConfig,
  type SilenceConfig,
  type SitTimesConfig,
} from './api';

/** One settings document with its own Save button (these cards are saved on their own, not with the page's Save). */
function useCard<T extends object>(key: ConfigKey, label: string) {
  const config = useAllConfig();
  const cache = useSettingsCache();
  const change = useChangedByOthers('config', key);
  const form = useConfigForm<T>({
    doc: config.data?.[key] as never,
    put: (v, version) => settingsApi.saveConfig(key, v, version),
    onSaved: (doc) => {
      cache.configSaved(key, doc);
      change.dismiss();
      toast.success(`${label} saved`);
    },
    onError: (e) => toast.apiError(e, `Could not save ${label.toLowerCase()}.`),
  });
  return { form, loading: config.isPending, others: change.change && !form.dirty ? change.change : null };
}

function SaveBar({
  form,
  invalid,
}: {
  form: { dirty: boolean; saving: boolean; save: () => void; discard: () => void };
  invalid?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2">
      {form.dirty ? (
        <Button variant="ghost" size="sm" onClick={form.discard}>
          Discard
        </Button>
      ) : null}
      <Button size="sm" loading={form.saving} disabled={!form.dirty || invalid} onClick={form.save}>
        Save
      </Button>
    </div>
  );
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function SitTimes() {
  const { form, loading, others } = useCard<SitTimesConfig>('sitTimes', 'Sit times');
  const v = form.value;
  if (loading || !v) return null;
  const set = (i: number, patch: Partial<SitTimesConfig['blocks'][number]>) =>
    form.edit({ blocks: v.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const invalid = v.blocks.some((b) => !HHMM.test(b.time) || !b.label.trim());
  return (
    <SectionCard title="Sit times" description="The “Suggested prime blocks” on the sit-time screen (local time on each phone). Up to six.">
      {others ? (
        <p role="status" className="text-sm text-info-text">
          {others.by?.name ?? 'Someone'} saved new sit times.
        </p>
      ) : null}
      <ul aria-label="Sit time blocks" className="flex flex-col gap-2.5">
        {v.blocks.map((b, i) => (
          <li key={i} className="grid grid-cols-[168px_minmax(0,1fr)_auto] items-end gap-3">
            <Input label="Time" type="time" value={b.time} onChange={(e) => set(i, { time: e.target.value })} />
            <Input label="Name" value={b.label} maxLength={30} onChange={(e) => set(i, { label: e.target.value })} />
            <IconButton
              label={`Remove ${b.label || 'block'}`}
              onClick={() => form.edit({ blocks: v.blocks.filter((_, j) => j !== i) })}
              disabled={v.blocks.length <= 1}
            >
              <Trash2 size={16} aria-hidden />
            </IconButton>
          </li>
        ))}
      </ul>
      {v.blocks.length < 6 ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => form.edit({ blocks: [...v.blocks, { time: '08:00', label: '' }] })}
        >
          <Plus size={14} aria-hidden /> Add a block
        </Button>
      ) : null}
      <SaveBar form={form} invalid={invalid} />
    </SectionCard>
  );
}

function Downloads() {
  const { form, loading } = useCard<DownloadsConfig>('downloads', 'Downloads');
  const v = form.value;
  if (loading || !v) return null;
  return (
    <SectionCard
      title="Downloads"
      description="The storage allowance the Downloads manager shows (it is a display limit; phones decide the real space)."
    >
      <NumberInput
        label="Storage quota"
        unit="MB"
        min={100}
        max={20000}
        step={100}
        value={v.quotaMb}
        onChange={(n) => n && form.edit({ quotaMb: n })}
      />
      <SaveBar form={form} />
    </SectionCard>
  );
}

/** App name, tagline and logo: the app and this CMS read them on launch. The launcher icon is part of the store build. */
export function Branding() {
  const { form, loading } = useCard<BrandingConfig>('branding', 'Branding');
  const v = form.value;
  const logo = useMediaUpload({ kind: 'image', mediaId: v?.logoMediaId ?? null, onUploaded: (id) => form.edit({ logoMediaId: id }) });
  if (loading || !v) return null;
  return (
    <SectionCard
      title="Branding"
      description="The name and logo people see inside the app and in this admin. The home-screen icon is set with each store release."
    >
      <div className="flex flex-wrap items-start gap-5">
        <div className="w-28">
          <ImagePicker
            label="Logo"
            minSize={256}
            variant="avatar"
            value={logo.media?.previewUrl ?? null}
            onChange={logo.start}
            disabled={logo.busy}
          />
        </div>
        <div className="flex min-w-[240px] flex-1 flex-col gap-3">
          <Input label="App name" maxLength={30} value={v.appName} onChange={(e) => form.edit({ appName: e.target.value })} />
          <Input
            label="Tagline"
            hint="shown under the name on the welcome screen"
            maxLength={80}
            value={v.tagline}
            onChange={(e) => form.edit({ tagline: e.target.value })}
          />
        </div>
      </div>
      {logo.state.status === 'error' ? (
        <p role="alert" className="text-sm text-danger-text">
          {logo.state.message}
        </p>
      ) : null}
      {v.logoMediaId ? (
        <Button variant="ghost" size="sm" onClick={() => form.edit({ logoMediaId: null })}>
          Use the default logo
        </Button>
      ) : null}
      <SaveBar form={form} invalid={!v.appName.trim() || logo.busy} />
    </SectionCard>
  );
}

/** How many pushes one person can get per day, across reminders, daily messages, group warnings and announcements. */
export function PushLimit() {
  const { form, loading } = useCard<PushConfig>('push', 'Notification limit');
  const v = form.value;
  if (loading || !v) return null;
  return (
    <SectionCard
      title="Notification limit"
      description="Reminders, daily messages, group warnings and announcements together. Anything beyond the limit is held back, so nobody is flooded."
    >
      <NumberInput
        label="Pushes per person per day"
        min={1}
        max={10}
        step={1}
        value={v.maxPerDay}
        onChange={(n) => n && form.edit({ maxPerDay: n })}
      />
      <SaveBar form={form} />
    </SectionCard>
  );
}

/** E-mail list: verified addresses are added to Mailchimp by the server, once each (also everyone who signed up earlier). */
export function Newsletter() {
  const { form, loading } = useCard<NewsletterConfig>('newsletter', 'Newsletter');
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['admin', 'newsletter-status'], queryFn: newsletterApi.status, refetchInterval: 30_000 });
  const [busy, setBusy] = useState(false);
  const [tagsText, setTagsText] = useState<string | null>(null); // what is typed, so commas and spaces are not eaten while typing
  const v = form.value;
  if (loading || !v) return null;
  const s = status.data;
  const sync = async () => {
    setBusy(true);
    try {
      const r = await newsletterApi.syncNow();
      qc.setQueryData(['admin', 'newsletter-status'], r);
      toast.success(r.added ? `${r.added} address${r.added === 1 ? '' : 'es'} added to the list` : 'Nothing new to add');
    } catch {
      toast.error('Could not reach the newsletter service. Try again in a minute.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <SectionCard
      title="Newsletter"
      description="Verified e-mail addresses are added to your Mailchimp list by the server (never from a mail account), once each, with the first name. People who signed up before are added too."
    >
      {s && !s.keyConfigured ? (
        <p role="status" className="text-sm text-info-text">
          The Mailchimp API key is not set on the server yet (MAILCHIMP_API_KEY, like xxxxxxxx-us21). Nothing is sent until it is.
        </p>
      ) : null}
      <Switch
        label="Send addresses to the newsletter list"
        description="Off: nothing leaves the server."
        checked={v.enabled}
        onCheckedChange={(on) => form.edit({ enabled: on })}
      />
      <Input
        label="Audience (list) ID"
        hint="Mailchimp → Audience → Settings → Audience name and defaults"
        maxLength={40}
        value={v.listId}
        onChange={(e) => form.edit({ listId: e.target.value.trim() })}
      />
      <Switch
        label="Ask people to confirm (double opt-in)"
        description="Mailchimp sends a confirmation e-mail first. Recommended in the EU."
        checked={v.doubleOptIn}
        onCheckedChange={(on) => form.edit({ doubleOptIn: on })}
      />
      <Input
        label="Tags"
        hint="comma separated, added to every address"
        value={tagsText ?? v.tags.join(', ')}
        onChange={(e) => {
          setTagsText(e.target.value);
          form.edit({
            tags: e.target.value
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
              .slice(0, 10),
          });
        }}
      />
      {s ? (
        <p className="text-sm text-text-muted" aria-label="Newsletter status">
          <span className="font-semibold text-body">{s.synced}</span> on the list ·{' '}
          <span className="font-semibold text-body">{s.pending}</span> waiting · <span className="font-semibold text-body">{s.failed}</span>{' '}
          refused by the list
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <SaveBar form={form} invalid={v.enabled && !v.listId.trim()} />
        <Button variant="outline" size="sm" onClick={sync} disabled={busy || !s?.keyConfigured || !s.enabled}>
          {busy ? 'Adding…' : 'Add waiting addresses now'}
        </Button>
      </div>
    </SectionCard>
  );
}

const DURATIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120];

function Silence() {
  const { form, loading } = useCard<SilenceConfig>('silence', 'Silence Room');
  const v = form.value;
  if (loading || !v) return null;
  const has = (n: number) => v.durations.includes(n);
  const toggle = (n: number) =>
    form.edit({
      durations: has(n) ? v.durations.filter((d) => d !== n) : [...v.durations, n].sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b)),
    });
  return (
    <SectionCard title="Silence Room" description="Durations offered on the setup screen, the breathing cue and the “+ minutes” button.">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm font-semibold text-text-soft">Durations</legend>
        {[...DURATIONS, 0].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={has(n)}
            onClick={() => toggle(n)}
            className={`h-10 rounded-full border px-4 text-body font-semibold ${has(n) ? 'border-ember bg-ember/10 text-ember-text' : 'border-border-strong text-text-muted'}`}
          >
            {n === 0 ? 'Open-ended' : `${n} min`}
          </button>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberInput
          label="Breathe in"
          unit="s"
          min={1}
          max={15}
          value={v.cadence.inhaleSec}
          onChange={(n) => n && form.edit({ cadence: { ...v.cadence, inhaleSec: n } })}
        />
        <NumberInput
          label="Breathe out"
          unit="s"
          min={1}
          max={15}
          value={v.cadence.exhaleSec}
          onChange={(n) => n && form.edit({ cadence: { ...v.cadence, exhaleSec: n } })}
        />
        <NumberInput
          label="“Extend” adds"
          unit="min"
          min={1}
          max={30}
          value={v.extendMin}
          onChange={(n) => n && form.edit({ extendMin: n })}
        />
      </div>
      <SaveBar form={form} invalid={v.durations.length === 0} />
    </SectionCard>
  );
}

const PHONE = /^[+\d][\d ]{1,19}$/;

function RegionEditor({ region, onChange, onRemove }: { region: CrisisRegion; onChange: (r: CrisisRegion) => void; onRemove: () => void }) {
  const setLine = (i: number, patch: Partial<CrisisLine>) =>
    onChange({ ...region, lines: region.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-[100px_minmax(0,1fr)_auto] sm:items-end">
        <Input
          label="Code"
          value={region.code}
          maxLength={2}
          onChange={(e) => onChange({ ...region, code: e.target.value.toUpperCase() })}
        />
        <Input label="Region name" value={region.name} maxLength={60} onChange={(e) => onChange({ ...region, name: e.target.value })} />
        <IconButton label={`Remove region ${region.name || region.code}`} variant="danger" onClick={onRemove}>
          <Trash2 size={16} aria-hidden />
        </IconButton>
      </div>
      <Input
        label="Countries"
        hint="ISO codes, comma separated (US, CA)"
        value={region.countries.join(', ')}
        onChange={(e) =>
          onChange({
            ...region,
            countries: e.target.value
              .split(',')
              .map((c) => c.trim().toUpperCase())
              .filter(Boolean),
          })
        }
      />
      <ul className="flex flex-col gap-3" aria-label={`${region.name} lines`}>
        {region.lines.map((l, i) => (
          <li key={l.id + i} className="flex flex-col gap-2.5 rounded-input bg-input p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Line name" value={l.name} maxLength={80} onChange={(e) => setLine(i, { name: e.target.value })} />
              <Input
                label="Kind"
                hint="e.g. Voice & SMS"
                value={l.kind}
                maxLength={40}
                onChange={(e) => setLine(i, { kind: e.target.value })}
              />
            </div>
            <Textarea
              label="Description"
              rows={2}
              maxLength={240}
              value={l.description}
              onChange={(e) => setLine(i, { description: e.target.value })}
            />
            {l.actions.map((a, k) => (
              <div key={k} className="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] gap-2">
                <Select
                  label="Action"
                  value={a.type}
                  onChange={(e) =>
                    setLine(i, { actions: l.actions.map((x, j) => (j === k ? { ...x, type: e.target.value as 'call' | 'sms' } : x)) })
                  }
                  options={[
                    { value: 'call', label: 'Call' },
                    { value: 'sms', label: 'Text' },
                  ]}
                />
                <Input
                  label="Button text"
                  value={a.label}
                  maxLength={40}
                  onChange={(e) => setLine(i, { actions: l.actions.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)) })}
                />
                <Input
                  label="Number"
                  value={a.value}
                  error={PHONE.test(a.value) ? undefined : 'Digits only'}
                  onChange={(e) => setLine(i, { actions: l.actions.map((x, j) => (j === k ? { ...x, value: e.target.value.trim() } : x)) })}
                />
              </div>
            ))}
            <div className="flex gap-2">
              {l.actions.length < 3 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLine(i, { actions: [...l.actions, { type: 'call', label: 'Call', value: '' }] })}
                >
                  + Action
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => onChange({ ...region, lines: region.lines.filter((_, j) => j !== i) })}>
                Remove line
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {region.lines.length < 10 ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            onChange({
              ...region,
              lines: [
                ...region.lines,
                {
                  id: `line-${Date.now().toString(36)}`,
                  name: '',
                  kind: '',
                  description: '',
                  actions: [{ type: 'call', label: 'Call', value: '' }],
                },
              ],
            })
          }
        >
          <Plus size={14} aria-hidden /> Add a line
        </Button>
      ) : null}
    </div>
  );
}

function Crisis() {
  const { form, loading } = useCard<CrisisConfig>('crisis', 'Crisis directory');
  const [open, setOpen] = useState(false);
  const v = form.value;
  if (loading || !v) return null;
  const setRegion = (i: number, r: CrisisRegion) => form.edit({ regions: v.regions.map((x, j) => (j === i ? r : x)) });
  const invalid =
    !v.regions.some((r) => r.code === v.defaultRegion) ||
    v.regions.some(
      (r) =>
        !/^[A-Z]{2}$/.test(r.code) ||
        !r.name.trim() ||
        r.countries.length === 0 ||
        r.lines.some((l) => !l.name.trim() || l.actions.some((a) => !a.label.trim() || !PHONE.test(a.value))),
    ) ||
    v.international.some((x) => !x.country.trim() || !x.line.trim() || !PHONE.test(x.value));
  return (
    <SectionCard
      title="Crisis support directory"
      description="Shown from SoS (“Open directory”). The person sees their own region first and can switch. Check every number before saving."
      action={
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide' : 'Edit'}
        </Button>
      }
    >
      <p className="text-sm text-text-muted">
        {v.regions.length} regions · {v.regions.reduce((n, r) => n + r.lines.length, 0)} lines · {v.international.length} international
        numbers
      </p>
      {open ? (
        <>
          <Select
            label="Default region"
            hint="when the person's country is not listed"
            value={v.defaultRegion}
            onChange={(e) => form.edit({ defaultRegion: e.target.value })}
            options={v.regions.map((r) => ({ value: r.code, label: `${r.name} (${r.code})` }))}
          />
          {v.regions.map((r, i) => (
            <RegionEditor
              key={i}
              region={r}
              onChange={(x) => setRegion(i, x)}
              onRemove={() => form.edit({ regions: v.regions.filter((_, j) => j !== i) })}
            />
          ))}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => form.edit({ regions: [...v.regions, { code: '', name: '', countries: [], lines: [] }] })}
          >
            <Plus size={14} aria-hidden /> Add a region
          </Button>
          <h3 className="mt-2 text-h3">International numbers</h3>
          <ul className="flex flex-col gap-2.5" aria-label="International numbers">
            {v.international.map((x, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_130px_auto] items-end gap-2">
                <Input
                  label="Country"
                  value={x.country}
                  onChange={(e) =>
                    form.edit({ international: v.international.map((y, j) => (j === i ? { ...y, country: e.target.value } : y)) })
                  }
                />
                <Input
                  label="Line"
                  value={x.line}
                  onChange={(e) =>
                    form.edit({ international: v.international.map((y, j) => (j === i ? { ...y, line: e.target.value } : y)) })
                  }
                />
                <Input
                  label="Number"
                  value={x.value}
                  onChange={(e) =>
                    form.edit({ international: v.international.map((y, j) => (j === i ? { ...y, value: e.target.value.trim() } : y)) })
                  }
                />
                <IconButton
                  label={`Remove ${x.country}`}
                  onClick={() => form.edit({ international: v.international.filter((_, j) => j !== i) })}
                >
                  <Trash2 size={16} aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => form.edit({ international: [...v.international, { country: '', line: '', value: '' }] })}
          >
            <Plus size={14} aria-hidden /> Add a number
          </Button>
          <Textarea label="Grounding tip" rows={2} maxLength={400} value={v.tip} onChange={(e) => form.edit({ tip: e.target.value })} />
        </>
      ) : null}
      <SaveBar form={form} invalid={invalid} />
    </SectionCard>
  );
}

/** Settings → App content: sit times, downloads quota, Silence Room, crisis directory (owners and admins). */
export function AppContent() {
  return (
    <div className="flex flex-col gap-5">
      <Branding />
      <PushLimit />
      <Newsletter />
      <SitTimes />
      <Silence />
      <Downloads />
      <Crisis />
    </div>
  );
}

export { ListEditor };
