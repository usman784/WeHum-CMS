import { ChevronLeft, ChevronRight, Copy, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChangedByOthers, useEditingPresence } from '../../hooks/useEntity';
import { useVersionedSave } from '../../hooks/useVersionedSave';
import { isConflict } from '../../lib/api';
import { cn } from '../../lib/cn';
import { todayUtc } from '../../lib/tz';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ConflictDialog, type ConflictField } from '../../ui/ConflictDialog';
import { ConfirmDialog, Dialog } from '../../ui/Dialog';
import { FileDrop } from '../../ui/FileDrop';
import { IconButton } from '../../ui/IconButton';
import { ImagePicker } from '../../ui/ImagePicker';
import { Input, Textarea } from '../../ui/Input';
import { PageHeader } from '../../ui/PageHeader';
import { Segmented } from '../../ui/Segmented';
import { SkeletonRows } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/States';
import { toast } from '../../ui/Toast';
import { DatePicker } from '../../ui/TimeInput';
import { FILE_RULES, useMediaUpload } from '../media/api';
import {
  addDays, addMonths, dailyApi, dayState, dayTitle, daysWithoutMessage, messageBlocker, monthGrid, monthLabel, monthOf, toBody, TYPES,
  useDailyCache, useDailyMessages,
  type DailyMessage, type MessageBody, type MessageStatus, type MessageType,
} from './api'; // prettier-ignore

const STATE_STYLE: Record<string, { bar: string; text: string }> = {
  'live-today': { bar: 'border-t-success', text: 'text-success-text' },
  published: { bar: 'border-t-text-faint', text: 'text-text-muted' },
  scheduled: { bar: 'border-t-teal-text', text: 'text-teal-text' },
  draft: { bar: 'border-t-ember-soft', text: 'text-ember-text' },
  archived: { bar: 'border-t-border-strong', text: 'text-text-muted' },
  missing: { bar: 'border-t-ember', text: 'text-ember-text' },
  empty: { bar: 'border-t-transparent', text: 'text-text-faint' },
};
const LEGEND = [
  ['Published', 'bg-text-faint'],
  ['Live today', 'bg-success'],
  ['Scheduled', 'bg-teal-text'],
  ['Draft', 'bg-ember-soft'],
  ['Missing', 'bg-ember'],
] as const;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const FIELDS: ConflictField<DailyMessage>[] = [
  { key: 'title', label: 'Title' },
  { key: 'type', label: 'Type' },
  { key: 'text', label: 'Text' },
  { key: 'themeTag', label: 'Theme' },
  { key: 'status', label: 'Status' },
  { key: 'mediaId', label: 'Audio or video file', format: (v) => (v ? 'A file is attached' : 'No file') },
  { key: 'imageMediaId', label: 'Image', format: (v) => (v ? 'An image is attached' : 'No image') },
];

type Draft = Omit<MessageBody, 'status'>;
const blank: Draft = { type: 'audio', title: '', text: null, mediaId: null, imageMediaId: null, durationSec: null, themeTag: null };
const draftOf = (m: DailyMessage | undefined): Draft =>
  m
    ? {
        type: m.type,
        title: m.title,
        text: m.text,
        mediaId: m.mediaId,
        imageMediaId: m.imageMediaId,
        durationSec: m.durationSec,
        themeTag: m.themeTag,
      }
    : blank;
const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

type EditorProps = {
  date: string;
  today: string;
  message: DailyMessage | undefined;
  themes: string[];
  onSaved: (row: DailyMessage) => void;
  onRemoved: (date: string) => void;
  onDuplicated: (row: DailyMessage) => void;
};

function DayEditor({ date, today, message, themes, onSaved, onRemoved, onDuplicated }: EditorProps) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(message));
  const base = useRef(message);
  const dirty = !sameDraft(draft, draftOf(base.current));
  const [newTheme, setNewTheme] = useState('');
  const [errorShown, setErrorShown] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateTo, setDuplicateTo] = useState(addDays(date, 1));
  const [busy, setBusy] = useState(false);
  const others = useEditingPresence('dailyMessage', date);
  const { change, dismiss } = useChangedByOthers('dailyMessage', date);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const media = useMediaUpload({
    kind: draft.type === 'video' ? 'video' : 'audio',
    mediaId: draft.mediaId,
    onUploaded: (id) => set({ mediaId: id }),
    onReady: (m) => m.durationSec && set({ durationSec: Math.round(m.durationSec) }),
  });
  const image = useMediaUpload({ kind: 'image', mediaId: draft.imageMediaId, onUploaded: (id) => set({ imageMediaId: id }) });
  const uploading = draft.type !== 'text' && media.busy;

  // The saved message changed under this form (my own save, or someone else's): follow it unless there are unsaved edits.
  const forceReload = useRef(false);
  useEffect(() => {
    if (message?.version === base.current?.version) return;
    if (!dirty || forceReload.current) {
      base.current = message;
      forceReload.current = false;
      setDraft(draftOf(message));
    }
  }, [message, dirty]);

  const save = useVersionedSave<DailyMessage, MessageBody>({
    save: (body, version) => dailyApi.put(date, body, version),
    onSaved: (row, body) => {
      const was = base.current?.status;
      base.current = row;
      setDraft(draftOf(row));
      dismiss();
      onSaved(row);
      if (was === body.status)
        toast.success('Saved'); // edited, status unchanged
      else toast.success(body.status === 'live' ? 'Published' : body.status === 'scheduled' ? `Scheduled for ${dayTitle(date)}` : 'Saved');
    },
    onError: (e) => toast.apiError(e, 'Could not save the message.'),
  });

  const submit = (status: MessageStatus) => {
    const body: MessageBody = {
      ...draft,
      title: draft.title.trim(),
      text: draft.type === 'text' ? draft.text?.trim() || null : draft.text,
      status,
    };
    if (draft.type === 'text') body.mediaId = null;
    if (!body.title) return setErrorShown(true);
    if (status !== 'draft') {
      const blocked = messageBlocker(body, uploading);
      if (blocked) return toast.error(blocked);
    }
    save.save(body, base.current?.version ?? 0);
  };
  const status = message?.status;
  const future = date > today;
  const titleError = errorShown && !draft.title.trim() ? 'Enter a title' : undefined;
  const textTooLong = (draft.text?.length ?? 0) > 4000;

  const remove = async () => {
    setBusy(true);
    try {
      await dailyApi.remove(date);
      onRemoved(date);
      setConfirmDelete(false);
      toast.success('Message deleted');
    } catch (e) {
      toast.apiError(e, 'Could not delete the message.');
    } finally {
      setBusy(false);
    }
  };
  const duplicate = async () => {
    if (!message) return;
    setBusy(true);
    try {
      const row = await dailyApi.put(duplicateTo, toBody(message, 'draft'), 0); // version 0 = create only, never replace
      onDuplicated(row);
      setDuplicateOpen(false);
      toast.success(`Copied to ${dayTitle(duplicateTo)} as a draft`);
    } catch (e) {
      if (isConflict(e)) toast.error(`${dayTitle(duplicateTo)} already has a message.`, 'Pick an empty day, or delete that message first.');
      else toast.apiError(e, 'Could not copy the message.');
    } finally {
      setBusy(false);
    }
  };

  const chips = useMemo(() => [...new Set([...themes, ...(draft.themeTag ? [draft.themeTag] : [])])].sort(), [themes, draft.themeTag]);
  const caption =
    status === 'live'
      ? 'Published, shown in the app'
      : status === 'scheduled'
        ? 'Scheduled, delivered at each user’s chosen time'
        : status === 'draft'
          ? 'Draft, not in the app'
          : 'No message yet';

  return (
    <aside aria-label={`Message for ${dayTitle(date)}`} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
      <header className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-[1.2px] text-ember-text">{dayTitle(date)}</span>
        <h2 className="text-h2">{message?.title ?? 'New message'}</h2>
        <p className="text-sm text-text-muted">{caption}</p>
      </header>
      {others.length ? (
        <p role="status" className="rounded-btn bg-info px-3 py-2 text-sm text-info-text">
          {others.join(', ')} {others.length === 1 ? 'is' : 'are'} editing this day too.
        </p>
      ) : null}
      {change && dirty ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 rounded-btn bg-warning/15 px-3 py-2 text-sm text-warning">
          This message changed: {change.by?.name ?? 'someone'} saved it. Your unsaved edits are still here.
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              forceReload.current = true;
              dismiss();
              setDraft(draftOf(message));
              base.current = message;
            }}
          >
            Reload their version
          </Button>
        </p>
      ) : null}

      <Segmented
        label="Message type"
        value={draft.type}
        onChange={(type: MessageType) => set({ type })}
        options={TYPES.map((t) => ({ value: t.value, label: t.label }))}
      />
      {draft.type === 'text' ? (
        <Textarea
          label="Text"
          rows={6}
          value={draft.text ?? ''}
          error={textTooLong ? 'At most 4,000 characters' : undefined}
          onChange={(e) => set({ text: e.target.value })}
        />
      ) : (
        <FileDrop
          label={draft.type === 'video' ? 'Video file' : 'Audio file'}
          hint={draft.type === 'video' ? 'Finished file, up to 2 GB' : 'Finished file, 3–6 min'}
          rule={FILE_RULES[draft.type === 'video' ? 'video' : 'audio']}
          state={media.state}
          onFiles={([f]) => {
            if (!f) return;
            media.start(f);
            if (!draft.title.trim())
              set({
                title: f.name
                  .replace(/\.[^.]+$/, '')
                  .replace(/[_-]+/g, ' ')
                  .slice(0, 120),
              });
          }}
          onPause={media.pause}
          onResume={media.resume}
          onCancel={media.cancel}
          onRetry={media.retry}
        />
      )}
      <ImagePicker
        label="Image (optional)"
        minSize={600}
        className="w-44"
        value={image.media?.previewUrl ?? null}
        onChange={image.start}
        disabled={image.busy}
        note={draft.type === 'text' ? 'Shown above the text' : 'Shown above the player'}
      />
      <Input
        label="Title"
        size="sm"
        value={draft.title}
        error={titleError}
        onChange={(e) => set({ title: e.target.value })}
        maxLength={120}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Theme</legend>
        <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
          {chips.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={draft.themeTag === t}
              onClick={() => set({ themeTag: draft.themeTag === t ? null : t })}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm font-semibold',
                draft.themeTag === t
                  ? 'border-teal-text bg-teal text-teal-text'
                  : 'border-border-strong bg-input text-text-body hover:border-outline',
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            label="New theme"
            hideLabel
            placeholder="New theme"
            size="sm"
            maxLength={40}
            value={newTheme}
            onChange={(e) => setNewTheme(e.target.value)}
            className="min-w-0 flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!newTheme.trim()}
            onClick={() => {
              set({ themeTag: newTheme.trim() });
              setNewTheme('');
            }}
          >
            + Add theme
          </Button>
        </div>
      </fieldset>
      <p className="text-xs text-text-faint">
        After its day, every message stays in the app’s “Past messages”, searchable by date and word. It does not link to a meditation.
      </p>

      <div className="flex gap-2.5">
        {status === 'live' || status === 'scheduled' ? (
          <>
            <Button variant="outline" className="flex-1" disabled={save.saving} onClick={() => submit('draft')}>
              Back to draft
            </Button>
            <Button className="flex-1" loading={save.saving} disabled={!dirty || textTooLong} onClick={() => submit(status)}>
              Save changes
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              className="flex-1"
              loading={save.saving}
              disabled={textTooLong || (!dirty && status === 'draft')}
              onClick={() => submit('draft')}
            >
              Save draft
            </Button>
            <Button className="flex-1" disabled={save.saving || textTooLong} onClick={() => submit(future ? 'scheduled' : 'live')}>
              {future ? 'Schedule' : 'Publish now'}
            </Button>
          </>
        )}
      </div>
      {message ? (
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={() => setDuplicateOpen(true)}>
            <Copy size={14} aria-hidden />
            Copy to another day
          </Button>
          <IconButton label="Delete this message" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} aria-hidden />
          </IconButton>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete the message for ${dayTitle(date)}?`}
        description={status === 'live' ? 'It disappears from the app, including “Past messages”.' : 'It has not been shown in the app yet.'}
        confirmLabel="Delete message"
        danger
        loading={busy}
        onConfirm={() => void remove()}
      />
      <Dialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        title="Copy to another day"
        description="The copy is saved as a draft. A day that already has a message is not replaced."
        footer={
          <>
            <Button variant="outline" onClick={() => setDuplicateOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} disabled={!duplicateTo || duplicateTo === date} onClick={() => void duplicate()}>
              Copy
            </Button>
          </>
        }
      >
        <DatePicker label="Day" min={today} value={duplicateTo} onChange={(e) => setDuplicateTo(e.target.value)} />
      </Dialog>
      {save.conflict ? (
        <ConflictDialog
          open
          mine={save.conflict.mine as Partial<DailyMessage>}
          theirs={save.conflict.theirs}
          fields={FIELDS}
          by={change?.by?.name}
          saving={save.saving}
          onKeepMine={save.keepMine}
          onTakeTheirs={() =>
            save.takeTheirs((theirs) => {
              base.current = theirs;
              setDraft(draftOf(theirs));
              dismiss();
              onSaved(theirs);
            })
          }
        />
      ) : null}
    </aside>
  );
}

/** 07 Daily messages: one short audio, video or text message per day, planned on a month calendar. */
export function DailyMessagesPage() {
  const today = todayUtc();
  const [month, setMonth] = useState(monthOf(today));
  const [selected, setSelected] = useState<string | null>(null);
  const grid = useMemo(() => monthGrid(month), [month]);
  const from = grid[0]!;
  const to = grid[grid.length - 1]!;
  const { data, isPending, error, refetch } = useDailyMessages(from, to);
  const cache = useDailyCache(from, to);
  const byDate = useMemo(() => new Map((data ?? []).map((m) => [m.date, m])), [data]);
  const themes = useMemo(() => [...new Set((data ?? []).map((m) => m.themeTag).filter((t): t is string => !!t))], [data]);
  const missing = useMemo(() => (data ? daysWithoutMessage(byDate, today) : []), [data, byDate, today]);
  const day = selected && grid.includes(selected) ? selected : grid.includes(today) ? today : `${month}-01`;

  return (
    <>
      <PageHeader
        title="Daily Messages"
        subtitle="One short audio, video or text message from Raphael per day, delivered at each user’s chosen time"
        actions={
          <div className="flex items-center gap-2">
            <IconButton label="Previous month" variant="solid" size="md" onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft size={18} aria-hidden />
            </IconButton>
            <span className="min-w-36 text-center text-h3" aria-live="polite">
              {monthLabel(month)}
            </span>
            <IconButton label="Next month" variant="solid" size="md" onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight size={18} aria-hidden />
            </IconButton>
          </div>
        }
      />
      {data && missing.length ? (
        <p role="status" className="rounded-btn bg-warning/15 px-4 py-2.5 text-body text-warning">
          {missing.length === 1 ? `${dayTitle(missing[0]!)} has` : `${missing.length} of the next 7 days have`} no message the app can show.
          {month !== monthOf(today) ? '' : ' Click a day marked “Missing” to add one.'}
        </p>
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="flex flex-col gap-4">
          {error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : isPending ? (
            <SkeletonRows rows={5} label="Loading daily messages" />
          ) : (
            <>
              <div aria-hidden className="grid grid-cols-7 gap-2 px-1 text-xs font-semibold uppercase tracking-[0.8px] text-text-faint">
                {WEEKDAYS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <ol aria-label={`Days of ${monthLabel(month)}`} className="grid grid-cols-7 gap-2">
                {grid.map((d) => {
                  const m = byDate.get(d);
                  const st = dayState(d, m, today);
                  const style = STATE_STYLE[st.key]!;
                  const inMonth = monthOf(d) === month;
                  return (
                    <li key={d}>
                      <button
                        type="button"
                        aria-pressed={d === day}
                        aria-label={`${dayTitle(d)}${st.label ? `, ${st.label.toLowerCase()}` : ''}${m ? `, ${m.title}` : ''}`}
                        onClick={() => setSelected(d)}
                        className={cn(
                          'flex min-h-[104px] w-full flex-col gap-1 rounded-tile border border-t-[3px] border-border bg-input p-2 text-left',
                          style.bar,
                          d === day && 'border-ember bg-ember/10',
                          !inMonth && d !== day && 'border-dashed bg-transparent',
                        )}
                      >
                        <span className="tabular text-xs font-bold text-text-muted">{Number(d.slice(8))}</span>
                        {st.label ? (
                          <span className={cn('text-[10px] font-bold uppercase tracking-[0.6px]', style.text)}>{st.label}</span>
                        ) : null}
                        {m ? (
                          <span
                            className={cn('line-clamp-4 break-words text-xs leading-snug', inMonth ? 'text-text-body' : 'text-text-muted')}
                          >
                            {m.title}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
              <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                {LEGEND.map(([label, dot]) => (
                  <li key={label} className="flex items-center gap-1.5">
                    <span aria-hidden className={cn('size-2 rounded-full', dot)} />
                    {label}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        {isPending || error ? null : (
          <DayEditor
            key={day}
            date={day}
            today={today}
            message={byDate.get(day)}
            themes={themes}
            onSaved={cache.saved}
            onRemoved={cache.removed}
            onDuplicated={(row) => {
              cache.saved(row);
              setSelected(row.date);
              if (monthOf(row.date) !== month) setMonth(monthOf(row.date));
            }}
          />
        )}
      </div>
    </>
  );
}
