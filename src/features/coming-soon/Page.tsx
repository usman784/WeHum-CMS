import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useCan } from '../../hooks/useRole';
import { isConflict } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { Badge, StatusText } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { SectionCard } from '../../ui/Card';
import { ConfirmDialog, Dialog } from '../../ui/Dialog';
import { IconButton } from '../../ui/IconButton';
import { Input } from '../../ui/Input';
import { NumberInput } from '../../ui/NumberInput';
import { PageHeader } from '../../ui/PageHeader';
import { Select } from '../../ui/Select';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { toast } from '../../ui/Toast';
import { useSessionOptions } from '../moderation/api';
import {
  breathApi,
  EMPTY_PATTERN,
  patternLabel,
  patternProblem,
  useComingSoonCache,
  useLessons,
  useMilestones,
  usePatterns,
  type BreathPattern,
  type PatternValues,
} from './api';

const STATUS = {
  draft: { label: 'Draft', tone: 'warning' as const },
  live: { label: 'Live', tone: 'success' as const },
  archived: { label: 'Archived', tone: 'muted' as const },
};

function PatternDialog({ pattern, onClose }: { pattern: BreathPattern | 'new' | null; onClose: () => void }) {
  const cache = useComingSoonCache();
  const [v, setV] = useState<PatternValues & { status: BreathPattern['status'] }>({ ...EMPTY_PATTERN, status: 'draft' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (pattern && pattern !== 'new') setV({ ...pattern });
    else setV({ ...EMPTY_PATTERN, status: 'draft' });
  }, [pattern]);
  const problem = !v.name.trim() ? 'Give it a name' : patternProblem(v);
  const save = async () => {
    setBusy(true);
    try {
      const { status, ...values } = v;
      if (pattern === 'new') {
        const row = await breathApi.create(values);
        if (status !== 'draft') await breathApi.update(row.id, { status }, row.version);
      } else if (pattern) {
        await breathApi.update(pattern.id, { ...values, status }, pattern.version);
      }
      toast.success(pattern === 'new' ? 'Template added' : 'Template saved');
      cache.patternsChanged();
      onClose();
    } catch (e) {
      if (isConflict(e)) {
        toast.error('Someone else changed this template', 'The list now shows their version. Open it again to edit.');
        cache.patternsChanged();
        onClose();
      } else toast.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  const beat = (key: 'inhaleSec' | 'hold1Sec' | 'exhaleSec' | 'hold2Sec', label: string) => (
    <NumberInput label={label} unit="s" value={v[key]} min={0} max={20} onChange={(n) => setV({ ...v, [key]: n ?? 0 })} />
  );
  return (
    <Dialog
      open={!!pattern}
      onOpenChange={(o) => !o && onClose()}
      title={pattern === 'new' ? 'New breathing template' : `Edit “${pattern?.name ?? ''}”`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!!problem} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Name" maxLength={40} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Input label="Subtitle" maxLength={80} value={v.subtitle} onChange={(e) => setV({ ...v, subtitle: e.target.value })} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {beat('inhaleSec', 'In')}
          {beat('hold1Sec', 'Hold')}
          {beat('exhaleSec', 'Out')}
          {beat('hold2Sec', 'Hold after out')}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <NumberInput label="Rounds" value={v.rounds} min={1} max={100} onChange={(n) => setV({ ...v, rounds: n ?? 1 })} />
          <NumberInput label="Order" value={v.sort} min={0} max={1000} onChange={(n) => setV({ ...v, sort: n ?? 0 })} />
          <Select
            label="Status"
            value={v.status}
            onChange={(e) => setV({ ...v, status: e.target.value as BreathPattern['status'] })}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'live', label: 'Live in the app' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
        </div>
        <p className={problem ? 'text-sm text-danger-text' : 'text-sm text-text-muted'} role={problem ? 'alert' : undefined}>
          {problem ?? `Pattern ${patternLabel(v)} · one round takes ${v.inhaleSec + v.hold1Sec + v.exhaleSec + v.hold2Sec} s`}
        </p>
      </div>
    </Dialog>
  );
}

function Templates() {
  const list = usePatterns();
  const cache = useComingSoonCache();
  const canDelete = useCan('content.delete');
  const [editing, setEditing] = useState<BreathPattern | 'new' | null>(null);
  const [removing, setRemoving] = useState<BreathPattern | null>(null);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await breathApi.remove(removing!.id);
      toast.success('Template deleted');
      setRemoving(null);
      cache.patternsChanged();
    } catch (e) {
      toast.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <SectionCard
      title="Breathing templates"
      description="“Start from a template” on the app’s Breathwork screen. Only live templates show."
      action={
        <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
          <Plus size={16} aria-hidden />
          New template
        </Button>
      }
    >
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <SkeletonRows rows={4} label="Loading templates" />
      ) : list.data.length === 0 ? (
        <EmptyState title="No templates yet" description="Add the first one, e.g. Calming 4 · 7 · 8." />
      ) : (
        <ul aria-label="Breathing templates" className="grid gap-3 sm:grid-cols-2">
          {list.data.map((p) => (
            <li key={p.id} className="flex items-start gap-3 rounded-tile border border-border bg-input p-3.5">
              <button type="button" className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left" onClick={() => setEditing(p)}>
                <Badge tone="teal" size="sm">
                  {patternLabel(p)}
                </Badge>
                <span className="text-body font-semibold">{p.name}</span>
                <span className="text-sm text-text-muted">
                  {p.subtitle || '—'} · {p.rounds} rounds
                </span>
                <StatusText tone={STATUS[p.status].tone}>{STATUS[p.status].label}</StatusText>
              </button>
              {canDelete ? (
                <IconButton label={`Delete ${p.name}`} variant="danger" onClick={() => setRemoving(p)}>
                  <Trash2 size={16} aria-hidden />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <PatternDialog pattern={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing ? `Delete “${removing.name}”?` : ''}
        description="It disappears from the app at once. People’s own saved patterns are not affected."
        confirmLabel="Delete"
        danger
        loading={busy}
        onConfirm={() => void remove()}
      />
    </SectionCard>
  );
}

function Lessons() {
  const doc = useLessons();
  const cache = useComingSoonCache();
  const sessions = useSessionOptions();
  const [ids, setIds] = useState<string[] | null>(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const saved = doc.data?.value.lessons ?? [];
  const list = ids ?? saved;
  const dirty = ids !== null && JSON.stringify(ids) !== JSON.stringify(saved);
  const title = (id: string) => sessions.data?.find((s) => s.id === id)?.title ?? 'A meditation';
  const move = (i: number, d: -1 | 1) => {
    const n = [...list];
    [n[i], n[i + d]] = [n[i + d]!, n[i]!];
    setIds(n);
  };
  const save = async () => {
    setBusy(true);
    try {
      cache.lessonsSaved(await breathApi.saveLessons(list, doc.data!.version));
      setIds(null);
      toast.success('Lessons saved');
    } catch (e) {
      if (isConflict(e)) toast.error('Someone else changed the lessons', 'Discard to see their list, then add yours again.');
      else toast.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  if (doc.isError) return <ErrorState error={doc.error} onRetry={() => void doc.refetch()} />;
  return (
    <SectionCard title="Lessons with Raphael" description="Published meditations shown as lessons on the Breathwork screen, in this order.">
      {doc.isPending ? (
        <SkeletonRows rows={3} label="Loading lessons" />
      ) : (
        <>
          {list.length === 0 ? (
            <p className="text-sm text-text-muted">No lessons yet.</p>
          ) : (
            <ol aria-label="Lessons" className="flex flex-col">
              {list.map((id, i) => (
                <li key={id} className="flex items-center gap-2 border-t border-border py-2 first:border-t-0">
                  <span className="w-20 text-sm text-text-muted">Lesson {i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-body">{title(id)}</span>
                  <IconButton label={`Move ${title(id)} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp size={16} aria-hidden />
                  </IconButton>
                  <IconButton label={`Move ${title(id)} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown size={16} aria-hidden />
                  </IconButton>
                  <IconButton label={`Remove ${title(id)}`} variant="danger" onClick={() => setIds(list.filter((x) => x !== id))}>
                    <Trash2 size={16} aria-hidden />
                  </IconButton>
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap items-end gap-2.5">
            <Select
              label="Add a lesson"
              size="sm"
              value={pick}
              placeholder="Choose a published meditation"
              onChange={(e) => setPick(e.target.value)}
              options={(sessions.data ?? []).filter((s) => !list.includes(s.id)).map((s) => ({ value: s.id, label: s.title }))}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!pick || list.length >= 20}
              onClick={() => {
                setIds([...list, pick]);
                setPick('');
              }}
            >
              Add
            </Button>
            <span className="flex-1" />
            {dirty ? (
              <Button size="sm" variant="ghost" onClick={() => setIds(null)}>
                Discard
              </Button>
            ) : null}
            <Button size="sm" loading={busy} disabled={!dirty} onClick={() => void save()}>
              Save lessons
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  );
}

function Milestones() {
  const m = useMilestones();
  return (
    <SectionCard
      title="Milestones"
      description="Awards in the app’s Milestones screen. They are automatic: reached from each person’s own progress."
    >
      {m.isError ? (
        <ErrorState error={m.error} onRetry={() => void m.refetch()} />
      ) : m.isPending ? (
        <SkeletonRows rows={6} label="Loading milestones" />
      ) : (
        <ul aria-label="Milestones" className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {m.data.map((x) => (
            <li key={x.key} className="flex items-center gap-3 rounded-tile bg-input px-3.5 py-3">
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ember/15 text-sm font-bold text-ember-text"
              >
                {x.badge}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">{x.label}</span>
                <span className="text-xs text-text-muted">
                  {formatNumber(x.reached)} {x.reached === 1 ? 'person' : 'people'} reached it
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** Coming soon content (P9): breathwork templates and lessons, and the milestone list. Shown in the app per feature flag. */
export function ComingSoonPage() {
  const canSettings = useCan('settings.manage');
  return (
    <>
      <PageHeader
        title="Breathwork & milestones"
        badge={<Badge caps>Coming soon</Badge>}
        subtitle="Prepare them here; each shows in the app once its feature is switched on."
        actions={
          canSettings ? (
            <Link
              to="/settings?tab=releases"
              className="text-sm font-semibold text-text-muted underline underline-offset-2 hover:text-text"
            >
              Feature switches
            </Link>
          ) : undefined
        }
      />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Templates />
        <Lessons />
      </div>
      <Milestones />
    </>
  );
}
