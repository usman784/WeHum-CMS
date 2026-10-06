import { useState } from 'react';
import { useChangedByOthers } from '../../hooks/useEntity';
import { useSocketEvent, useSubscribe } from '../../hooks/useLive';
import { useCan } from '../../hooks/useRole';
import { formatCompact, formatNumber, formatRelative } from '../../lib/format';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { SectionCard } from '../../ui/Card';
import { Checkbox } from '../../ui/Checkbox';
import { ConflictDialog, type ConflictField } from '../../ui/ConflictDialog';
import { Input } from '../../ui/Input';
import { NumberInput } from '../../ui/NumberInput';
import { PageHeader } from '../../ui/PageHeader';
import { Select } from '../../ui/Select';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { Switch } from '../../ui/Switch';
import { TabPills } from '../../ui/TabPills';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/Tabs';
import { toast } from '../../ui/Toast';
import { useConfigForm } from '../config/useConfigForm';
import { countryName } from '../users/api';
import {
  FILTERS,
  modApi,
  reasonChips,
  useModCache,
  useModStats,
  useQueue,
  useRules,
  useSessionOptions,
  type ModFilter,
  type ModRules,
  type Post,
} from './api';

function PostCard({ p, selected, onSelect, onDone }: { p: Post; selected: boolean; onSelect: (on: boolean) => void; onDone: () => void }) {
  const [busy, setBusy] = useState<'hide' | 'keep' | 'mute' | null>(null);
  const act = async (kind: 'hide' | 'keep' | 'mute') => {
    setBusy(kind);
    try {
      if (kind === 'mute') {
        await modApi.mute(p.userId, !p.userMuted);
        toast.success(
          p.userMuted ? `${p.firstName} can post again` : `${p.firstName} is muted`,
          p.userMuted ? undefined : 'New posts stay hidden.',
        );
      } else {
        const r = await (kind === 'hide' ? modApi.hide(p.id) : modApi.keep(p.id));
        toast.success(
          kind === 'hide' ? 'Post hidden' : 'Post kept',
          'autoMuted' in r && r.autoMuted ? `${p.firstName} is now muted (too many hidden posts).` : undefined,
        );
      }
      onDone();
    } catch (e) {
      toast.apiError(e);
    } finally {
      setBusy(null);
    }
  };
  const where = [p.country ? countryName(p.country) : 'Worldwide', formatRelative(p.createdAt)].join(' · ');
  return (
    <li
      aria-label={`Post by ${p.firstName}`}
      className={`flex flex-col gap-3 rounded-card border bg-surface p-5 ${p.crisis ? 'border-warning' : 'border-border'}`}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <Checkbox label={`Select the post by ${p.firstName}`} hideLabel checked={selected} onChange={(e) => onSelect(e.target.checked)} />
        <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-surface-alt text-sm font-bold">
          {p.firstName.slice(0, 1).toUpperCase()}
        </span>
        <span className="text-body font-semibold">{p.firstName}</span>
        <span className="text-sm text-text-muted">· {where}</span>
        <Badge size="sm">{p.sessionTitle}</Badge>
        <span className="flex-1" />
        {p.status === 'hidden' ? (
          <Badge tone="neutral" size="sm">
            Hidden
          </Badge>
        ) : null}
        {p.userMuted ? (
          <Badge tone="warning" size="sm">
            Writer muted
          </Badge>
        ) : null}
        {reasonChips(p).map((c) => (
          <Badge key={c.text} tone={c.tone} size="sm">
            {c.text}
          </Badge>
        ))}
      </div>
      <p className="text-h3 font-normal">“{p.text}”</p>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex-1 text-sm text-text-muted">
          {p.crisis ? 'SoS screen was shown to the writer' : 'Written after the meditation'}
          {p.holdingCount ? ` · ${formatCompact(p.holdingCount)} holding` : ''}
        </span>
        {p.status !== 'hidden' ? (
          <Button
            size="sm"
            variant="outline"
            className="text-ember-text"
            loading={busy === 'hide'}
            disabled={!!busy}
            onClick={() => void act('hide')}
          >
            Hide post
          </Button>
        ) : null}
        <Button size="sm" variant="outline" loading={busy === 'mute'} disabled={!!busy} onClick={() => void act('mute')}>
          {p.userMuted ? 'Unmute user' : 'Mute user'}
        </Button>
        {p.status !== 'visible' || p.reportCount > 0 || p.autoFlags.length ? (
          <Button
            size="sm"
            className="bg-success text-ember-on hover:bg-success/90"
            loading={busy === 'keep'}
            disabled={!!busy}
            onClick={() => void act('keep')}
          >
            {p.status === 'hidden' ? 'Show again' : 'Keep'}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function Queue() {
  const [filter, setFilter] = useState<ModFilter>('review');
  const [sessionId, setSessionId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const queue = useQueue({ filter, sessionId });
  const stats = useModStats();
  const sessions = useSessionOptions();
  const cache = useModCache();
  const rows = queue.data?.pages.flatMap((p) => p.data) ?? [];
  const open = (queue.data?.pages[0]?.meta as { open?: number } | undefined)?.open ?? stats.data?.open;
  const flagged = stats.data?.flagged;

  const bulk = async (action: 'hide' | 'keep') => {
    setBulkBusy(true);
    try {
      const r = await modApi.bulk(action, [...selected]);
      const failed = r.results.filter((x) => !x.ok).length;
      toast.success(
        `${r.results.length - failed} ${action === 'hide' ? 'hidden' : 'kept'}`,
        failed ? `${failed} could not be changed.` : undefined,
      );
      setSelected(new Set());
      cache.refresh();
    } catch (e) {
      toast.apiError(e);
    } finally {
      setBulkBusy(false);
    }
  };

  const options = FILTERS.map((f) => ({
    ...f,
    label:
      f.value === 'review' && open !== undefined
        ? `${f.label} · ${open}`
        : f.value === 'flagged' && flagged
          ? `${f.label} · ${flagged}`
          : f.label,
  }));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <TabPills
          label="Filter posts"
          options={options}
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setSelected(new Set());
          }}
        />
        <span className="flex-1" />
        <Select
          inline
          size="sm"
          label="Session"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          options={[{ value: '', label: 'All sessions' }, ...(sessions.data ?? []).map((s) => ({ value: s.id, label: s.title }))]}
        />
      </div>
      {selected.size ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="flex flex-wrap items-center gap-3 rounded-btn border border-ember bg-ember/10 px-4 py-2.5"
        >
          <span className="text-body font-semibold">{selected.size} selected</span>
          <span className="flex-1" />
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          <Button size="sm" variant="outline" loading={bulkBusy} onClick={() => void bulk('keep')}>
            Keep all
          </Button>
          <Button size="sm" loading={bulkBusy} onClick={() => void bulk('hide')}>
            Hide all
          </Button>
        </div>
      ) : null}
      {queue.isError ? (
        <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
      ) : queue.isPending ? (
        <SkeletonRows rows={4} label="Loading posts" />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === 'review' ? 'Nothing to review' : 'No posts here'}
          description={
            filter === 'review' ? 'Reported and auto-flagged posts show here as they come in.' : 'Pick another filter or session.'
          }
        />
      ) : (
        <ul aria-label="Posts" className="flex flex-col gap-4">
          {rows.map((p) => (
            <PostCard
              key={p.id}
              p={p}
              selected={selected.has(p.id)}
              onSelect={(on) =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (on) n.add(p.id);
                  else n.delete(p.id);
                  return n;
                })
              }
              onDone={cache.refresh}
            />
          ))}
        </ul>
      )}
      {queue.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          loading={queue.isFetchingNextPage}
          onClick={() => void queue.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}

function Today() {
  const s = useModStats();
  const tiles: [string, number | undefined][] = [
    ['posts', s.data?.posts],
    ['flagged', s.data?.flagged],
    ['hidden', s.data?.hidden],
    ['kept', s.data?.kept],
  ];
  return (
    <SectionCard title="Today">
      <dl className="grid grid-cols-2 gap-2.5">
        {tiles.map(([k, v]) => (
          <div key={k} className="flex flex-col-reverse rounded-tile bg-input px-3.5 py-3">
            <dt className="text-sm text-text-muted">{k}</dt>
            <dd className="tabular text-h2">{v === undefined ? '…' : formatNumber(v)}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

const RULE_FIELDS: ConflictField<ModRules>[] = [
  { key: 'blockLinks', label: 'Block links and handles' },
  { key: 'profanity', label: 'Profanity filter' },
  { key: 'dailyLimit', label: 'Posts per person per day' },
  { key: 'autoHideReports', label: 'Auto-hide at reports' },
  { key: 'muteAfterHides', label: 'Mute after hidden posts' },
  { key: 'crisisWords', label: 'Crisis words' },
];

function Rules() {
  const rules = useRules();
  const cache = useModCache();
  const canEdit = useCan('settings.manage');
  const { change, dismiss } = useChangedByOthers('config', 'moderation');
  const [words, setWords] = useState<string | null>(null);
  const form = useConfigForm<ModRules>({
    doc: rules.data,
    put: modApi.saveRules,
    onSaved: (doc) => {
      cache.rulesSaved(doc);
      dismiss();
      setWords(null);
      toast.success('Rules saved');
    },
    onError: (e) => toast.apiError(e, 'Could not save the rules.'),
  });
  const v = form.value;
  if (rules.isError) return <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />;
  if (!v) return <SkeletonRows rows={5} label="Loading rules" />;
  const ro = !canEdit;
  return (
    <SectionCard title="Rules" description={ro ? 'Only owners and admins change the rules.' : undefined}>
      {change && !form.dirty ? (
        <p role="status" className="rounded-btn bg-info px-3 py-2 text-sm text-info-text">
          {change.by?.name ?? 'Someone'} changed the rules. They are shown below.
        </p>
      ) : null}
      <div className="flex flex-col gap-3">
        <Switch
          label="Block links and handles"
          checked={v.blockLinks}
          disabled={ro}
          onCheckedChange={(c) => form.edit({ blockLinks: c })}
        />
        <Switch label="Profanity filter" checked={v.profanity} disabled={ro} onCheckedChange={(c) => form.edit({ profanity: c })} />
        <NumberInput
          label="Posts per person per day"
          value={v.dailyLimit}
          min={1}
          max={20}
          disabled={ro}
          onChange={(n) => n && form.edit({ dailyLimit: n })}
        />
        <NumberInput
          label="Auto-hide at reports"
          value={v.autoHideReports}
          min={1}
          max={50}
          disabled={ro}
          onChange={(n) => n && form.edit({ autoHideReports: n })}
        />
        <NumberInput
          label="Mute the writer after hidden posts"
          value={v.muteAfterHides}
          min={1}
          max={20}
          disabled={ro}
          onChange={(n) => n && form.edit({ muteAfterHides: n })}
        />
        <Input
          label="Crisis words: show SoS to the writer"
          hint="Comma separated. A post with one of these goes to the top of the queue."
          value={words ?? v.crisisWords.join(', ')}
          disabled={ro}
          onChange={(e) => setWords(e.target.value)}
          onBlur={() => {
            if (words === null) return;
            form.edit({
              crisisWords: words
                .split(',')
                .map((w) => w.trim())
                .filter((w) => w.length >= 2),
            });
          }}
        />
        <Switch label="Users can block each other" description="Always on in the app." checked disabled onCheckedChange={() => {}} />
        <Switch
          label="Posting needs membership"
          description="Always on: guests are asked to add an account first."
          checked
          disabled
          onCheckedChange={() => {}}
        />
      </div>
      <p className="text-xs text-text-faint">
        Everyone can read. Members can post, and the app asks guests to add an account first so their name can show.
      </p>
      {canEdit ? (
        <div className="flex gap-2.5">
          <Button size="sm" onClick={form.save} loading={form.saving} disabled={!form.dirty}>
            Save rules
          </Button>
          {form.dirty ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                form.discard();
                setWords(null);
              }}
            >
              Discard
            </Button>
          ) : null}
        </div>
      ) : null}
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
    </SectionCard>
  );
}

/** 14 Dedications & gratitude: the moderation queue (live), today's numbers and the rules. */
export function ModerationPage() {
  const cache = useModCache();
  useSubscribe(['moderation']);
  useSocketEvent('moderation:new', cache.refresh);
  useSocketEvent('moderation:count', cache.refresh);
  return (
    <>
      <PageHeader
        title="Dedications & gratitude"
        subtitle="Written after a finished meditation and shown under each session. Text only, 200 characters, no links. Read free, post as a member."
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Tabs defaultValue="dedications">
          <TabsList aria-label="Post types">
            <TabsTrigger value="dedications">Dedications · per session</TabsTrigger>
            <TabsTrigger value="gratitude">Gratitude feed</TabsTrigger>
          </TabsList>
          <TabsContent value="dedications" className="pt-4">
            <Queue />
          </TabsContent>
          <TabsContent value="gratitude" className="pt-4">
            <EmptyState title="Gratitude feed is coming soon" description="It is switched on in Settings → App & releases when it ships." />
          </TabsContent>
        </Tabs>
        <div className="flex flex-col gap-5">
          <Today />
          <SectionCard title="Where these appear">
            <p className="text-sm text-text-muted">
              <strong className="text-text">Dedications</strong> are written only after a finished meditation and shown on that session’s
              own feed.
            </p>
            <p className="text-sm text-text-muted">
              <strong className="text-text">Gratitude feed</strong> is coming soon.
            </p>
          </SectionCard>
          <Rules />
        </div>
      </div>
    </>
  );
}
