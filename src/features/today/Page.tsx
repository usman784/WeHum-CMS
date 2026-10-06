import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useChangedByOthers } from '../../hooks/useEntity';
import { isConflict } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatNumber } from '../../lib/format';
import { todayUtc } from '../../lib/tz';
import { Button } from '../../ui/Button';
import { Card, SectionCard } from '../../ui/Card';
import { Checkbox } from '../../ui/Checkbox';
import { ConflictDialog, type ConflictField } from '../../ui/ConflictDialog';
import { Dialog } from '../../ui/Dialog';
import { DragList } from '../../ui/DragList';
import { FileDrop } from '../../ui/FileDrop';
import { IconButton } from '../../ui/IconButton';
import { NumberInput } from '../../ui/NumberInput';
import { PageHeader } from '../../ui/PageHeader';
import { PhoneCard, PhonePreview } from '../../ui/PhonePreview';
import { Select } from '../../ui/Select';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { Switch } from '../../ui/Switch';
import { toast } from '../../ui/Toast';
import { DatePicker } from '../../ui/TimeInput';
import { api } from '../../lib/api';
import { addDays, dayTitle } from '../daily/api';
import { useConfigForm } from '../config/useConfigForm';
import { FILE_RULES, useMediaUpload } from '../media/api';
import { SessionPicker } from '../sessions/SessionPicker';
import {
  dayNote, FREE_PICKS, LENGTHS, missingLengths, motdApi, rulesApi, useMotdWeek, useTodayCache, useTodayRules, weekDays, weekLabel, weekStart,
  type Length, type MotdDay, type TodayRules,
} from './api'; // prettier-ignore

const RULE_FIELDS: ConflictField<TodayRules>[] = [
  { key: 'emptyRoomThreshold', label: 'Empty-room rule (people at once)' },
  { key: 'freeHomePick', label: '“Free for you” shows first', format: (v) => FREE_PICKS.find((p) => p.value === v)?.label ?? String(v) },
  { key: 'showDailyMessage', label: 'Show the Daily Message under the card' },
  { key: 'sections', label: 'Sections on Today', format: (v) => { const s = v as TodayRules['sections']; return [s.progress && 'progress card', s.liveCounter && 'live counter', s.worldMap && 'world map'].filter(Boolean).join(', ') || 'none'; } }, // prettier-ignore
];
const SECTION_LABELS: { key: keyof TodayRules['sections']; label: string }[] = [
  { key: 'progress', label: 'Progress card (minutes this week)' },
  { key: 'liveCounter', label: 'Live “meditating now” counter' },
  { key: 'worldMap', label: 'World map + World Vibration' },
];

/** One of the three length files of a day. A new file replaces the old one as soon as it has been processed. */
function VariantSlot({ day, len, locked, onChanged }: { day: MotdDay; len: Length; locked: boolean; onChanged: () => void }) {
  const variant = day.variants?.[len] ?? null;
  const file = useMediaUpload({
    kind: 'audio',
    mediaId: variant?.mediaId,
    onReady: (m) =>
      void motdApi
        .variant(day.date, len, m.id)
        .then(() => {
          toast.success(`${len} min saved`);
          onChanged();
        })
        .catch((e) => toast.apiError(e, `Could not save the ${len} min file.`)),
  });
  return (
    <li className="grid items-center gap-3 rounded-tile border border-border bg-input p-3.5 sm:grid-cols-[110px_minmax(0,1fr)]">
      <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start">
        <h3 className="text-body font-semibold">{len} min</h3>
        <span
          className={cn(
            'text-xs font-bold uppercase tracking-[0.6px]',
            variant?.status === 'ready' ? 'text-success-text' : 'text-ember-text',
          )}
        >
          {variant?.status === 'ready' ? 'Uploaded' : variant ? 'Processing' : 'Missing'}
        </span>
      </div>
      <FileDrop
        label={`${len} min audio`}
        hint={variant?.status === 'ready' ? 'Drop a file to replace it' : `Finished file, about ${len} min`}
        rule={FILE_RULES.audio}
        state={file.state}
        disabled={locked}
        onFiles={([f]) => f && file.start(f)}
        onPause={file.pause}
        onResume={file.resume}
        onCancel={file.cancel}
        onRetry={file.retry}
      />
    </li>
  );
}

type RowProps = { day: MotdDay; today: string; selected: boolean; onSelect: () => void; onChange: () => void; onMove: () => void };

function DayRow({ day, today, selected, onSelect, onChange, onMove }: RowProps) {
  const past = day.date < today;
  const missing = missingLengths(day).length > 0;
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-tile border px-3.5 py-2.5',
        selected ? 'border-ember bg-ember/10' : 'border-border bg-input',
      )}
    >
      <button type="button" aria-pressed={selected} onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <span className="tabular w-28 shrink-0 text-body font-semibold text-text-soft">{dayTitle(day.date)}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body font-semibold">{day.sessionTitle ?? 'Not chosen yet'}</span>
          <span className={cn('truncate text-sm', day.sessionId && missing ? 'text-warning' : 'text-text-muted')}>{dayNote(day)}</span>
        </span>
      </button>
      {past ? (
        <span className="flex items-center gap-1.5 text-sm text-text-faint">
          <Lock size={14} aria-hidden /> Past
        </span>
      ) : (
        <>
          <Button variant="ghost" size="sm" onClick={onChange} aria-label={`Change the meditation of ${dayTitle(day.date)}`}>
            {day.sessionId ? 'Change' : 'Choose'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!day.sessionId}
            onClick={onMove}
            aria-label={`Move the date of ${dayTitle(day.date)}`}
          >
            Move date
          </Button>
        </>
      )}
    </div>
  );
}

function MoveDialog({ day, today, onClose, onDone }: { day: MotdDay | null; today: string; onClose: () => void; onDone: () => void }) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    setTarget(day ? addDays(day.date, 1) : '');
    setProblem(null);
  }, [day]);
  if (!day) return null;
  const go = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const [there] = (await api<MotdDay[]>('/v1/admin/motd', { query: { from: target, to: target } })).data;
      if (!there?.sessionId)
        return setProblem(`Nothing is planned for ${dayTitle(target)}. Use “Choose” on that day first; the two days are then swapped.`);
      await motdApi.swap(day.date, target);
      toast.success(`${dayTitle(day.date)} and ${dayTitle(target)} swapped`);
      onDone();
      onClose();
    } catch (e) {
      toast.apiError(e, 'Could not move the meditation.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Move “${day.sessionTitle}”`}
      description="The two days swap everything: the meditation, its three lengths and the group start."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!target || target < today || target === day.date} onClick={() => void go()}>
            Swap days
          </Button>
        </>
      }
    >
      <DatePicker
        label="Swap with the meditation of"
        min={today}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        error={problem ?? undefined}
      />
    </Dialog>
  );
}

/** What the app's Today screen looks like with these settings. Sample numbers; the app is dark only. */
function TodayPreview({ day, rules }: { day: MotdDay | undefined; rules: TodayRules }) {
  return (
    <PhonePreview caption={`Preview · ${day ? dayTitle(day.date).toUpperCase() : 'TODAY'}`}>
      <div className="flex items-center justify-between">
        <span className="text-body font-bold">WeHum</span>
        <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[10px] font-bold">SOS</span>
      </div>
      {rules.sections.liveCounter ? (
        <span className="w-fit rounded-full bg-surface px-3 py-1 text-[10px] font-bold uppercase tracking-[0.4px]">
          <span aria-hidden className="mr-1.5 inline-block size-1.5 rounded-full bg-success" />
          1,248 meditating worldwide now
        </span>
      ) : null}
      <div>
        <p className="text-h2">Good morning, Alex</p>
        <p className="text-xs text-text-muted">Your day starts here</p>
      </div>
      <PhoneCard>
        <span className="text-[10px] font-bold uppercase tracking-[0.8px] text-ember-text">Meditation of the day · 10 · 30 · 45 min</span>
        <p className="text-h3">{day?.sessionTitle ?? 'The most played meditation'}</p>
        <div className="rounded-btn bg-ember py-2.5 text-center text-body font-bold text-ember-on">▶ Begin</div>
        {rules.showDailyMessage ? <p className="text-xs text-text-muted">Raphael’s note · a short message for today</p> : null}
      </PhoneCard>
      {rules.sections.progress ? (
        <PhoneCard>
          <span className="text-xs font-bold">105 min this week</span>
          <div className="flex gap-2" aria-hidden>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span key={i} className={cn('size-5 rounded-full', i === 3 ? 'bg-ember' : 'bg-surface-alt')} />
            ))}
          </div>
        </PhoneCard>
      ) : null}
      {rules.sections.worldMap ? (
        <PhoneCard>
          <span className="text-xs font-bold">World map · World Vibration</span>
        </PhoneCard>
      ) : null}
      <PhoneCard>
        <span className="text-xs font-bold">Silence Room</span>
      </PhoneCard>
    </PhonePreview>
  );
}

/** 08 Today screen: what every user sees first when they open the app. */
export function TodayPage() {
  const today = todayUtc();
  const [start, setStart] = useState(weekStart(today));
  const [selected, setSelected] = useState<string | null>(null);
  const motd = useMotdWeek(start);
  const rulesQ = useTodayRules();
  const cache = useTodayCache(start);
  const { change, dismiss } = useChangedByOthers('config', 'today');
  const [picking, setPicking] = useState<MotdDay | null>(null);
  const [moving, setMoving] = useState<MotdDay | null>(null);
  const [swapping, setSwapping] = useState(false);

  const form = useConfigForm<TodayRules>({
    doc: rulesQ.data,
    put: rulesApi.save,
    onSaved: (doc) => {
      cache.rules(doc);
      dismiss();
      toast.success('Today screen saved');
    },
    onError: (e) => toast.apiError(e, 'Could not save the Today screen.'),
  });
  const rules = form.value;

  const days = motd.data;
  const day = days?.find((d) => d.date === selected) ?? days?.find((d) => d.date === today) ?? days?.[0];
  const locked = !!day && day.date < today;

  const choose = async (d: MotdDay, sessionId: string) => {
    try {
      await motdApi.set(d.date, { sessionId, groupStartUtc: d.groupStartUtc ?? null, groupLengthMin: d.groupLengthMin ?? null }, d.version);
      toast.success(`${dayTitle(d.date)} saved`);
    } catch (e) {
      if (isConflict(e))
        toast.error('Someone else changed this day.', 'It is shown as they left it. Choose again if you still want to change it.');
      else toast.apiError(e, 'Could not change the meditation.');
    }
    void cache.refresh();
  };

  /** Dragging a row onto another swaps the two days (the row that moved furthest is the one that was dragged). */
  const swapByDrag = async (next: MotdDay[]) => {
    if (!days) return;
    const before = days.map((d) => d.date);
    const after = next.map((d) => d.date);
    const moved = before.reduce(
      (best, d) => (Math.abs(after.indexOf(d) - before.indexOf(d)) > Math.abs(after.indexOf(best) - before.indexOf(best)) ? d : best),
      before[0]!,
    );
    const a = before[before.indexOf(moved)]!;
    const b = before[after.indexOf(moved)]!;
    if (a === b) return;
    const [da, db] = [days.find((d) => d.date === a)!, days.find((d) => d.date === b)!];
    if (a < today || b < today) return toast.error('Past days cannot be changed.');
    if (!da.sessionId || !db.sessionId) return toast.error('Both days need a meditation to swap.', 'Use “Choose” on the empty day first.');
    setSwapping(true);
    cache.days((all) =>
      all.map((d) => (d.date === a ? { ...db, date: a, version: da.version } : d.date === b ? { ...da, date: b, version: db.version } : d)),
    );
    try {
      await motdApi.swap(a, b);
      toast.success(`${dayTitle(a)} and ${dayTitle(b)} swapped`);
    } catch (e) {
      toast.apiError(e, 'Could not swap the days.');
    } finally {
      setSwapping(false);
      void cache.refresh();
    }
  };

  const missingNow = day?.sessionId ? missingLengths(day) : [];

  return (
    <>
      <PageHeader
        title="Today Screen"
        subtitle="Choose what every user sees first when they open the app"
        actions={
          <Button onClick={form.save} loading={form.saving} disabled={!form.dirty}>
            Save changes
          </Button>
        }
      />
      {change && !form.dirty ? (
        <p role="status" className="rounded-btn bg-info px-4 py-2.5 text-body text-info-text">
          {change.by?.name ?? 'Someone'} changed the Today screen rules. They are shown below.
        </p>
      ) : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <h2 className="flex-1 text-h2">Meditation of the Day</h2>
              <IconButton label="Previous week" variant="solid" onClick={() => setStart(addDays(start, -7))}>
                <ChevronLeft size={16} aria-hidden />
              </IconButton>
              <span className="min-w-28 text-center text-body font-semibold" aria-live="polite">
                {weekLabel(start)}
              </span>
              <IconButton label="Next week" variant="solid" onClick={() => setStart(addDays(start, 7))}>
                <ChevronRight size={16} aria-hidden />
              </IconButton>
            </div>
            <p className="text-sm text-text-muted">
              The big card members see first on Today. Drag a row onto another to swap two days, or pick “Change” to choose another
              meditation. Empty days fall back to the most played meditation.
            </p>
            {motd.error ? (
              <ErrorState error={motd.error} onRetry={() => void motd.refetch()} />
            ) : motd.isPending ? (
              <SkeletonRows rows={7} label="Loading the week" />
            ) : days && days.length === 0 ? (
              <EmptyState title="No days" description="Nothing to show for this week." />
            ) : (
              <DragList
                label="Days of the week"
                className="flex flex-col gap-2.5"
                itemClassName=""
                items={days ?? weekDays(start).map((date) => ({ date, sessionId: null, variants: null, complete: false }))}
                itemKey={(d) => d.date}
                itemLabel={(d) => dayTitle(d.date)}
                disabled={swapping}
                onReorder={(next) => void swapByDrag(next)}
                renderItem={(d) => (
                  <DayRow
                    day={d}
                    today={today}
                    selected={d.date === day?.date}
                    onSelect={() => setSelected(d.date)}
                    onChange={() => setPicking(d)}
                    onMove={() => setMoving(d)}
                  />
                )}
              />
            )}
          </Card>

          <SectionCard
            title={day?.sessionTitle ? `Three lengths for ${day.sessionTitle}` : 'Three lengths'}
            description="Every Meditation of the Day comes in 10, 30 and 45 min. Members pick one on the Today screen."
          >
            {!day?.sessionId ? (
              <p className="text-body text-text-muted">
                Choose the meditation for {day ? dayTitle(day.date) : 'this day'} first, then add its three lengths.
              </p>
            ) : (
              <>
                {missingNow.length ? (
                  <p role="status" className="text-sm font-semibold text-warning">
                    Missing: {missingNow.map((l) => `${l} min`).join(', ')}. Members cannot start this day in those lengths yet.
                  </p>
                ) : null}
                {locked ? <p className="text-sm text-text-muted">Past days cannot be changed.</p> : null}
                <ul aria-label="Lengths" className="flex flex-col gap-3">
                  {LENGTHS.map((len) => (
                    <VariantSlot key={`${day.date}-${len}`} day={day} len={len} locked={locked} onChanged={() => void cache.refresh()} />
                  ))}
                </ul>
              </>
            )}
          </SectionCard>

          {rulesQ.error ? (
            <ErrorState error={rulesQ.error} onRetry={() => void rulesQ.refetch()} />
          ) : !rules ? (
            <SkeletonRows rows={4} label="Loading the rules" />
          ) : (
            <>
              <div className="grid gap-5 md:grid-cols-2">
                <SectionCard title="One decision on Today">
                  <p className="text-body text-text-soft">
                    Today shows one big card: title, length, live count and a single Begin button. Members pick 10, 30 or 45 min and press
                    Begin. Below it: their program, the Silence Room (on every home page, members only) and their progress.
                  </p>
                  <Switch
                    label="Show the Daily Message as a small line under the card"
                    description="Off by default. Waiting for Raphael to decide."
                    checked={rules.showDailyMessage}
                    onCheckedChange={(showDailyMessage) => form.edit({ showDailyMessage })}
                  />
                </SectionCard>
                <SectionCard title="Sections on Today">
                  {SECTION_LABELS.map((s) => (
                    <Checkbox
                      key={s.key}
                      label={s.label}
                      checked={rules.sections[s.key]}
                      onChange={(e) => form.edit({ sections: { ...rules.sections, [s.key]: e.target.checked } })}
                    />
                  ))}
                  <NumberInput
                    label="Empty-room rule"
                    hint="people at once"
                    value={rules.emptyRoomThreshold}
                    min={0}
                    max={1000}
                    onChange={(n) => form.edit({ emptyRoomThreshold: n ?? 0 })}
                    help="Below this, the app shows “meditated today” instead of “meditating now”. Numbers are never faked or rounded up."
                  />
                </SectionCard>
              </div>
              <SectionCard
                title="For free users"
                description="Free users see the premium Meditation of the Day on top (locked, “Try 7 days free”), then “Free for you” with meditations from Raphael’s online library, then the Silence Room marked Premium. No previews."
              >
                <Select
                  label="“Free for you” shows first"
                  inline
                  value={rules.freeHomePick}
                  onChange={(e) => form.edit({ freeHomePick: e.target.value as TodayRules['freeHomePick'] })}
                  options={FREE_PICKS}
                />
              </SectionCard>
            </>
          )}
        </div>
        {rules ? <TodayPreview day={day} rules={rules} /> : null}
      </div>

      <SessionPicker
        open={!!picking}
        onOpenChange={(o) => !o && setPicking(null)}
        title={picking ? `Meditation for ${dayTitle(picking.date)}` : 'Choose a meditation'}
        allow={(s) =>
          s.status !== 'live' ? 'publish it first' : s.isSos ? 'a SoS meditation' : s.type === 'youtube' ? 'YouTube is always free' : null
        }
        onPick={(s) => picking && void choose(picking, s.id)}
      />
      <MoveDialog day={moving} today={today} onClose={() => setMoving(null)} onDone={() => void cache.refresh()} />
      {form.conflict ? (
        <ConflictDialog
          open
          mine={form.conflict.mine}
          theirs={form.conflict.theirs.value}
          fields={RULE_FIELDS}
          by={change?.by?.name}
          saving={form.saving}
          onKeepMine={form.keepMine}
          onTakeTheirs={form.takeTheirs}
        />
      ) : null}
      <span className="sr-only" aria-live="polite">
        {formatNumber(days?.filter((d) => d.sessionId).length ?? 0)} days planned this week
      </span>
    </>
  );
}
