import { zodResolver } from '@hookform/resolvers/zod';
import { Upload as UploadIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import { useRecentChanges } from '../../hooks/useEntity';
import { useVersionedSave } from '../../hooks/useVersionedSave';
import { cn } from '../../lib/cn';
import { applyFieldErrors } from '../../lib/form-errors';
import { AudioPreview } from '../../ui/AudioPreview';
import { StatusText } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card, SectionCard } from '../../ui/Card';
import { Checkbox } from '../../ui/Checkbox';
import { ConflictDialog, type ConflictField } from '../../ui/ConflictDialog';
import { Dialog } from '../../ui/Dialog';
import { DragList } from '../../ui/DragList';
import { FileDrop } from '../../ui/FileDrop';
import { Input } from '../../ui/Input';
import { PageHeader } from '../../ui/PageHeader';
import { Segmented } from '../../ui/Segmented';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/Tabs';
import { toast } from '../../ui/Toast';
import { FILE_RULES, useMedia, useMediaUpload } from '../media/api';
import {
  blockApi, blockLength, blockSchema, KINDS, loudness, useBlockCache, useReorderBlocks, useSoundBlocks,
  type BlockKind, type BlockValues, type SoundBlock,
} from './api'; // prettier-ignore

const GRID = 'grid grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)_80px_64px] items-center gap-3';
const FIELDS: ConflictField<SoundBlock>[] = [
  { key: 'name', label: 'Name in the app' },
  { key: 'access', label: 'Access', format: (v) => (v === 'premium' ? 'Premium' : 'Free') },
  { key: 'loopable', label: 'Repeats as a loop' },
  { key: 'visible', label: 'Visible in app' },
  { key: 'mediaId', label: 'File', format: () => 'A file' },
];

/** Play button for a block. The signed URL is only asked for rows that are on screen. */
function Sample({ block }: { block: SoundBlock }) {
  const media = useMedia(block.mediaId);
  return <AudioPreview name={block.name} src={media.data?.previewUrl} />;
}

type EditorProps = { kind: BlockKind; block: SoundBlock | null; onClose: () => void };

/** Upload a new block, or edit one. A new block is created once its file has been processed (the API needs its length and loudness). */
function BlockDialog({ kind, block, onClose }: EditorProps) {
  const cache = useBlockCache();
  const meta = KINDS.find((k) => k.value === kind)!;
  const loops = kind === 'sound' || kind === 'loop';
  const { register, handleSubmit, setValue, watch, reset, setError, formState } = useForm<BlockValues>({
    resolver: zodResolver(blockSchema),
    defaultValues: block
      ? { name: block.name, access: block.access, loopable: block.loopable, visible: block.visible }
      : { name: '', access: 'premium', loopable: loops, visible: true },
  });
  const [newMediaId, setNewMediaId] = useState<string | null>(null);
  const file = useMediaUpload({ kind: 'audio', mediaId: newMediaId ?? block?.mediaId, onUploaded: setNewMediaId });
  const result = newMediaId && file.media?.id === newMediaId ? file.media.job?.result : undefined;
  const ready = file.media?.status === 'ready';
  const [creating, setCreating] = useState(false);

  const onError = (e: unknown) => {
    if (!applyFieldErrors(e, setError, ['name'])) toast.apiError(e, 'Could not save the block.');
  };
  const edit = useVersionedSave<SoundBlock, BlockValues & { mediaId?: string }>({
    save: (v, version) => blockApi.update(block!.id, v, version),
    onSaved: (row) => {
      cache.saved(row);
      toast.success('Block saved');
      onClose();
    },
    onError,
  });

  const submit = handleSubmit(async (v) => {
    if (block) return edit.save({ ...v, ...(newMediaId ? { mediaId: newMediaId } : {}) }, block.version);
    if (!newMediaId || !ready) return toast.error('Upload the audio file first.');
    setCreating(true);
    try {
      cache.added(await blockApi.create({ ...v, kind, mediaId: newMediaId }));
      toast.success(`${meta.label.replace(/s$/, '')} added`);
      onClose();
    } catch (e) {
      onError(e);
    } finally {
      setCreating(false);
    }
  });

  const access = watch('access');
  const loud = result?.lufs !== undefined && result?.lufs !== null ? loudness(result.lufs) : null;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={block ? `Edit “${block.name}”` : `Upload ${meta.one}`}
      description={meta.tip.body}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={creating || edit.saving} disabled={file.busy || (!block && !ready)}>
            {block ? 'Save' : 'Add to the app'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FileDrop
          label="Audio file"
          hint="MP3, WAV or M4A · up to 500 MB"
          rule={FILE_RULES.audio}
          state={file.state}
          onFiles={([f]) => {
            if (!f) return;
            file.start(f);
            if (!watch('name').trim())
              setValue(
                'name',
                f.name
                  .replace(/\.[^.]+$/, '')
                  .replace(/[_-]+/g, ' ')
                  .slice(0, 80),
              );
          }}
          onPause={file.pause}
          onResume={file.resume}
          onCancel={file.cancel}
          onRetry={file.retry}
        />
        {loud ? (
          <p role="status" className={cn('text-sm font-semibold', loud.ok ? 'text-success-text' : 'text-warning')}>
            Loudness: {loud.text}
            {loud.ok ? '' : '. Blocks are joined, so this one will stand out. Target −16 LUFS.'}
          </p>
        ) : null}
        {result?.loop && !result.loop.seamless && watch('loopable') ? (
          <p role="alert" className="rounded-input bg-warning/15 px-3 py-2 text-sm text-warning">
            The start and the end of this file do not match{result.loop.diffDb !== null ? ` (${result.loop.diffDb} dB apart)` : ''}.
            Repeated as a loop it will click.
          </p>
        ) : null}
        <Input label="Name in the app" error={formState.errors.name?.message} {...register('name')} />
        <Segmented
          label="Access"
          value={access}
          onChange={(v) => setValue('access', v, { shouldDirty: true })}
          options={[
            { value: 'free', label: 'Free' },
            { value: 'premium', label: 'Premium' },
          ]}
        />
        <div className="flex flex-wrap gap-6">
          <Checkbox label="Repeats as a loop" description="The app plays it again and again without a gap." {...register('loopable')} />
          <Checkbox label="Visible in app" {...register('visible')} />
        </div>
      </form>
      {block && edit.conflict ? (
        <ConflictDialog
          open
          mine={edit.conflict.mine}
          theirs={edit.conflict.theirs}
          fields={FIELDS}
          saving={edit.saving}
          onKeepMine={edit.keepMine}
          onTakeTheirs={() =>
            edit.takeTheirs((theirs) => {
              cache.saved(theirs);
              reset({ name: theirs.name, access: theirs.access, loopable: theirs.loopable, visible: theirs.visible });
              setNewMediaId(null);
            })
          }
        />
      ) : null}
    </Dialog>
  );
}

/** 11 Sounds & building blocks: the pieces of Build your own, and the bells of the Silence Room. */
export function SoundsPage() {
  const { data, isPending, error, refetch } = useSoundBlocks();
  const [params, setParams] = useSearchParams();
  const kind = (KINDS.find((k) => k.value === params.get('kind'))?.value ?? 'opening') as BlockKind;
  const meta = KINDS.find((k) => k.value === kind)!;
  const [dialog, setDialog] = useState<{ block: SoundBlock | null } | null>(null);
  const recent = useRecentChanges('soundBlock');
  const reorder = useReorderBlocks((e) => toast.apiError(e, 'Could not save the new order.'));

  const rows = (data ?? []).filter((b) => b.kind === kind).sort((a, b) => a.order - b.order);
  const count = (k: BlockKind) => data?.filter((b) => b.kind === k).length;
  // Another tab: close an open editor of the previous kind.
  useEffect(() => setDialog(null), [kind]);

  return (
    <>
      <PageHeader
        title="Sounds & building blocks"
        subtitle="The pieces people combine in Build your own, plus the bells for the Silence Room. You name each one; the app shows your names."
        actions={
          <Button onClick={() => setDialog({ block: null })}>
            <UploadIcon size={16} aria-hidden />
            Upload {meta.one}
          </Button>
        }
      />
      <Tabs
        className="flex flex-col gap-5"
        value={kind}
        onValueChange={(v) => setParams(v === 'opening' ? {} : { kind: v }, { replace: true })}
      >
        <TabsList aria-label="Block type" className="flex-wrap">
          {KINDS.map((k) => (
            <TabsTrigger key={k.value} value={k.value}>
              {k.label}
              {count(k.value) !== undefined ? ` · ${count(k.value)}` : ''}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* One panel, for the chosen tab: each tab button points at it (aria-controls). */}

        <TabsContent value={kind} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card padded={false} className="overflow-hidden">
            <div
              className={cn(
                GRID,
                'border-b border-border py-3.5 pl-[66px] pr-5 text-xs font-semibold uppercase tracking-[0.8px] text-text-faint',
              )}
              aria-hidden
            >
              <span />
              <span>Name in the app</span>
              <span>Length</span>
              <span>Used in</span>
              <span>Access</span>
              <span>Order</span>
            </div>
            {error ? (
              <ErrorState error={error} onRetry={() => void refetch()} />
            ) : isPending ? (
              <SkeletonRows rows={4} label="Loading blocks" />
            ) : rows.length === 0 ? (
              <EmptyState
                title={`No ${meta.label.toLowerCase()} yet`}
                description={meta.tip.body}
                action={
                  <Button size="sm" onClick={() => setDialog({ block: null })}>
                    Upload {meta.one}
                  </Button>
                }
              />
            ) : (
              <DragList
                label={`${meta.label} order`}
                className="px-2.5"
                items={rows}
                itemKey={(b) => b.id}
                itemLabel={(b) => b.name}
                disabled={reorder.isPending}
                onReorder={(next) => reorder.mutate(next)}
                renderItem={(b, i) => (
                  <div className={cn(GRID, 'min-h-16 pr-2.5 text-body transition-colors duration-700', recent.has(b.id) && 'bg-ember/10')}>
                    <Sample block={b} />
                    <button
                      type="button"
                      onClick={() => setDialog({ block: b })}
                      className="flex min-w-0 flex-col rounded-input text-left hover:text-ember-text"
                    >
                      <span className="truncate font-semibold">{b.name}</span>
                      <span className="truncate text-xs text-text-muted">
                        {[
                          b.loopable ? 'Seamless loop' : null,
                          b.visible ? null : 'Hidden',
                          loudness(b.loudnessLufs)?.ok === false ? 'Check loudness' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Edit'}
                      </span>
                    </button>
                    <span className="tabular text-text-soft">{blockLength(b)}</span>
                    <span className="truncate text-sm text-text-muted">{meta.usedIn}</span>
                    <StatusText tone={b.access === 'free' ? 'success' : 'ember'} className="text-xs font-bold">
                      {b.access === 'free' ? 'Free' : 'Premium'}
                    </StatusText>
                    <span className="tabular text-text-faint">{i + 1}</span>
                  </div>
                )}
              />
            )}
          </Card>

          <aside className="flex flex-col gap-4">
            <SectionCard title={meta.tip.title}>
              <p className="text-body text-text-soft">{meta.tip.body}</p>
            </SectionCard>
            <SectionCard title="How Build your own puts them together">
              <div className="flex h-[34px] gap-1 overflow-hidden rounded-input text-overline" aria-hidden>
                <span className="flex flex-[2] items-center justify-center bg-ember/15 text-ember-text">OPENING</span>
                <span className="flex flex-[7] items-center justify-center bg-teal text-teal-text">MEDITATION</span>
                <span className="flex flex-[2] items-center justify-center bg-lilac text-lilac-text">CLOSING</span>
              </div>
              <p className="text-sm text-text-muted">
                Opening → core → silence padding → closing. The app joins them with no gaps and the total lands within 1 second of the
                chosen length. Sounds play under everything; bells ring at the interval picked.
              </p>
            </SectionCard>
            <SectionCard title="Loudness check">
              <p className="text-sm text-text-muted">Every upload is measured so blocks sound equally loud when joined. Target −16 LUFS.</p>
              {rows.length ? (
                <ul aria-label="Loudness of these blocks" className="flex flex-col gap-2 text-sm">
                  {rows.map((b) => {
                    const l = loudness(b.loudnessLufs);
                    return (
                      <li key={b.id} className="flex justify-between gap-3">
                        <span className="truncate">{b.name}</span>
                        <span
                          className={cn(
                            'tabular shrink-0 font-semibold',
                            !l ? 'text-text-muted' : l.ok ? 'text-success-text' : 'text-warning',
                          )}
                        >
                          {l?.text ?? 'Not measured'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </SectionCard>
          </aside>
        </TabsContent>
      </Tabs>

      {dialog ? <BlockDialog key={dialog.block?.id ?? 'new'} kind={kind} block={dialog.block} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
