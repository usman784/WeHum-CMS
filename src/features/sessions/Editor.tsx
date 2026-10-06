import { zodForm } from '../../lib/zod-form';
import { AudioLines, Film, Youtube } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { useChangedByOthers, useEditingPresence } from '../../hooks/useEntity';
import { useCan } from '../../hooks/useRole';
import { useVersionedSave } from '../../hooks/useVersionedSave';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { applyFieldErrors, errorMessage } from '../../lib/form-errors';
import { formatDate, formatDateTime, formatDuration } from '../../lib/format';
import { Badge, StatusText } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card, SectionCard } from '../../ui/Card';
import { ConflictDialog, type ConflictField } from '../../ui/ConflictDialog';
import { ConfirmDialog } from '../../ui/Dialog';
import { FileDrop } from '../../ui/FileDrop';
import { ImagePicker } from '../../ui/ImagePicker';
import { Input, Textarea } from '../../ui/Input';
import { Menu } from '../../ui/Menu';
import { AuditStamp, PageHeader } from '../../ui/PageHeader';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/States';
import { Switch } from '../../ui/Switch';
import { toast } from '../../ui/Toast';
import { Tooltip } from '../../ui/Tooltip';
import { FILE_RULES, useMediaUpload } from '../media/api';
import { useTeachers } from '../teachers/api';
import { useThemes } from '../themes/api';
import {
  blankSession, changedBody, publishBlocker, sessionApi, sessionSchema, sessionToForm, toBody, useSession, useSessionCache,
  type Session, type SessionDetail, type SessionInput, type SessionType, type SessionValues, type YoutubeInfo,
} from './api'; // prettier-ignore
import { lengthLabel, STATUS } from './display';

const TYPES: { value: SessionType; label: string; sub: string; icon: typeof Film }[] = [
  { value: 'audio', label: 'Audio', sub: 'Upload a finished MP3, WAV or M4A', icon: AudioLines },
  { value: 'video', label: 'Video', sub: 'Upload a finished MP4', icon: Film },
  { value: 'youtube', label: 'YouTube link', sub: 'Free for you · paste a link', icon: Youtube },
];

const FIELDS: ConflictField<Session>[] = [
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Short description' },
  { key: 'type', label: 'Type' },
  { key: 'access', label: 'Access', format: (v) => (v === 'premium' ? 'Premium' : 'Free') },
  { key: 'themeId', label: 'Theme', format: (v) => (v ? 'A theme' : 'None') },
  { key: 'teacherId', label: 'Teacher', format: (v) => (v ? 'A teacher' : 'None') },
  { key: 'tags', label: 'Tags' },
  { key: 'mediaId', label: 'File', format: (v) => (v ? 'A file' : 'No file') },
  { key: 'youtubeId', label: 'YouTube video' },
  { key: 'coverMediaId', label: 'Cover', format: (v) => (v ? 'A cover' : 'No cover') },
  { key: 'downloadable', label: 'Members can download' },
  { key: 'sosFeeling', label: 'SoS feeling' },
  { key: 'sosSubtitle', label: 'SoS subtitle' },
];

/** `<input type="datetime-local">` value (the admin's own time zone) for a moment `mins` from now, rounded to 5 min. */
const localInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const inMinutes = (mins: number) => {
  const d = new Date(Date.now() + mins * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return localInput(d);
};

function Banner({ tone, children }: { tone: 'info' | 'warning'; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'warning' ? 'alert' : 'status'}
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-btn px-4 py-2.5 text-body',
        tone === 'info' ? 'bg-info text-info-text' : 'bg-warning/15 text-warning',
      )}
    >
      {children}
    </p>
  );
}

type FormProps = { session: SessionDetail | null };

function SessionForm({ session }: FormProps) {
  const navigate = useNavigate();
  const cache = useSessionCache();
  const canDelete = useCan('content.delete');
  const themes = useThemes();
  const teachers = useTeachers();
  const { register, handleSubmit, reset, setValue, getValues, watch, setError, trigger, formState } = useForm<
    SessionInput,
    unknown,
    SessionValues
  >({
    resolver: zodForm(sessionSchema),
    defaultValues: session ? sessionToForm(session) : blankSession,
  });
  const e = formState.errors;
  const dirty = formState.isDirty;
  const type = watch('type');
  const access = watch('access');
  const description = watch('description');
  const [mediaId, youtubeId, coverMediaId, coverUrl] = watch(['mediaId', 'youtubeId', 'coverMediaId', 'coverUrl']);

  const others = useEditingPresence('session', session?.id);
  const { change, dismiss } = useChangedByOthers('session', session?.id);

  // The server row changed under us (saved here, or reloaded): show it, unless there are unsaved edits.
  // Unsaved edits are never replaced on their own: then the banner below offers "Reload their version".
  const loaded = useRef(session?.version);
  const forceReload = useRef(false);
  const [reloads, setReloads] = useState(0);
  useEffect(() => {
    if (session && session.version !== loaded.current && (!dirty || forceReload.current)) {
      loaded.current = session.version;
      forceReload.current = false;
      reset(sessionToForm(session));
    }
  }, [session, reset, dirty, reloads]);

  // Unsaved changes: the browser asks before the tab is closed or reloaded.
  useEffect(() => {
    if (!dirty) return;
    const warn = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ── file (audio / video) and cover
  const file = useMediaUpload({
    kind: type === 'video' ? 'video' : 'audio',
    mediaId: type === 'youtube' ? null : mediaId,
    onUploaded: (id) => setValue('mediaId', id, { shouldDirty: true }),
    onReady: (m) => m.durationSec && setValue('durationSec', m.durationSec, { shouldDirty: true }),
  });
  const cover = useMediaUpload({
    kind: 'image',
    mediaId: coverMediaId,
    onUploaded: (id) => setValue('coverMediaId', id, { shouldDirty: true }),
  });
  const loudness = file.media?.job?.result?.loudnessWarning;

  // ── YouTube
  const [link, setLink] = useState(session?.youtubeId ? `https://www.youtube.com/watch?v=${session.youtubeId}` : '');
  const [yt, setYt] = useState<YoutubeInfo | null>(null);
  const [ytError, setYtError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const resolve = async (url: string) => {
    if (!url.trim()) return;
    setResolving(true);
    setYtError(null);
    try {
      const info = await sessionApi.resolveYoutube(url.trim());
      setYt(info);
      setValue('youtubeId', info.youtubeId, { shouldDirty: true });
      if (info.durationSec) setValue('durationSec', info.durationSec, { shouldDirty: true });
      if (!getValues('coverMediaId')) setValue('coverUrl', info.thumbnailUrl, { shouldDirty: true });
      if (!getValues('title').trim() && info.title) setValue('title', info.title.slice(0, 120), { shouldDirty: true });
    } catch (err) {
      setYt(null);
      setValue('youtubeId', null, { shouldDirty: true });
      setYtError(errorMessage(err, 'This link could not be checked.'));
    } finally {
      setResolving(false);
    }
  };

  // ── saving
  const known = ['title', 'description', 'tags', 'sosFeeling', 'sosSubtitle'] as const;
  const onError = (err: unknown) => {
    if (!applyFieldErrors(err, setError, known)) toast.apiError(err, 'Could not save.');
  };
  const edit = useVersionedSave<Session, ReturnType<typeof changedBody>>({
    save: (changes, version) => sessionApi.update(session!.id, changes, version),
    onSaved: (row) => {
      loaded.current = row.version;
      cache.saved(row);
      reset(sessionToForm(row));
      dismiss();
    },
    onError,
  });
  const [working, setWorking] = useState<null | 'save' | 'publish' | 'schedule' | 'archive'>(null);

  /** Save what is in the form and return the saved row (creating the draft first when it is new). Null = it did not save. */
  const persist = async (): Promise<Session | null> => {
    if (!(await trigger())) return null;
    let out: Session | null = null;
    await handleSubmit(async (v) => {
      try {
        if (!session) out = await sessionApi.create({ ...toBody(v), title: v.title, type: v.type });
        else if (dirty)
          out = await edit.saveAsync(changedBody(v, formState.dirtyFields), loaded.current ?? session.version); // the version my form was based on, so a newer server row gives a 409
        else out = session;
      } catch (err) {
        if (!session) onError(err); // edits: useVersionedSave already handled it (toast or conflict dialog)
      }
    })();
    return out;
  };

  const saveDraft = async () => {
    setWorking('save');
    const row = await persist();
    setWorking(null);
    if (!row) return;
    toast.success(session ? 'Saved' : 'Draft created');
    if (!session) {
      await cache.changed();
      navigate(`/sessions/${row.id}`, { replace: true });
    }
  };

  const after = async (verb: 'publish' | 'schedule' | 'archive', call: (row: Session) => Promise<Session>, done: string) => {
    setWorking(verb);
    try {
      const row = verb === 'archive' ? session : await persist();
      if (!row) return;
      const next = await call(row);
      loaded.current = next.version;
      cache.saved(next);
      reset(sessionToForm(next));
      toast.success(done);
      if (!session) navigate(`/sessions/${next.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'IN_USE') {
        const dates = (err.details as { motdDates?: string[] } | undefined)?.motdDates;
        toast.error(err.message, dates?.length ? `Dates: ${dates.map((d) => formatDate(d, 'UTC')).join(', ')}` : undefined);
      } else toast.apiError(err, `Could not ${verb}.`);
      if (session) await cache.changed(); // the draft part may have been saved: show the true state
    } finally {
      setWorking(null);
    }
  };

  const [when, setWhen] = useState(() => inMinutes(60));
  const [confirmNow, setConfirmNow] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const schedule = () => {
    const at = new Date(when);
    if (Number.isNaN(at.getTime())) return toast.error('Pick a date and time.');
    if (at.getTime() < Date.now() + 60_000) return setConfirmNow(true); // spec §10: a time in the past → "Publish now?"
    void after('schedule', (row) => sessionApi.schedule(row.id, at.toISOString(), row.version), `Scheduled for ${formatDateTime(at)}`);
  };
  const publish = () => void after('publish', (row) => sessionApi.publish(row.id, row.version), 'Published');

  const status = session?.status ?? 'draft';
  const blocker = publishBlocker({ type, mediaId, youtubeId }, file.media?.status === 'ready', file.busy);
  const busy = working !== null || edit.saving;
  const title = watch('title');

  return (
    <>
      <PageHeader
        backTo="/sessions"
        backLabel="Back to sessions"
        overline={session ? 'Sessions · Edit' : 'Sessions · New'}
        title={title.trim() || 'New session'}
        badge={session ? <StatusText tone={STATUS[status].tone}>{STATUS[status].label}</StatusText> : undefined}
        actions={
          <>
            {session ? <AuditStamp verb={dirty ? 'Unsaved changes · last saved' : 'Saved'} at={session.updatedAt} /> : null}
            <Button
              variant="outline"
              onClick={() => void saveDraft()}
              loading={working === 'save'}
              disabled={busy || (!!session && !dirty)}
            >
              {session ? 'Save' : 'Save draft'}
            </Button>
            {status === 'live' ? null : (
              <Tooltip content={blocker}>
                {/* A disabled button cannot be focused: the wrapper lets keyboard users read why. */}
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                <span tabIndex={blocker ? 0 : -1} className="inline-flex rounded-btn">
                  <Button onClick={publish} loading={working === 'publish'} disabled={busy || !!blocker}>
                    Publish
                  </Button>
                </span>
              </Tooltip>
            )}
            {session ? (
              <Menu
                label="More actions"
                items={[
                  {
                    key: 'dup',
                    label: 'Duplicate',
                    onSelect: () =>
                      void sessionApi.duplicate(session.id).then(
                        (copy) => {
                          toast.success('Duplicated as a draft');
                          navigate(`/sessions/${copy.id}`);
                        },
                        (err: unknown) => toast.apiError(err, 'Could not duplicate.'),
                      ),
                  },
                  ...(status !== 'archived'
                    ? [
                        {
                          key: 'arch',
                          label: 'Archive',
                          onSelect: () => void after('archive', (row) => sessionApi.archive(row.id, row.version), 'Archived'),
                        },
                      ]
                    : []),
                  ...(canDelete && status === 'draft'
                    ? [{ key: 'del', label: 'Delete draft', danger: true, onSelect: () => setConfirmDelete(true) }]
                    : []),
                ]}
              />
            ) : null}
          </>
        }
      />

      {others.length ? (
        <Banner tone="info">
          {others.join(', ')} {others.length === 1 ? 'is' : 'are'} editing this session too.
        </Banner>
      ) : null}
      {change ? (
        <Banner tone="warning">
          <span className="flex-1">This session changed: {change.by?.name ?? 'someone'} saved it. Your unsaved edits are still here.</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              forceReload.current = true; // the admin chose their version over the unsaved edits
              setReloads((n) => n + 1);
              void cache.changed();
              dismiss();
            }}
          >
            Reload their version
          </Button>
        </Banner>
      ) : null}

      <form
        noValidate
        onSubmit={(ev) => ev.preventDefault()}
        className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
      >
        <div className="flex flex-col gap-5">
          <SectionCard title="What is it?" className="gap-4 p-[22px]">
            <div role="radiogroup" aria-label="Session type" className="grid gap-2.5 sm:grid-cols-3">
              {TYPES.map((t) => {
                const on = t.value === type;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    // A published meditation keeps its type: changing it would swap what members are playing.
                    disabled={status === 'live' && !on}
                    onClick={() => {
                      setValue('type', t.value, { shouldDirty: true });
                      if (t.value === 'youtube') setValue('access', 'free', { shouldDirty: true });
                    }}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-[14px] border p-3.5 text-left disabled:cursor-not-allowed disabled:opacity-50',
                      on ? 'border-ember bg-ember/10' : 'border-border-strong bg-input hover:border-outline',
                    )}
                  >
                    <span className="flex items-center gap-2 text-[15px] font-bold">
                      <t.icon size={16} aria-hidden />
                      {t.label}
                    </span>
                    <span className="text-xs text-text-muted">{t.sub}</span>
                  </button>
                );
              })}
            </div>

            {type === 'youtube' ? (
              <>
                <div className="flex items-end gap-2.5">
                  <Input
                    label="YouTube link"
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=…"
                    value={link}
                    onChange={(ev) => setLink(ev.target.value)}
                    onBlur={() => link.trim() && !yt && void resolve(link)}
                    onPaste={(ev) => void resolve(ev.clipboardData.getData('text'))}
                    error={ytError ?? undefined}
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" className="h-[46px]" loading={resolving} onClick={() => void resolve(link)}>
                    Check link
                  </Button>
                </div>
                {yt || youtubeId ? (
                  <div className="flex items-center gap-3.5 rounded-[14px] border border-border-strong bg-input p-3.5">
                    {(yt?.thumbnailUrl ?? coverUrl) ? (
                      <img
                        src={yt?.thumbnailUrl ?? coverUrl ?? ''}
                        alt=""
                        className="h-[68px] w-[120px] shrink-0 rounded-input object-cover"
                      />
                    ) : null}
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-body font-semibold">{yt?.title ?? title}</span>
                      <span className="text-xs text-text-muted">
                        {yt
                          ? `Title${yt.durationSec ? ', length' : ''} and thumbnail filled from YouTube${yt.durationSec ? ` · ${formatDuration(yt.durationSec)}` : ''}`
                          : `Video ${youtubeId}`}
                      </span>
                    </div>
                  </div>
                ) : null}
                {yt && !yt.durationSec ? (
                  <Input
                    label="Length in minutes"
                    hint="YouTube did not tell us"
                    inputMode="numeric"
                    size="sm"
                    className="max-w-48"
                    defaultValue={session?.durationSec ? Math.round(session.durationSec / 60) : ''}
                    onChange={(ev) => {
                      const min = Number(ev.target.value);
                      setValue('durationSec', Number.isFinite(min) && min > 0 ? Math.round(min * 60) : null, { shouldDirty: true });
                    }}
                  />
                ) : null}
                <p className="text-sm text-text-muted">
                  Online-library meditations are always free and show as “Free for you” to free users. Members see them without a free
                  label. Only the videos you add here appear in the app.
                </p>
              </>
            ) : (
              <>
                <FileDrop
                  label={type === 'video' ? 'Video file' : 'Audio file'}
                  hint={type === 'video' ? 'MP4 or MOV · up to 2 GB' : 'MP3, WAV or M4A · up to 500 MB'}
                  rule={FILE_RULES[type === 'video' ? 'video' : 'audio']}
                  state={file.state}
                  onFiles={([f]) => f && file.start(f)}
                  onPause={file.pause}
                  onResume={file.resume}
                  onCancel={file.cancel}
                  onRetry={file.retry}
                  icon={type === 'video' ? <Film size={22} aria-hidden /> : <AudioLines size={22} aria-hidden />}
                />
                {file.duplicateOf ? (
                  <Banner tone="warning">
                    The same file is already in the library{file.duplicateOf.name ? ` as “${file.duplicateOf.name}”` : ''}. You can still
                    use this upload.
                  </Banner>
                ) : null}
                {loudness ? <Banner tone="warning">{loudness}. It will sound louder or quieter than other meditations.</Banner> : null}
                <p className="text-sm text-text-muted">Upload the finished, edited file. Nothing is mixed or edited here.</p>
              </>
            )}
          </SectionCard>

          <SectionCard title="Details" className="gap-4 p-[22px]">
            <Input label="Title" error={e.title?.message} {...register('title')} />
            <Textarea
              label="Short description"
              hint="Shown on the session page"
              rows={2}
              maxLength={160}
              error={e.description?.message}
              {...register('description')}
              value={description}
            />
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Select
                label="Theme"
                placeholder="No theme"
                options={(themes.data ?? []).map((t) => ({ value: t.id, label: t.visible ? t.name : `${t.name} (hidden)` }))}
                {...register('themeId')}
              />
              <Select
                label="Teacher"
                placeholder="No teacher"
                options={(teachers.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
                {...register('teacherId')}
              />
            </div>
            <Input
              label="Tags"
              hint="comma separated, up to 12"
              placeholder="work stress, morning"
              error={e.tags?.message}
              {...register('tags')}
            />
          </SectionCard>

          <SectionCard
            title="SoS"
            description="Used when this meditation is a tile on the “How can I help?” screen."
            className="gap-4 p-[22px]"
          >
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Input label="Feeling" placeholder="Panic" size="sm" error={e.sosFeeling?.message} {...register('sosFeeling')} />
              <Input
                label="Subtitle"
                placeholder="Grounding in four minutes"
                size="sm"
                error={e.sosSubtitle?.message}
                {...register('sosSubtitle')}
              />
            </div>
            {session?.isSos ? <p className="text-sm text-text-muted">This meditation is on the SoS screen now.</p> : null}
          </SectionCard>
        </div>

        <div className="flex flex-col gap-5">
          <SectionCard title="Cover image" className="p-[22px]">
            <ImagePicker
              label="Session cover"
              value={cover.media?.previewUrl ?? session?.cover?.url ?? coverUrl}
              note={type === 'youtube' && !coverMediaId && coverUrl ? 'Uses the YouTube thumbnail (you can replace it)' : undefined}
              onChange={cover.start}
              disabled={cover.busy}
            />
            {cover.busy ? (
              <span role="status" className="text-sm text-text-muted">
                Uploading the cover…
              </span>
            ) : null}
            {cover.state.status === 'error' ? (
              <span role="alert" className="text-sm font-semibold text-danger-text">
                {cover.state.message}
              </span>
            ) : null}
          </SectionCard>

          <SectionCard title="Access" className="p-[22px]">
            {type === 'youtube' ? (
              <p className="text-body text-text-body">Free for everyone. No download needed.</p>
            ) : (
              <>
                <Segmented
                  label="Access level"
                  value={access}
                  onChange={(v) => setValue('access', v, { shouldDirty: true })}
                  options={[
                    { value: 'free', label: 'Free' },
                    { value: 'premium', label: 'Premium' },
                  ]}
                />
                <Switch
                  label="Members can download"
                  checked={watch('downloadable')}
                  onCheckedChange={(v) => setValue('downloadable', v, { shouldDirty: true })}
                />
              </>
            )}
          </SectionCard>

          <SectionCard
            title="Publishing"
            className="p-[22px]"
            action={
              session ? (
                <Badge tone={status === 'live' ? 'success' : status === 'scheduled' ? 'teal' : 'neutral'}>{STATUS[status].label}</Badge>
              ) : undefined
            }
          >
            {status === 'live' ? (
              <p className="text-body text-text-body">
                In the library since {session?.publishAt ? formatDateTime(session.publishAt) : 'now'}.
              </p>
            ) : (
              <>
                {status === 'scheduled' && session?.publishAt ? (
                  <p className="text-body text-text-body">Goes live on {formatDateTime(session.publishAt)} (your time).</p>
                ) : null}
                <div className="flex items-end gap-2.5">
                  <Input
                    label="Show in the library from"
                    hint="your time"
                    type="datetime-local"
                    size="sm"
                    value={when}
                    onChange={(ev) => setWhen(ev.target.value)}
                    className="flex-1"
                  />
                  <Tooltip content={blocker}>
                    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                    <span tabIndex={blocker ? 0 : -1} className="inline-flex rounded-btn">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={schedule}
                        loading={working === 'schedule'}
                        disabled={busy || !!blocker}
                      >
                        {status === 'scheduled' ? 'Reschedule' : 'Schedule'}
                      </Button>
                    </span>
                  </Tooltip>
                </div>
              </>
            )}
            {session ? (
              <dl className="flex flex-col text-body">
                <div className="flex min-h-10 items-center justify-between gap-3 border-t border-border">
                  <dt>Length</dt>
                  <dd className="tabular text-text-muted">{lengthLabel(session.durationSec)}</dd>
                </div>
                <div className="flex min-h-10 items-center justify-between gap-3 border-t border-border">
                  <dt>Meditation of the Day on</dt>
                  <dd className="text-right text-text-muted">
                    {session.usage.motdDates.length ? session.usage.motdDates.map((d) => formatDate(d, 'UTC')).join(', ') : 'Not planned'}
                  </dd>
                </div>
                <div className="flex min-h-10 items-center justify-between gap-3 border-t border-border">
                  <dt>Used in programs</dt>
                  <dd className="text-right text-text-muted">
                    {session.usage.programs.length ? session.usage.programs.map((p) => `${p.title} · Day ${p.day}`).join(', ') : 'None'}
                  </dd>
                </div>
                <div className="flex min-h-10 items-center justify-between gap-3 border-t border-border">
                  <dt>Dedications</dt>
                  <dd>
                    <Link to={`/moderation?session=${session.id}`} className="font-semibold text-ember-text hover:text-ember-soft">
                      {session.usage.dedications} · view
                    </Link>
                  </dd>
                </div>
              </dl>
            ) : null}
          </SectionCard>
        </div>
      </form>

      {session && edit.conflict ? (
        <ConflictDialog
          open
          mine={edit.conflict.mine as Partial<Session>}
          theirs={edit.conflict.theirs}
          fields={FIELDS}
          by={change?.by?.name}
          saving={edit.saving}
          onKeepMine={edit.keepMine}
          onTakeTheirs={() =>
            edit.takeTheirs((theirs) => {
              loaded.current = theirs.version;
              cache.saved(theirs);
              reset(sessionToForm(theirs));
              dismiss();
            })
          }
        />
      ) : null}
      <ConfirmDialog
        open={confirmNow}
        onOpenChange={setConfirmNow}
        title="Publish now?"
        description="That time has already passed. Publishing now makes the meditation visible in the app right away."
        confirmLabel="Publish now"
        onConfirm={() => {
          setConfirmNow(false);
          publish();
        }}
      />
      {session ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          danger
          title={`Delete the draft “${session.title}”?`}
          description="This cannot be undone."
          confirmLabel="Delete draft"
          onConfirm={() =>
            void sessionApi.remove(session.id).then(
              async () => {
                toast.success('Draft deleted');
                await cache.changed();
                navigate('/sessions', { replace: true });
              },
              (err: unknown) => {
                setConfirmDelete(false);
                toast.apiError(err, 'Could not delete the draft.');
              },
            )
          }
        />
      ) : null}
    </>
  );
}

/** 04 Session editor: `/sessions/new` and `/sessions/:id`. */
export function SessionEditorPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const q = useSession(isNew ? undefined : id);

  if (isNew) return <SessionForm key="new" session={null} />;
  if (q.isPending) {
    return (
      <div role="status" aria-label="Loading session" className="flex flex-col gap-5">
        <Skeleton className="h-11 w-80" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Skeleton className="h-[520px] rounded-card" />
          <Skeleton className="h-[520px] rounded-card" />
        </div>
      </div>
    );
  }
  if (q.isError) {
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return (
      <>
        <PageHeader backTo="/sessions" backLabel="Back to sessions" title={missing ? 'Session not found' : 'Session'} />
        <Card padded={false}>
          <ErrorState
            error={q.error}
            title={missing ? 'This session does not exist any more' : undefined}
            onRetry={missing ? undefined : () => void q.refetch()}
          />
        </Card>
      </>
    );
  }
  return <SessionForm key={q.data.id} session={q.data} />;
}
