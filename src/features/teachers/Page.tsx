import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useChangedByOthers, useEditingPresence, useRecentChanges } from '../../hooks/useEntity';
import { useVersionedSave } from '../../hooks/useVersionedSave';
import { cn } from '../../lib/cn';
import { applyFieldErrors } from '../../lib/form-errors';
import { initials } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Checkbox } from '../../ui/Checkbox';
import { ConflictDialog, type ConflictField } from '../../ui/ConflictDialog';
import { ImagePicker } from '../../ui/ImagePicker';
import { Input, Textarea } from '../../ui/Input';
import { PageHeader } from '../../ui/PageHeader';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/States';
import { toast } from '../../ui/Toast';
import { useMedia, useMediaUpload } from '../media/api';
import {
  instagramHandle,
  teacherApi,
  teacherSchema,
  useTeacherCache,
  useTeachers,
  type Teacher,
  type TeacherInput,
  type TeacherValues,
} from './api';

const FIELDS: ConflictField<Teacher>[] = [
  { key: 'name', label: 'Display name' },
  { key: 'role', label: 'Role label' },
  { key: 'specialty', label: 'Specialty' },
  { key: 'youtubeUrl', label: 'YouTube' },
  { key: 'instagramUrl', label: 'Instagram' },
  { key: 'websiteUrl', label: 'Website' },
  { key: 'bio', label: 'Bio' },
  { key: 'quote', label: 'Signature quote' },
  { key: 'photoMediaId', label: 'Photo', format: (v) => (v ? 'A photo' : 'No photo') },
  { key: 'visible', label: 'Visible in app' },
  { key: 'canLeadGroup', label: 'Can lead group meditations' },
];

const blank: TeacherInput = {
  name: '', role: '', specialty: '', bio: '', quote: '', youtubeUrl: '', instagramUrl: '', websiteUrl: '', photoMediaId: null, visible: true, canLeadGroup: false,
}; // prettier-ignore

const toForm = (t: Teacher): TeacherInput => ({
  name: t.name,
  role: t.role ?? '',
  specialty: t.specialty ?? '',
  bio: t.bio ?? '',
  quote: t.quote ?? '',
  youtubeUrl: t.youtubeUrl ?? '',
  instagramUrl: instagramHandle(t.instagramUrl),
  websiteUrl: t.websiteUrl ?? '',
  photoMediaId: t.photoMediaId,
  visible: t.visible,
  canLeadGroup: t.canLeadGroup,
});

export const teacherStats = (t: Pick<Teacher, 'sessionCount'>) =>
  `${t.sessionCount} ${t.sessionCount === 1 ? 'meditation' : 'meditations'}`;

function Avatar({ teacher, size }: { teacher: Pick<Teacher, 'name' | 'photoMediaId' | 'photoUrl'>; size: 'sm' | 'lg' }) {
  const media = useMedia(teacher.photoMediaId);
  const src = media.data?.previewUrl ?? teacher.photoUrl;
  const box = size === 'sm' ? 'size-14 text-[17px]' : 'size-28 text-3xl';
  return src ? (
    <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', box)} />
  ) : (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full bg-teal font-bold text-teal-text', box)}>
      {initials(teacher.name) || '?'}
    </span>
  );
}

function TeacherEditor({ teacher, onCreated }: { teacher: Teacher | null; onCreated: (t: Teacher) => void }) {
  const cache = useTeacherCache();
  const { register, handleSubmit, reset, setValue, watch, setError, formState } = useForm<TeacherInput, unknown, TeacherValues>({
    resolver: zodResolver(teacherSchema),
    defaultValues: teacher ? toForm(teacher) : blank,
  });
  useEffect(() => reset(teacher ? toForm(teacher) : blank), [teacher?.id, teacher?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const others = useEditingPresence('teacher', teacher?.id);
  const { change, dismiss } = useChangedByOthers('teacher', teacher?.id);
  const photo = useMediaUpload({
    kind: 'image',
    mediaId: watch('photoMediaId'),
    onUploaded: (id) => setValue('photoMediaId', id, { shouldDirty: true }),
  });
  const [creating, setCreating] = useState(false);

  const onError = (e: unknown) => {
    const known = ['name', 'role', 'specialty', 'bio', 'quote', 'youtubeUrl', 'instagramUrl', 'websiteUrl'] as const;
    if (!applyFieldErrors(e, setError, known)) toast.apiError(e, 'Could not save the teacher.');
  };
  const edit = useVersionedSave<Teacher, TeacherValues>({
    save: (v, version) => teacherApi.update(teacher!.id, v, version),
    onSaved: (row) => {
      cache.saved(row);
      dismiss();
      toast.success('Teacher saved');
    },
    onError,
  });

  const submit = handleSubmit(async (v) => {
    if (teacher) return edit.save(v, teacher.version);
    setCreating(true);
    try {
      const row = await teacherApi.create(v);
      cache.added(row);
      toast.success('Teacher added');
      onCreated(row);
    } catch (e) {
      onError(e);
    } finally {
      setCreating(false);
    }
  });

  const e = formState.errors;
  const name = watch('name');
  return (
    <section aria-label={teacher ? 'Teacher profile' : 'New teacher'} className="rounded-card border border-border bg-surface p-6">
      <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
        <div className="flex flex-wrap items-center gap-5">
          <div className="w-28">
            <ImagePicker
              label="Photo"
              minSize={400}
              variant="avatar"
              value={photo.media?.previewUrl ?? teacher?.photoUrl ?? null}
              onChange={photo.start}
              disabled={photo.busy}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[1.2px] text-ember-text">
              {teacher ? 'Teacher profile' : 'New teacher'}
            </span>
            <h2 className="truncate text-2xl font-bold">{name || 'New teacher'}</h2>
            {teacher ? <span className="text-body text-text-muted">{teacherStats(teacher)}</span> : null}
            {photo.busy ? (
              <span role="status" className="text-sm text-text-muted">
                Uploading the photo…
              </span>
            ) : null}
            {photo.state.status === 'error' ? (
              <span role="alert" className="text-sm font-semibold text-danger-text">
                {photo.state.message}
              </span>
            ) : null}
          </div>
          <Button type="submit" loading={edit.saving || creating} disabled={photo.busy}>
            {teacher ? 'Save' : 'Add teacher'}
          </Button>
        </div>
        {others.length ? (
          <p role="status" className="rounded-input bg-info px-3 py-2 text-sm text-info-text">
            {others.join(', ')} {others.length === 1 ? 'is' : 'are'} editing this teacher too.
          </p>
        ) : null}
        {change ? (
          <p role="alert" className="rounded-input bg-warning/15 px-3 py-2 text-sm text-warning">
            {change.by?.name ?? 'Someone'} just saved this teacher. Saving now will ask which version to keep.
          </p>
        ) : null}
        <div className="grid gap-3.5 md:grid-cols-2">
          <Input label="Display name" size="sm" error={e.name?.message} className="[&_input]:h-11" {...register('name')} />
          <Input label="Role label" size="sm" error={e.role?.message} className="[&_input]:h-11" {...register('role')} />
          <Input label="Specialty" size="sm" error={e.specialty?.message} className="[&_input]:h-11" {...register('specialty')} />
          <Input
            label="YouTube"
            size="sm"
            placeholder="youtube.com/yourchannel"
            error={e.youtubeUrl?.message}
            className="[&_input]:h-11"
            {...register('youtubeUrl')}
          />
          <Input
            label="Instagram handle"
            size="sm"
            placeholder="@handle"
            error={e.instagramUrl?.message}
            className="[&_input]:h-11"
            {...register('instagramUrl')}
          />
          <Input
            label="Website"
            size="sm"
            placeholder="https://"
            error={e.websiteUrl?.message}
            className="[&_input]:h-11"
            {...register('websiteUrl')}
          />
        </div>
        <Textarea label="Bio" hint="Shown when people tap “Bio” on a program" rows={4} error={e.bio?.message} {...register('bio')} />
        <Input
          label="Signature quote"
          hint="Used on onboarding"
          size="sm"
          error={e.quote?.message}
          className="[&_input]:h-11"
          {...register('quote')}
        />
        <div className="flex flex-wrap gap-6">
          <Checkbox label="Visible in app" {...register('visible')} />
          <Checkbox label="Can lead group meditations" {...register('canLeadGroup')} />
        </div>
      </form>
      {teacher && edit.conflict ? (
        <ConflictDialog
          open
          mine={edit.conflict.mine}
          theirs={edit.conflict.theirs}
          fields={FIELDS}
          by={change?.by?.name}
          saving={edit.saving}
          onKeepMine={edit.keepMine}
          onTakeTheirs={() =>
            edit.takeTheirs((theirs) => {
              cache.saved(theirs);
              reset(toForm(theirs));
              dismiss();
            })
          }
        />
      ) : null}
    </section>
  );
}

/** 10 Teachers: the voices behind the meditations. */
export function TeachersPage() {
  const { data: teachers, isPending, error, refetch } = useTeachers();
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const recent = useRecentChanges('teacher');

  useEffect(() => {
    if (!teachers || selected === 'new') return;
    if (!selected || !teachers.some((t) => t.id === selected)) setSelected(teachers[0]?.id ?? 'new');
  }, [teachers, selected]);

  const current = teachers?.find((t) => t.id === selected) ?? null;
  return (
    <>
      <PageHeader
        title="Teachers"
        subtitle="Voices behind the meditations. Shown on meditation cards, programs and the teacher bio page."
        actions={
          <Button onClick={() => setSelected('new')}>
            <Plus size={16} aria-hidden />
            Add teacher
          </Button>
        }
      />
      {error ? (
        <Card padded={false}>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            {isPending ? (
              <div role="status" aria-label="Loading teachers" className="flex flex-col gap-3">
                <Skeleton className="h-[90px] rounded-card" />
                <Skeleton className="h-[90px] rounded-card" />
              </div>
            ) : (
              <ul aria-label="Teachers" className="flex flex-col gap-3">
                {teachers.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      aria-pressed={t.id === selected}
                      onClick={() => setSelected(t.id)}
                      className={cn(
                        'flex w-full items-center gap-3.5 rounded-card border p-4 text-left transition-colors duration-700',
                        t.id === selected ? 'border-ember bg-ember/10' : 'border-border bg-surface hover:border-border-strong',
                        recent.has(t.id) && t.id !== selected && 'bg-ember/10',
                      )}
                    >
                      <Avatar teacher={t} size="sm" />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-h3">{t.name}</span>
                        {t.role ? <span className="truncate text-sm font-semibold text-ember-text">{t.role}</span> : null}
                        <span className="text-xs text-text-muted">
                          {teacherStats(t)}
                          {t.visible ? '' : ' · hidden'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="rounded-[14px] border border-dashed border-outline p-4 text-sm text-text-muted">
              Only one teacher at launch? Keep one teacher and the app hides the teacher filter by itself.
            </p>
          </div>
          {isPending || selected === null ? (
            <Skeleton className="h-[560px] rounded-card" />
          ) : (
            <TeacherEditor key={selected ?? 'none'} teacher={current} onCreated={(t) => setSelected(t.id)} />
          )}
        </div>
      )}
    </>
  );
}
