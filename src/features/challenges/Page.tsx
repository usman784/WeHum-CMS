import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { useRecentChanges } from '../../hooks/useEntity';
import { useCan } from '../../hooks/useRole';
import { useVersionedSave } from '../../hooks/useVersionedSave';
import { cn } from '../../lib/cn';
import { applyFieldErrors } from '../../lib/form-errors';
import { formatNumber, formatPercent } from '../../lib/format';
import { zodForm } from '../../lib/zod-form';
import { Badge, StatusText } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ConflictDialog, type ConflictField } from '../../ui/ConflictDialog';
import { Input } from '../../ui/Input';
import { PageHeader } from '../../ui/PageHeader';
import { Select } from '../../ui/Select';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { Switch } from '../../ui/Switch';
import { toast } from '../../ui/Toast';
import {
  challengeApi, challengeFinishRate, challengeSchema, COUNTS, useChallengeCache, useChallenges, useChallengesFlag,
  type Challenge, type ChallengeInput, type ChallengeValues,
} from './api'; // prettier-ignore

const GRID = 'grid grid-cols-[minmax(0,2fr)_0.7fr_minmax(0,1.4fr)_1fr_1fr_0.9fr] items-center gap-3';
const STATUS: Record<Challenge['status'], { label: string; tone: 'success' | 'warning' | 'teal' | 'muted' }> = {
  live: { label: 'Live', tone: 'success' },
  draft: { label: 'Draft', tone: 'warning' },
  scheduled: { label: 'Scheduled', tone: 'teal' },
  archived: { label: 'Ended', tone: 'muted' },
};
const FIELDS: ConflictField<Challenge>[] = [
  { key: 'name', label: 'Name' },
  { key: 'days', label: 'Length in days' },
  { key: 'counts', label: 'What counts as a day', format: (v) => COUNTS.find((c) => c.value === v)?.short ?? String(v) },
  { key: 'minMinutes', label: 'Shortest meditation that counts (min)' },
  { key: 'membersOnly', label: 'Members only' },
  { key: 'showOnYou', label: 'Show on the You tab' },
];
const blank: ChallengeInput = { name: '', days: 7, counts: 'any', minMinutes: 3, membersOnly: true, showOnYou: true };
const toForm = (c: Challenge): ChallengeInput => ({
  name: c.name,
  days: c.days,
  counts: c.counts,
  minMinutes: c.minMinutes,
  membersOnly: c.membersOnly,
  showOnYou: c.showOnYou,
});

function ChallengeEditor({ challenge, onCreated }: { challenge: Challenge | null; onCreated: (c: Challenge) => void }) {
  const cache = useChallengeCache();
  const { register, handleSubmit, reset, setValue, watch, setError, formState } = useForm<ChallengeInput, unknown, ChallengeValues>({
    resolver: zodForm(challengeSchema),
    defaultValues: challenge ? toForm(challenge) : blank,
  });
  useEffect(() => reset(challenge ? toForm(challenge) : blank), [challenge?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const minMinutes = Number(watch('minMinutes')) || 3;
  const counts = watch('counts');

  const onError = (e: unknown) => {
    if (!applyFieldErrors(e, setError, ['name', 'days', 'minMinutes'])) toast.apiError(e, 'Could not save the challenge.');
  };
  const edit = useVersionedSave<Challenge, Partial<ChallengeValues> & { status?: Challenge['status'] }>({
    save: (v, version) => challengeApi.update(challenge!.id, v, version),
    onSaved: (row, v) => {
      cache.saved(row);
      toast.success(v.status === 'live' ? 'Challenge is live' : v.status ? 'Challenge updated' : 'Challenge saved');
    },
    onError,
  });

  const submit = handleSubmit(async (v) => {
    if (challenge) return edit.save(v, challenge.version);
    setBusy(true);
    try {
      const row = await challengeApi.create(v);
      cache.added(row);
      toast.success('Challenge created as a draft');
      onCreated(row);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  });

  const e = formState.errors;
  return (
    <aside aria-label={challenge ? 'Edit challenge' : 'New challenge'} className="rounded-card border border-border bg-surface p-5">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-h3">{challenge ? challenge.name : 'New challenge'}</h2>
          {challenge ? <StatusText tone={STATUS[challenge.status].tone}>{STATUS[challenge.status].label}</StatusText> : null}
        </div>
        <Input label="Name" size="sm" error={e.name?.message} {...register('name')} />
        <Input label="Length in days" size="sm" inputMode="numeric" error={e.days?.message} {...register('days')} />
        <Select
          label="What counts as a day"
          size="sm"
          options={COUNTS.map((c) => ({ value: c.value, label: c.label(minMinutes) }))}
          {...register('counts')}
        />
        {counts === 'any' ? (
          <Input
            label="Shortest meditation that counts"
            hint="minutes"
            size="sm"
            inputMode="numeric"
            error={e.minMinutes?.message}
            {...register('minMinutes')}
          />
        ) : null}
        <Switch
          label="Members only"
          checked={watch('membersOnly')}
          onCheckedChange={(v) => setValue('membersOnly', v, { shouldDirty: true })}
        />
        <Switch
          label="Show on the You tab"
          checked={watch('showOnYou')}
          onCheckedChange={(v) => setValue('showOnYou', v, { shouldDirty: true })}
        />
        <p className="text-xs text-text-faint">Missing a day never resets progress. No streaks, no grace days.</p>
        <div className="flex gap-2.5">
          {challenge && challenge.status !== 'live' ? (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={edit.saving}
              onClick={() => edit.save({ status: 'live' }, challenge.version)}
            >
              Make live
            </Button>
          ) : null}
          {challenge?.status === 'live' ? (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={edit.saving}
              onClick={() => edit.save({ status: 'archived' }, challenge.version)}
            >
              End challenge
            </Button>
          ) : null}
          <Button type="submit" className="flex-1" loading={busy || edit.saving}>
            {challenge ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
      {challenge && edit.conflict ? (
        <ConflictDialog
          open
          mine={edit.conflict.mine as Partial<Challenge>}
          theirs={edit.conflict.theirs}
          fields={[...FIELDS, { key: 'status', label: 'Status', format: (v) => STATUS[v as Challenge['status']]?.label ?? String(v) }]}
          saving={edit.saving}
          onKeepMine={edit.keepMine}
          onTakeTheirs={() =>
            edit.takeTheirs((theirs) => {
              cache.saved(theirs);
              reset(toForm(theirs));
            })
          }
        />
      ) : null}
    </aside>
  );
}

/** 06 Challenges (coming soon): habit challenges. The app shows them only while the feature flag is on. */
export function ChallengesPage() {
  const { data, isPending, error, refetch } = useChallenges();
  const canSettings = useCan('settings.manage');
  const flag = useChallengesFlag(canSettings);
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const recent = useRecentChanges('challenge');

  useEffect(() => {
    if (!data || selected === 'new') return;
    if (!selected || !data.some((c) => c.id === selected)) setSelected(data[0]?.id ?? 'new');
  }, [data, selected]);
  const current = data?.find((c) => c.id === selected) ?? null;

  return (
    <>
      <PageHeader
        title="Challenges"
        badge={<Badge caps>Coming soon</Badge>}
        subtitle="Habit challenges: any meditation counts, once a day. Unlike programs, they need no new content."
        actions={
          <Button onClick={() => setSelected('new')}>
            <Plus size={16} aria-hidden />
            New challenge
          </Button>
        }
      />
      <p role="status" className="rounded-btn bg-info px-4 py-2.5 text-body text-info-text">
        {flag.data === true ? (
          'The Challenges feature is switched on: live challenges show in the app.'
        ) : (
          <>
            Challenges are hidden in the app while the “Challenges” feature is switched off. You can prepare them here.{' '}
            {canSettings ? (
              <Link to="/settings" className="font-semibold underline underline-offset-2">
                Open Settings
              </Link>
            ) : (
              'An owner or admin switches it on in Settings.'
            )}
          </>
        )}
      </p>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card padded={false} className="overflow-hidden">
          <div
            className={cn(GRID, 'border-b border-border px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.8px] text-text-faint')}
            aria-hidden
          >
            <span>Challenge</span>
            <span>Days</span>
            <span>What counts</span>
            <span>In it now</span>
            <span>Finish rate</span>
            <span>Status</span>
          </div>
          {error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : isPending ? (
            <SkeletonRows rows={3} label="Loading challenges" />
          ) : data.length === 0 ? (
            <EmptyState title="No challenges yet" description="Create one now and switch the feature on when you are ready." />
          ) : (
            <ul aria-label="Challenges">
              {data.map((c) => {
                const rate = challengeFinishRate(c);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-pressed={c.id === selected}
                      onClick={() => setSelected(c.id)}
                      className={cn(
                        GRID,
                        'min-h-16 w-full border-b border-border px-5 text-left text-body transition-colors duration-700',
                        c.id === selected ? 'bg-ember/10' : 'hover:bg-surface-alt/60',
                        recent.has(c.id) && 'bg-ember/10',
                      )}
                    >
                      <span className="truncate font-semibold">{c.name}</span>
                      <span className="tabular">{c.days}</span>
                      <span className="truncate text-text-muted">{COUNTS.find((x) => x.value === c.counts)?.short}</span>
                      <span className="tabular">{c.participants ? formatNumber(c.participants) : '—'}</span>
                      <span className="tabular">{rate === null ? '—' : formatPercent(rate)}</span>
                      <StatusText tone={STATUS[c.status].tone} className="text-xs font-bold">
                        {STATUS[c.status].label}
                      </StatusText>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        {isPending || selected === null ? null : (
          <ChallengeEditor key={selected ?? 'none'} challenge={current} onCreated={(c) => setSelected(c.id)} />
        )}
      </div>
    </>
  );
}
