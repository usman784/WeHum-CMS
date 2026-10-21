import { useChangedByOthers } from '../../hooks/useEntity';
import { cn } from '../../lib/cn';
import { formatNumber } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Card, SectionCard } from '../../ui/Card';
import { ConflictDialog, type ConflictField } from '../../ui/ConflictDialog';
import { PageHeader } from '../../ui/PageHeader';
import { ListEditor } from '../../ui/ListEditor';
import { Input } from '../../ui/Input';
import { NumberInput } from '../../ui/NumberInput';
import { Select } from '../../ui/Select';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { TimeInput } from '../../ui/TimeInput';
import { toast } from '../../ui/Toast';
import { useConfigForm } from '../config/useConfigForm';
import { Switch } from '../../ui/Switch';
import {
  dayLabel,
  GLOBAL_LOBBY_OPEN,
  GLOBAL_REMINDER,
  groupApi,
  groupProblem,
  LENGTHS,
  LOBBY_OPEN,
  REMINDER,
  sitHours,
  STEPS,
  useGroup,
  useGroupCache,
  WEEKDAYS,
  type GlobalValue,
  type GroupValue,
} from './api';

const FIELDS: ConflictField<GroupValue>[] = [
  { key: 'startUtc', label: 'Start time (UTC)' },
  { key: 'lengthMin', label: 'Length used for the group start', format: (v) => `${String(v)} min` },
  { key: 'lobbyOpenMin', label: 'Open the lobby before the start', format: (v) => `${String(v)} min` },
  { key: 'reminderMin', label: 'Reminder before the start', format: (v) => `${String(v)} min` },
  { key: 'cadence', label: 'How often', format: (v) => (v === 'hourly' ? 'Through the day' : 'Once a day') },
  {
    key: 'hourly',
    label: 'Hourly window (UTC)',
    format: (v) =>
      `${(v as GroupValue['hourly']).fromHourUtc}:00–${(v as GroupValue['hourly']).toHourUtc}:00 every ${(v as GroupValue['hourly']).stepHours} h · ${(v as GroupValue['hourly']).lengthMin} min`,
  },
  {
    key: 'global',
    label: 'Global meditation',
    format: (v) => {
      const g = v as GlobalValue;
      return g.enabled ? `${WEEKDAYS[g.weekday] ?? '?'} ${g.startUtc} UTC · ${g.lengthMin} min` : 'off';
    },
  },
  { key: 'intentions', label: 'Intentions', format: (v) => (v as string[]).join(' · ') || 'none' },
  { key: 'focus', label: "Today's focus", format: (v) => (v as GroupValue['focus']).title || 'hidden' },
  { key: 'doorsOpenSec', label: 'Doors open before the start', format: (v) => `${String(v)} s` },
];
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }));

const minutes = (list: number[], current: number) =>
  [...new Set([...list, current])].sort((a, b) => a - b).map((n) => ({ value: String(n), label: `${n} min` }));

const GRID = 'grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_1fr_1fr] items-center gap-3';

/** 13 Group meditation: one start time for the Meditation of the Day, the lobby and the group history. */
export function GroupMeditationPage() {
  const { data, isPending, error, refetch } = useGroup();
  const cache = useGroupCache();
  const { change, dismiss } = useChangedByOthers('config', 'group');
  const form = useConfigForm<GroupValue>({
    doc: data,
    put: groupApi.save,
    onSaved: (doc) => {
      cache.saved(doc);
      dismiss();
      toast.success('Group meditation saved');
    },
    onError: (e) => toast.apiError(e, 'Could not save the group meditation.'),
  });
  const v = form.value;
  const problem = v ? groupProblem(v) : null;

  return (
    <>
      <PageHeader
        title="Group meditation"
        subtitle="Group sits happen through the day (for example every 4 hours). The Global meditation is once a week, with everyone at the same time. Both play the Meditation of the Day."
        actions={
          <Button onClick={form.save} loading={form.saving} disabled={!form.dirty || !!problem}>
            Save
          </Button>
        }
      />
      {change && !form.dirty ? (
        <p role="status" className="rounded-btn bg-info px-4 py-2.5 text-body text-info-text">
          {change.by?.name ?? 'Someone'} saved new group settings. They are shown below.
        </p>
      ) : null}
      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending || !v ? (
        <SkeletonRows rows={4} label="Loading group meditation" />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-5">
            <SectionCard title="Global meditation" size="h3">
              <Switch
                checked={v.global.enabled}
                onCheckedChange={(enabled) => form.edit({ global: { ...v.global, enabled } })}
                label="Global meditation"
                description="Once a week, everyone sits together at the same time. It has its own card, lobby and reminder in the app."
              />
              {v.global.enabled ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Name in the app"
                    value={v.global.title}
                    maxLength={40}
                    onChange={(e) => form.edit({ global: { ...v.global, title: e.target.value } })}
                  />
                  <Select
                    label="Day of the week"
                    value={String(v.global.weekday)}
                    onChange={(e) => form.edit({ global: { ...v.global, weekday: Number(e.target.value) } })}
                    options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))}
                  />
                  <TimeInput
                    label="Time of the Global meditation"
                    value={v.global.startUtc}
                    onChange={(startUtc) => form.edit({ global: { ...v.global, startUtc } })}
                    error={problem && problem.includes('Global') ? problem : undefined}
                  />
                  <Select
                    label="Global meditation length"
                    value={String(v.global.lengthMin)}
                    onChange={(e) => form.edit({ global: { ...v.global, lengthMin: Number(e.target.value) as GlobalValue['lengthMin'] } })}
                    options={LENGTHS.map((n) => ({ value: String(n), label: `${n} min` }))}
                  />
                  <Select
                    label="Global: open the lobby before"
                    value={String(v.global.lobbyOpenMin)}
                    onChange={(e) => form.edit({ global: { ...v.global, lobbyOpenMin: Number(e.target.value) } })}
                    options={minutes(GLOBAL_LOBBY_OPEN, v.global.lobbyOpenMin)}
                  />
                  <Select
                    label="Global: reminder before"
                    value={String(v.global.reminderMin)}
                    onChange={(e) => form.edit({ global: { ...v.global, reminderMin: Number(e.target.value) } })}
                    options={minutes(GLOBAL_REMINDER, v.global.reminderMin)}
                  />
                  <p className="text-sm text-text-muted sm:col-span-2">
                    Everyone sees it in their own time. The reminder goes to people who have group reminders switched on, and to those who
                    tapped “Remind me”.
                  </p>
                </div>
              ) : null}
            </SectionCard>

            <SectionCard title="Group meditation: how often" size="h3">
              <Select
                label="Group sits"
                value={v.cadence}
                onChange={(e) => form.edit({ cadence: e.target.value as GroupValue['cadence'] })}
                options={[
                  { value: 'daily', label: 'Once a day, at the start time below' },
                  { value: 'hourly', label: 'Through the day, every few hours' },
                ]}
              />
              {v.cadence === 'hourly' ? (
                <div className="grid gap-4 sm:grid-cols-4">
                  <Select
                    label="First hour (UTC)"
                    value={String(v.hourly.fromHourUtc)}
                    onChange={(e) => form.edit({ hourly: { ...v.hourly, fromHourUtc: Number(e.target.value) } })}
                    options={HOURS}
                  />
                  <Select
                    label="Last hour (UTC)"
                    value={String(v.hourly.toHourUtc)}
                    onChange={(e) => form.edit({ hourly: { ...v.hourly, toHourUtc: Number(e.target.value) } })}
                    options={HOURS}
                  />
                  <Select
                    label="Length"
                    value={String(v.hourly.lengthMin)}
                    onChange={(e) =>
                      form.edit({ hourly: { ...v.hourly, lengthMin: Number(e.target.value) as GroupValue['hourly']['lengthMin'] } })
                    }
                    options={LENGTHS.map((n) => ({ value: String(n), label: `${n} min` }))}
                  />
                  <Select
                    label="Every"
                    value={String(v.hourly.stepHours)}
                    onChange={(e) => form.edit({ hourly: { ...v.hourly, stepHours: Number(e.target.value) } })}
                    options={STEPS.map((n) => ({ value: String(n), label: n === 1 ? 'hour' : `${n} hours` }))}
                  />
                  {problem && problem.includes('last hour') ? (
                    <p role="alert" className="text-sm font-semibold text-danger-text sm:col-span-4">
                      {problem}
                    </p>
                  ) : null}
                  <p className="text-sm text-text-muted sm:col-span-4">
                    Sits at {sitHours(v.hourly).join(', ')} UTC. Each one plays the Meditation of the Day in this length.
                  </p>
                </div>
              ) : null}
            </SectionCard>

            {v.cadence === 'daily' ? (
              <SectionCard title="When the Meditation of the Day starts together" size="h3">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
                  <TimeInput
                    label="Start time"
                    value={v.startUtc}
                    onChange={(startUtc) => form.edit({ startUtc })}
                    error={problem && problem.includes('start time') ? problem : undefined}
                    className="sm:col-span-2"
                  />
                  <Select
                    label="Length used for the group start"
                    value={String(v.lengthMin)}
                    onChange={(e) => form.edit({ lengthMin: Number(e.target.value) as GroupValue['lengthMin'] })}
                    options={LENGTHS.map((n) => ({ value: String(n), label: `${n} min` }))}
                  />
                </div>
                <p className="text-sm text-text-muted">
                  Each person sees the start in their own time. Anyone can still begin the Meditation of the Day on their own at any time.
                  The time is fixed in UTC, so local times shift with daylight saving.
                </p>
              </SectionCard>
            ) : null}

            <Card padded={false} className="overflow-hidden">
              <div
                className={cn(GRID, 'border-b border-border px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.8px] text-text-faint')}
                aria-hidden
              >
                <span>Day</span>
                <span>Meditation of the day</span>
                <span>In the group</span>
                <span>On their own</span>
              </div>
              {data.history.length === 0 ? (
                <EmptyState
                  title="No group meditation yet"
                  description="Past days appear here with how many joined the group and how many meditated alone."
                />
              ) : (
                <ul aria-label="Group history">
                  {data.history.map((d) => (
                    <li key={d.date} className={cn(GRID, 'min-h-14 border-b border-border px-5 py-3 text-body last:border-b-0')}>
                      <span className="text-text-muted">{dayLabel(d.date)}</span>
                      <span className="truncate font-semibold">{d.title}</span>
                      <span className="tabular">{formatNumber(d.groupJoined)} meditated</span>
                      <span className="tabular text-text-muted">{formatNumber(d.soloCount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <SectionCard title="Lobby">
              <Select
                label="Open the lobby before the start"
                inline
                value={String(v.lobbyOpenMin)}
                onChange={(e) => form.edit({ lobbyOpenMin: Number(e.target.value) })}
                options={minutes(LOBBY_OPEN, v.lobbyOpenMin)}
              />
              <Select
                label="Reminder before the start"
                inline
                value={String(v.reminderMin)}
                onChange={(e) => form.edit({ reminderMin: Number(e.target.value) })}
                options={minutes(REMINDER, v.reminderMin)}
              />
              <p className="text-sm text-text-muted">Reminders go only to people who tapped “Remind me”.</p>
            </SectionCard>
            <SectionCard title="Before the sit" description="Shown on the lobby and the countdown screens.">
              <ListEditor
                label="Intentions"
                items={v.intentions}
                max={6}
                addLabel="Add an intention"
                placeholder="Calm under pressure"
                onChange={(intentions) => form.edit({ intentions })}
              />
              <Input
                label="Today's focus: title"
                value={v.focus.title}
                maxLength={60}
                onChange={(e) => form.edit({ focus: { ...v.focus, title: e.target.value } })}
              />
              <Input
                label="Summary"
                value={v.focus.summary}
                maxLength={120}
                onChange={(e) => form.edit({ focus: { ...v.focus, summary: e.target.value } })}
              />
              <Input
                label="Quote"
                value={v.focus.quote}
                maxLength={200}
                onChange={(e) => form.edit({ focus: { ...v.focus, quote: e.target.value } })}
              />
              <NumberInput
                label="Doors open before the start"
                unit="s"
                min={0}
                max={600}
                step={30}
                value={v.doorsOpenSec}
                onChange={(n) => n !== null && form.edit({ doorsOpenSec: n })}
              />
            </SectionCard>
          </div>
        </div>
      )}
      {form.conflict ? (
        <ConflictDialog
          open
          mine={form.conflict.mine}
          theirs={form.conflict.theirs.value}
          fields={FIELDS}
          by={change?.by?.name}
          saving={form.saving}
          onKeepMine={form.keepMine}
          onTakeTheirs={form.takeTheirs}
        />
      ) : null}
    </>
  );
}
