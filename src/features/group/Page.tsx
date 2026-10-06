import { useChangedByOthers } from '../../hooks/useEntity';
import { cn } from '../../lib/cn';
import { formatNumber } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Card, SectionCard } from '../../ui/Card';
import { ConflictDialog, type ConflictField } from '../../ui/ConflictDialog';
import { PageHeader } from '../../ui/PageHeader';
import { Select } from '../../ui/Select';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { TimeInput } from '../../ui/TimeInput';
import { toast } from '../../ui/Toast';
import { useConfigForm } from '../config/useConfigForm';
import { dayLabel, groupApi, groupProblem, LENGTHS, LOBBY_OPEN, REMINDER, useGroup, useGroupCache, type GroupValue } from './api';

const FIELDS: ConflictField<GroupValue>[] = [
  { key: 'startUtc', label: 'Start time (UTC)' },
  { key: 'lengthMin', label: 'Length used for the group start', format: (v) => `${String(v)} min` },
  { key: 'lobbyOpenMin', label: 'Open the lobby before the start', format: (v) => `${String(v)} min` },
  { key: 'reminderMin', label: 'Reminder before the start', format: (v) => `${String(v)} min` },
];

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
        subtitle="For now, a group meditation is simply the Meditation of the Day starting for everyone at the same moment. No separate schedule to plan."
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
            <SectionCard title="When the Meditation of the Day starts together" size="h3">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
                <TimeInput
                  label="Start time"
                  value={v.startUtc}
                  onChange={(startUtc) => form.edit({ startUtc })}
                  error={problem ?? undefined}
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
                Each person sees the start in their own time. Anyone can still begin the Meditation of the Day on their own at any time. The
                time is fixed in UTC, so local times shift with daylight saving.
              </p>
            </SectionCard>

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
            <section
              aria-label="More start times"
              className="flex flex-col gap-2.5 rounded-card border border-dashed border-border-strong p-5"
            >
              <h2 className="text-h3">More start times later</h2>
              <p className="text-sm text-text-muted">
                One start a day for now. More can be added when the app grows, without a separate schedule.
              </p>
              <Button variant="outline" disabled>
                + Add another start time
              </Button>
            </section>
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
