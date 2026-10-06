import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { useChangedByOthers, useEditingPresence, useRecentChanges } from '../../hooks/useEntity';
import { useVersionedSave } from '../../hooks/useVersionedSave';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { applyFieldErrors } from '../../lib/form-errors';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ConflictDialog, type ConflictField } from '../../ui/ConflictDialog';
import { ConfirmDialog } from '../../ui/Dialog';
import { DragList } from '../../ui/DragList';
import { Input, Textarea } from '../../ui/Input';
import { PageHeader } from '../../ui/PageHeader';
import { Select } from '../../ui/Select';
import { Skeleton } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { Switch } from '../../ui/Switch';
import { toast } from '../../ui/Toast';
import { themeApi, themeSchema, useReorderThemes, useThemeCache, useThemes, type Theme, type ThemeInput, type ThemeValues } from './api';
import { THEME_ICONS, ThemeIcon } from './icons';

const minutes = (sec: number) => Math.max(1, Math.round(sec / 60));
/** "14 meditations · 20–45 min" */
export function themeStats(t: Pick<Theme, 'sessionCount' | 'minDurationSec' | 'maxDurationSec'>) {
  const count = `${t.sessionCount} ${t.sessionCount === 1 ? 'meditation' : 'meditations'}`;
  if (!t.sessionCount || t.minDurationSec === null || t.maxDurationSec === null) return count;
  const [a, b] = [minutes(t.minDurationSec), minutes(t.maxDurationSec)];
  return `${count} · ${a === b ? a : `${a}–${b}`} min`;
}

const FIELDS: ConflictField<Theme>[] = [
  { key: 'name', label: 'Name' },
  { key: 'subtitle', label: 'Subtitle' },
  { key: 'description', label: 'Description' },
  { key: 'iconKey', label: 'Icon' },
  { key: 'visible', label: 'Visible in app' },
];

const blank: ThemeInput = { name: '', subtitle: '', description: '', iconKey: THEME_ICONS[0].key, visible: true };
const toForm = (t: Theme): ThemeInput => ({
  name: t.name,
  subtitle: t.subtitle ?? '',
  description: t.description ?? '',
  iconKey: t.iconKey,
  visible: t.visible,
});

type EditorProps = { theme: Theme | null; themes: Theme[]; onCreated: (t: Theme) => void; onDeleted: () => void };

/** Right-hand editor (design: Disciplines.dc.html "Edit theme"). `theme === null` creates a new one. */
function ThemeEditor({ theme, themes, onCreated, onDeleted }: EditorProps) {
  const cache = useThemeCache();
  const { register, handleSubmit, reset, setValue, watch, setError, formState } = useForm<ThemeInput, unknown, ThemeValues>({
    resolver: zodResolver(themeSchema),
    defaultValues: theme ? toForm(theme) : blank,
  });
  // Another theme was picked, or this one was saved: show its saved values.
  useEffect(() => reset(theme ? toForm(theme) : blank), [theme?.id, theme?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const others = useEditingPresence('theme', theme?.id);
  const { change, dismiss } = useChangedByOthers('theme', theme?.id);
  const [deleting, setDeleting] = useState(false);
  const [reassignTo, setReassignTo] = useState('');
  const [removing, setRemoving] = useState(false);

  const onError = (e: unknown) => {
    if (!applyFieldErrors(e, setError, ['name', 'subtitle', 'description'])) toast.apiError(e, 'Could not save the theme.');
  };
  const edit = useVersionedSave<Theme, ThemeValues>({
    save: (v, version) => themeApi.update(theme!.id, v, version),
    onSaved: (row) => {
      cache.saved(row);
      dismiss();
      toast.success('Theme saved');
    },
    onError,
  });
  const [creating, setCreating] = useState(false);

  const submit = handleSubmit(async (v) => {
    if (theme) return edit.save(v, theme.version);
    setCreating(true);
    try {
      const row = await themeApi.create(v);
      cache.added(row);
      toast.success('Theme created');
      onCreated(row);
    } catch (e) {
      onError(e);
    } finally {
      setCreating(false);
    }
  });

  const remove = async () => {
    if (!theme) return;
    setRemoving(true);
    try {
      await themeApi.remove(theme.id, reassignTo || undefined);
      await cache.refresh();
      toast.success('Theme deleted');
      setDeleting(false);
      onDeleted();
    } catch (e) {
      // The count changed since the list was loaded: the dialog now asks where to move them.
      if (e instanceof ApiError && e.code === 'IN_USE') await cache.refresh();
      toast.apiError(e, 'Could not delete the theme.');
    } finally {
      setRemoving(false);
    }
  };

  const iconKey = watch('iconKey');
  const visible = watch('visible');
  const targets = themes.filter((t) => t.id !== theme?.id);
  const needsTarget = !!theme && theme.sessionCount > 0;

  return (
    <aside aria-label={theme ? 'Edit theme' : 'New theme'} className="rounded-card border border-border bg-surface p-[22px]">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-[1.2px] text-ember-text">{theme ? 'Edit theme' : 'New theme'}</span>
          <h2 className="text-xl font-bold">{theme ? theme.name : 'Untitled theme'}</h2>
          {theme ? <span className="text-sm text-text-muted">{themeStats(theme)}</span> : null}
        </div>
        {others.length ? (
          <p role="status" className="rounded-input bg-info px-3 py-2 text-sm text-info-text">
            {others.join(', ')} {others.length === 1 ? 'is' : 'are'} editing this theme too.
          </p>
        ) : null}
        {change ? (
          <p role="alert" className="rounded-input bg-warning/15 px-3 py-2 text-sm text-warning">
            {change.by?.name ?? 'Someone'} just saved this theme. Saving now will ask which version to keep.
          </p>
        ) : null}
        <Input label="Name" size="sm" error={formState.errors.name?.message} className="[&_input]:h-11" {...register('name')} />
        <Input label="Subtitle" size="sm" error={formState.errors.subtitle?.message} className="[&_input]:h-11" {...register('subtitle')} />
        <Textarea
          label="Description"
          hint="Shown at the top of the theme page"
          error={formState.errors.description?.message}
          {...register('description')}
        />
        <div role="radiogroup" aria-label="Icon" className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-text-soft" aria-hidden>
            Icon
          </span>
          <div className="grid grid-cols-6 gap-1.5">
            {THEME_ICONS.map((ic) => {
              const on = ic.key === iconKey;
              return (
                <button
                  key={ic.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={ic.name}
                  title={ic.name}
                  onClick={() => setValue('iconKey', ic.key, { shouldDirty: true })}
                  className={cn(
                    'flex h-11 items-center justify-center rounded-input border',
                    on ? 'border-ember bg-ember/15 text-ember-text' : 'border-border-strong bg-input text-text-soft hover:border-outline',
                  )}
                >
                  <ThemeIcon iconKey={ic.key} size={20} />
                </button>
              );
            })}
          </div>
        </div>
        <Switch
          label="Visible in app"
          description="Hidden themes and their meditations leave the Library."
          checked={visible}
          onCheckedChange={(v) => setValue('visible', v, { shouldDirty: true })}
        />
        <div className="flex gap-2.5">
          {theme ? (
            <Link
              to={`/sessions?theme=${theme.id}`}
              className="flex h-11 flex-1 items-center justify-center rounded-btn border border-outline text-body font-semibold hover:bg-surface-alt"
            >
              View {theme.sessionCount} {theme.sessionCount === 1 ? 'meditation' : 'meditations'}
            </Link>
          ) : null}
          <Button type="submit" className="flex-1" loading={edit.saving || creating}>
            {theme ? 'Save' : 'Create theme'}
          </Button>
        </div>
        {theme ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start text-danger-text hover:text-danger-text"
            onClick={() => setDeleting(true)}
          >
            Delete theme
          </Button>
        ) : null}
      </form>

      {theme && edit.conflict ? (
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

      {theme ? (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          danger
          title={`Delete “${theme.name}”?`}
          description={
            needsTarget
              ? `${theme.sessionCount} ${theme.sessionCount === 1 ? 'meditation uses' : 'meditations use'} this theme. Choose the theme to move ${theme.sessionCount === 1 ? 'it' : 'them'} to.`
              : 'No meditation uses this theme. This cannot be undone.'
          }
          confirmLabel={needsTarget ? 'Move and delete' : 'Delete theme'}
          loading={removing}
          onConfirm={() => {
            if (needsTarget && !reassignTo) return toast.error('Choose a theme to move the meditations to.');
            void remove();
          }}
        >
          {needsTarget ? (
            <Select
              label="Move meditations to"
              placeholder="Choose a theme"
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
              options={targets.map((t) => ({ value: t.id, label: t.name }))}
            />
          ) : null}
        </ConfirmDialog>
      ) : null}
    </aside>
  );
}

/** 09 Themes: the Library's categories, in app order. */
export function ThemesPage() {
  const { data: themes, isPending, error, refetch } = useThemes();
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const recent = useRecentChanges('theme');
  const reorder = useReorderThemes((e) => toast.apiError(e, 'Could not save the new order.'));

  // Open the first theme once the list is there; keep the selection valid when a theme disappears.
  useEffect(() => {
    if (!themes) return;
    if (selected === 'new') return;
    if (!selected || !themes.some((t) => t.id === selected)) setSelected(themes[0]?.id ?? 'new');
  }, [themes, selected]);

  const current = themes?.find((t) => t.id === selected) ?? null;

  return (
    <>
      <PageHeader
        title="Themes"
        subtitle={
          themes
            ? `The ${themes.length} practice ${themes.length === 1 ? 'category' : 'categories'} in the Library. Drag a card to change its place; the app shows them in this order.`
            : 'The practice categories in the Library.'
        }
        actions={
          <Button onClick={() => setSelected('new')}>
            <Plus size={16} aria-hidden />
            New theme
          </Button>
        }
      />
      {error ? (
        <Card padded={false}>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          {isPending ? (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2" role="status" aria-label="Loading themes">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-[86px] rounded-card" />
              ))}
            </div>
          ) : themes.length === 0 ? (
            <Card padded={false}>
              <EmptyState
                title="No themes yet"
                description="Create the first theme. Meditations are grouped by theme in the app's Library."
              />
            </Card>
          ) : (
            <DragList
              label="Theme order"
              layout="grid"
              className="grid grid-cols-1 gap-3.5 md:grid-cols-2"
              items={themes}
              itemKey={(t) => t.id}
              itemLabel={(t) => t.name}
              disabled={reorder.isPending}
              onReorder={(next) => reorder.mutate(next)}
              itemClassName="" // the card inside draws its own border
              renderItem={(t, i) => (
                <button
                  type="button"
                  aria-pressed={t.id === selected}
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    'flex w-full items-center gap-3.5 rounded-card border p-[18px] text-left transition-colors duration-700',
                    t.id === selected ? 'border-ember bg-ember/10' : 'border-border bg-surface hover:border-border-strong',
                    recent.has(t.id) && t.id !== selected && 'bg-ember/10',
                  )}
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-tile border border-border-strong bg-input text-ember-text">
                    <ThemeIcon iconKey={t.iconKey} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-h3">{t.name}</span>
                    {t.subtitle ? <span className="truncate text-sm text-text-muted">{t.subtitle}</span> : null}
                    <span className="text-xs text-text-faint">
                      {themeStats(t)}
                      {t.visible ? '' : ' · hidden'}
                    </span>
                  </span>
                  <span
                    className="tabular rounded-lg bg-border px-2.5 py-1 text-xs font-bold text-text-muted"
                    aria-label={`Position ${i + 1}`}
                  >
                    {i + 1}
                  </span>
                </button>
              )}
            />
          )}
          {/* Until a theme is chosen (right after loading) there is nothing to edit: no empty form flashes by. */}
          {isPending || selected === null ? (
            <Skeleton className="h-[520px] rounded-card" />
          ) : (
            <ThemeEditor
              key={selected ?? 'none'}
              theme={current}
              themes={themes}
              onCreated={(t) => setSelected(t.id)}
              onDeleted={() => setSelected(null)}
            />
          )}
        </div>
      )}
    </>
  );
}
