import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useChangedByOthers, useEditingPresence, useRecentChanges } from '../../hooks/useEntity';
import { isConflict } from '../../lib/api';
import { cn } from '../../lib/cn';
import { applyFieldErrors } from '../../lib/form-errors';
import { formatNumber, formatPercent } from '../../lib/format';
import { zodForm } from '../../lib/zod-form';
import { Badge, StatusText } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card, SectionCard } from '../../ui/Card';
import { ConfirmDialog, Dialog } from '../../ui/Dialog';
import { DragList } from '../../ui/DragList';
import { IconButton } from '../../ui/IconButton';
import { Input, Textarea } from '../../ui/Input';
import { PageHeader } from '../../ui/PageHeader';
import { Select } from '../../ui/Select';
import { Skeleton } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { toast } from '../../ui/Toast';
import { Tooltip } from '../../ui/Tooltip';
import { lengthLabel, STATUS } from '../sessions/display';
import { SessionPicker } from '../sessions/SessionPicker';
import { useThemes } from '../themes/api';
import {
  finishRate, programApi, programBlocker, programSchema, totalMinutes, UNLOCK_RULES, useProgramCache, usePrograms,
  type DayDraft, type Program, type ProgramInput, type ProgramValues,
} from './api'; // prettier-ignore

const ACCESS = [
  { value: 'premium', label: 'Premium' },
  { value: 'free', label: 'Free' },
];
const toForm = (p: Program): ProgramInput => ({
  title: p.title,
  description: p.description ?? '',
  access: p.access,
  unlockRule: p.unlockRule,
});
const toDrafts = (p: Program): DayDraft[] =>
  p.days.map((d) => ({ key: `${d.day}-${d.sessionId}`, sessionId: d.sessionId, title: d.title, session: d.session }));
const sameDays = (a: DayDraft[], p: Program) =>
  a.length === p.days.length && a.every((d, i) => d.sessionId === p.days[i]!.sessionId && (d.title ?? null) === (p.days[i]!.title ?? null));
let seq = 0;

export const programMeta = (p: Program) =>
  `${p.days.length} ${p.days.length === 1 ? 'day' : 'days'} · ${formatNumber(p.kpis.started)} started`;

function ProgramEditor({ program }: { program: Program }) {
  const cache = useProgramCache();
  const themes = useThemes();
  const themeName = useMemo(() => new Map(themes.data?.map((t) => [t.id, t.name])), [themes.data]);
  const { register, handleSubmit, reset, setError, formState } = useForm<ProgramInput, unknown, ProgramValues>({
    resolver: zodForm(programSchema),
    defaultValues: toForm(program),
  });
  const [days, setDays] = useState<DayDraft[]>(() => toDrafts(program));
  const [picker, setPicker] = useState<{ index: number | null } | null>(null);
  const [saving, setSaving] = useState<null | 'save' | 'status'>(null);
  const [stale, setStale] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  const others = useEditingPresence('program', program.id);
  const { change, dismiss } = useChangedByOthers('program', program.id);

  const daysDirty = !sameDays(days, program);
  const dirty = formState.isDirty || daysDirty;
  // A newer version arrived and nothing here is unsaved: just show it.
  useEffect(() => {
    if (!dirty) {
      reset(toForm(program));
      setDays(toDrafts(program));
    }
  }, [program.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (e: unknown) => {
    if (isConflict(e)) return setStale(true); // days and details are saved in two steps, so a field-by-field merge is not offered here
    if (!applyFieldErrors(e, setError, ['title', 'description'])) toast.apiError(e, 'Could not save the program.');
  };

  /** Details first, then the day list, each with the version the step before returned. */
  const save = async (v: ProgramValues): Promise<Program | null> => {
    try {
      let row = program;
      if (formState.isDirty) row = await programApi.update(program.id, v, row.version);
      if (daysDirty) row = await programApi.putDays(program.id, days, row.version);
      cache.saved(row);
      reset(toForm(row));
      setDays(toDrafts(row));
      dismiss();
      return row;
    } catch (e) {
      fail(e);
      return null;
    }
  };

  const onSave = handleSubmit(async (v) => {
    setSaving('save');
    if (await save(v)) toast.success('Program saved');
    setSaving(null);
  });

  const setStatus = (status: 'live' | 'draft') =>
    handleSubmit(async (v) => {
      setSaving('status');
      const row = dirty ? await save(v) : program;
      if (row) {
        try {
          cache.saved(await programApi.update(program.id, { status }, row.version));
          toast.success(status === 'live' ? 'Program published' : 'Program is a draft again');
        } catch (e) {
          fail(e);
        }
      }
      setSaving(null);
    })();

  const blocker = programBlocker(days);
  const rate = finishRate(program.kpis);
  const live = program.status === 'live';

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {others.length ? (
        <p role="status" className="rounded-btn bg-info px-4 py-2.5 text-body text-info-text">
          {others.join(', ')} {others.length === 1 ? 'is' : 'are'} editing this program too.
        </p>
      ) : null}
      {change && dirty ? (
        <p role="alert" className="rounded-btn bg-warning/15 px-4 py-2.5 text-body text-warning">
          {change.by?.name ?? 'Someone'} just saved this program. Your unsaved edits are still here.
        </p>
      ) : null}

      <form onSubmit={onSave} noValidate className="flex flex-col gap-[18px] rounded-card border border-border bg-surface p-[22px]">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[1.2px] text-ember-text">
              {program.access === 'premium' ? 'Premium' : 'Free'} program · {days.length} {days.length === 1 ? 'day' : 'days'}
            </span>
            <h2 className="truncate text-[22px] font-bold">{program.title}</h2>
          </div>
          <Badge tone={live ? 'success' : 'warning'} caps>
            {live ? 'Live' : STATUS[program.status].label}
          </Badge>
          {live ? (
            <Button type="button" variant="outline" size="sm" disabled={saving !== null} onClick={() => setConfirmUnpublish(true)}>
              Unpublish
            </Button>
          ) : (
            <Tooltip content={blocker}>
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- lets keyboard users read why Publish is off */}
              <span tabIndex={blocker ? 0 : -1} className="inline-flex rounded-btn">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={saving === 'status'}
                  disabled={saving !== null || !!blocker}
                  onClick={() => void setStatus('live')}
                >
                  Publish
                </Button>
              </span>
            </Tooltip>
          )}
          <Button type="submit" size="sm" loading={saving === 'save'} disabled={saving !== null || !dirty}>
            Save
          </Button>
        </div>
        <Input label="Title" size="sm" error={formState.errors.title?.message} className="[&_input]:h-11" {...register('title')} />
        <Textarea label="Description" rows={2} error={formState.errors.description?.message} {...register('description')} />
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select label="Unlock rule" size="sm" options={UNLOCK_RULES} className="[&_select]:h-11" {...register('unlockRule')} />
          <Select label="Access" size="sm" options={ACCESS} className="[&_select]:h-11" {...register('access')} />
        </div>
        <ul
          aria-label="Program numbers"
          className="flex flex-wrap gap-x-6 gap-y-2 rounded-tile border border-border bg-input px-4 py-3.5 text-sm text-text-muted"
        >
          <li>
            <strong className="tabular inline text-[15px] font-bold text-text">{formatNumber(program.kpis.started)}</strong>{' '}
            <span>started</span>
          </li>
          <li>
            <strong className="tabular inline text-[15px] font-bold text-text">{formatNumber(program.kpis.completed)}</strong>{' '}
            <span>finished all {program.days.length || ''}</span>
          </li>
          <li>
            <strong className="tabular inline text-[15px] font-bold text-text">{rate === null ? '—' : formatPercent(rate)}</strong>{' '}
            <span>finish rate</span>
          </li>
          <li>
            <strong className="tabular inline text-[15px] font-bold text-text">{totalMinutes(days)} min</strong> <span>total length</span>
          </li>
        </ul>
        <p className="text-xs text-text-faint">One meditation unlocks per day. There are no rest days and no grace days.</p>
      </form>

      <SectionCard
        title="Day schedule"
        className="gap-2.5 p-[22px]"
        action={<span className="text-sm text-text-muted">{days.length > 1 ? 'Drag to reorder' : ''}</span>}
      >
        {days.length === 0 ? (
          <EmptyState title="No days yet" description="Add the first day. Each day plays one meditation." className="py-6" />
        ) : (
          <DragList
            label="Day schedule"
            className="gap-2.5"
            itemClassName="rounded-tile border border-border bg-input px-2 py-1"
            items={days}
            itemKey={(d) => d.key}
            itemLabel={(d) => d.session?.title ?? 'day'}
            onReorder={setDays}
            renderItem={(d, i) => (
              <div className="flex items-center gap-3.5 py-1.5 pr-1.5">
                <span className="tabular w-16 shrink-0 rounded-lg bg-border py-1.5 text-center text-xs font-bold uppercase tracking-[0.6px] text-text-soft">
                  Day {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-semibold">{d.session?.title ?? 'Meditation not found'}</span>
                  <span className="truncate text-sm text-text-muted">
                    {(d.session?.themeId && themeName.get(d.session.themeId)) || 'No theme'}
                    {d.session && d.session.status !== 'live' ? (
                      <>
                        {' · '}
                        <StatusText tone={STATUS[d.session.status].tone}>
                          {STATUS[d.session.status].label.toLowerCase()}, not in the app yet
                        </StatusText>
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="tabular w-14 text-sm text-text-muted">{d.session ? lengthLabel(d.session.durationSec) : ''}</span>
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setPicker({ index: i })}>
                  Change session
                </Button>
                <IconButton
                  label={`Remove day ${i + 1}`}
                  variant="danger"
                  onClick={() => setDays((all) => all.filter((x) => x.key !== d.key))}
                >
                  <Trash2 size={16} aria-hidden />
                </IconButton>
              </div>
            )}
          />
        )}
        <button
          type="button"
          onClick={() => setPicker({ index: null })}
          disabled={days.length >= 60}
          className="h-12 rounded-btn border border-dashed border-outline text-body font-semibold text-ember-text hover:bg-surface-alt disabled:opacity-50"
        >
          + Add day
        </button>
      </SectionCard>

      <SessionPicker
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        title={picker?.index === null ? `Meditation for day ${days.length + 1}` : `Meditation for day ${(picker?.index ?? 0) + 1}`}
        allow={(s) => (s.status === 'archived' ? 'archived' : null)}
        onPick={(s) => {
          const day: DayDraft = {
            key: `new-${(seq += 1)}`,
            sessionId: s.id,
            title: null,
            session: { id: s.id, title: s.title, durationSec: s.durationSec, status: s.status, type: s.type, themeId: s.themeId },
          };
          setDays((all) =>
            picker?.index === null || picker === null
              ? [...all, day]
              : all.map((x, i) => (i === picker.index ? { ...day, key: x.key } : x)),
          );
        }}
      />
      <ConfirmDialog
        open={confirmUnpublish}
        onOpenChange={setConfirmUnpublish}
        title="Take this program out of the app?"
        description={`${formatNumber(program.kpis.started)} ${program.kpis.started === 1 ? 'member has' : 'members have'} started it. They keep their progress, but the program disappears from the app until it is published again.`}
        confirmLabel="Unpublish"
        onConfirm={() => {
          setConfirmUnpublish(false);
          void setStatus('draft');
        }}
      />
      <Dialog
        open={stale}
        onOpenChange={() => {}}
        title="This program was changed while you were editing"
        description="Someone else saved a newer version. To avoid overwriting their work, load their version and make your changes again."
        size="sm"
        footer={
          <Button
            onClick={async () => {
              await cache.refresh();
              setStale(false);
              dismiss();
            }}
          >
            Load their version
          </Button>
        }
      />
    </div>
  );
}

/** 05 Programs: multi-day programs, one meditation per day. */
export function ProgramsPage() {
  const { data: programs, isPending, error, refetch } = usePrograms();
  const cache = useProgramCache();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const recent = useRecentChanges('program');

  useEffect(() => {
    if (programs && (!selected || !programs.some((p) => p.id === selected))) setSelected(programs[0]?.id ?? null);
  }, [programs, selected]);
  const current = programs?.find((p) => p.id === selected) ?? null;

  const create = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setBusy(true);
    try {
      const row = await programApi.create(title);
      cache.added(row);
      setSelected(row.id);
      setCreating(false);
      setNewTitle('');
      toast.success('Program created as a draft');
    } catch (e) {
      toast.apiError(e, 'Could not create the program.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Programs"
        subtitle="Multi-day programs: one meditation unlocks per day."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden />
            New program
          </Button>
        }
      />
      {error ? (
        <Card padded={false}>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      ) : isPending ? (
        <div role="status" aria-label="Loading programs" className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Skeleton className="h-64 rounded-card" />
          <Skeleton className="h-[520px] rounded-card" />
        </div>
      ) : programs.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            title="No programs yet"
            description="A program is a series of meditations, one per day."
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                New program
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <ul aria-label="Programs" className="flex flex-col gap-2.5">
            {programs.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={p.id === selected}
                  onClick={() => setSelected(p.id)}
                  className={cn(
                    'flex w-full flex-col gap-1.5 rounded-[14px] border p-4 text-left transition-colors duration-700',
                    p.id === selected ? 'border-ember bg-ember/10' : 'border-border bg-surface hover:border-border-strong',
                    recent.has(p.id) && p.id !== selected && 'bg-ember/10',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{p.title}</span>
                    <Badge tone={p.status === 'live' ? 'success' : 'warning'} size="sm" caps>
                      {p.status === 'live' ? 'Live' : STATUS[p.status].label}
                    </Badge>
                  </span>
                  <span className="text-sm text-text-muted">{programMeta(p)}</span>
                </button>
              </li>
            ))}
          </ul>
          {current ? <ProgramEditor key={current.id} program={current} /> : null}
        </div>
      )}

      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="New program"
        description="It starts as a draft. Add days, then publish."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={() => void create()} loading={busy} disabled={!newTitle.trim()}>
              Create
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Input
            label="Title"
            placeholder="7-Day Autonomic Reset"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            maxLength={120}
          />
        </form>
      </Dialog>
    </>
  );
}
