import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useChangedByOthers } from '../../hooks/useEntity';
import { cn } from '../../lib/cn';
import { Button } from '../../ui/Button';
import { Card, SectionCard } from '../../ui/Card';
import { ConflictDialog, type ConflictField } from '../../ui/ConflictDialog';
import { DragList } from '../../ui/DragList';
import { IconButton } from '../../ui/IconButton';
import { Input, Textarea } from '../../ui/Input';
import { PageHeader } from '../../ui/PageHeader';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { StatusText } from '../../ui/Badge';
import { toast } from '../../ui/Toast';
import { useConfigForm } from '../config/useConfigForm';
import { lengthLabel, STATUS } from '../sessions/display';
import { SessionPicker } from '../sessions/SessionPicker';
import { MAX_TILES, sosApi, sosErrors, useSos, useSosCache, type SosTile, type SosValue } from './api';

const FIELDS: ConflictField<SosValue>[] = [
  { key: 'title', label: 'Title' },
  { key: 'subtitle', label: 'Subtitle' },
  { key: 'help', label: '“Need more help?” card', format: (v) => { const h = v as SosValue['help']; return `${h.title} · ${h.bookingUrl} · ${h.contactEmail}`; } }, // prettier-ignore
];

const GRID = 'grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_0.6fr_0.8fr_auto] items-center gap-3';

/** 12 SoS · How can I help?: the tiles of the SoS screen, its header text and the "Need more help?" card. */
export function SosPage() {
  const { data, isPending, error, refetch } = useSos();
  const cache = useSosCache();
  const { change, dismiss } = useChangedByOthers('config', 'sos');
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useConfigForm<SosValue>({
    doc: data,
    put: sosApi.saveTexts,
    onSaved: (doc) => {
      cache.saved(doc);
      dismiss();
      toast.success('SoS texts saved');
    },
    onError: (e) => toast.apiError(e, 'Could not save the SoS texts.'),
  });
  const v = form.value;
  const errors = v ? sosErrors(v) : {};
  const invalid = Object.keys(errors).length > 0;

  /** Save a new order or a changed set of tiles; the screen shows the new order at once and goes back if the API refuses. */
  const setTiles = async (next: SosTile[], done?: string) => {
    if (!data) return;
    const before = data.tiles;
    cache.tiles(next);
    setSaving(true);
    try {
      cache.replace(await sosApi.order(next.map((t) => t.sessionId)));
      if (done) toast.success(done);
    } catch (e) {
      cache.tiles(before);
      toast.apiError(e, 'Could not change the tiles.');
    } finally {
      setSaving(false);
    }
  };

  const tiles = data?.tiles ?? [];
  const full = tiles.length >= MAX_TILES;
  const help = v?.help;

  return (
    <>
      <PageHeader
        title="SoS sessions"
        subtitle="A category of short sessions for hard moments. Each tile in the app opens one session you upload in Sessions."
        actions={
          <Button onClick={() => setPicking(true)} disabled={!data || full}>
            <Plus size={16} aria-hidden />
            Add SoS session
          </Button>
        }
      />
      {change && !form.dirty ? (
        <p role="status" className="rounded-btn bg-info px-4 py-2.5 text-body text-info-text">
          {change.by?.name ?? 'Someone'} changed the SoS texts. They are shown on the right.
        </p>
      ) : null}
      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending || !v || !help ? (
        <SkeletonRows rows={5} label="Loading SoS sessions" />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card padded={false} className="overflow-hidden">
            <div
              className={cn(
                GRID,
                'ml-11 border-b border-border py-3.5 pr-5 text-xs font-semibold uppercase tracking-[0.8px] text-text-faint',
              )}
              aria-hidden
            >
              <span>Feeling (tile)</span>
              <span>Subtitle</span>
              <span>Session it plays</span>
              <span>Length</span>
              <span>Status</span>
              <span className="w-9" />
            </div>
            {tiles.length === 0 ? (
              <EmptyState
                title="No SoS tiles yet"
                description="Add published meditations. Each one becomes a tile on the SoS screen in the app."
              />
            ) : (
              <DragList
                label="SoS tiles"
                items={tiles}
                itemKey={(t) => t.sessionId}
                itemLabel={(t) => t.feeling}
                disabled={saving}
                onReorder={(next) => void setTiles(next)}
                renderItem={(t, i) => (
                  <div className={cn(GRID, 'py-2 pr-3 text-body')}>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="tabular w-4 shrink-0 text-text-faint" aria-label={`Position ${i + 1}`}>
                        {i + 1}
                      </span>
                      <span className="truncate font-bold">{t.feeling}</span>
                    </span>
                    <span className="truncate text-text-muted">{t.subtitle ?? '—'}</span>
                    <Link to={`/sessions/${t.sessionId}`} className="truncate font-semibold hover:underline">
                      {t.title}
                    </Link>
                    <span className="tabular text-text-muted">{lengthLabel(t.durationSec)}</span>
                    <StatusText tone={t.status === 'live' ? 'success' : STATUS[t.status].tone} className="text-xs font-bold">
                      {t.status === 'live' ? 'Live' : `${STATUS[t.status].label}, not in the app`}
                    </StatusText>
                    <IconButton
                      label={`Remove ${t.feeling} from SoS`}
                      disabled={saving}
                      onClick={() =>
                        void setTiles(
                          tiles.filter((x) => x.sessionId !== t.sessionId),
                          `${t.feeling} is no longer a SoS tile`,
                        )
                      }
                    >
                      <X size={16} aria-hidden />
                    </IconButton>
                  </div>
                )}
              />
            )}
          </Card>

          <div className="flex flex-col gap-5">
            <SectionCard title="How it works">
              <p className="text-body text-text-soft">
                The SoS button is on every screen of the app. Tapping a feeling starts its session right away, with no intro music. Sessions
                are part of membership.
              </p>
              <p className="text-body text-text-soft">
                Drag rows to change the order of the tiles. Up to {MAX_TILES} tiles fit on one screen. The feeling and the subtitle of a
                tile are set in the session itself.
              </p>
            </SectionCard>
            <SectionCard
              title="Header text in the app"
              action={
                <Button size="sm" onClick={form.save} loading={form.saving} disabled={!form.dirty || invalid}>
                  Save texts
                </Button>
              }
            >
              <Input label="Title" size="sm" value={v.title} error={errors.title} onChange={(e) => form.edit({ title: e.target.value })} />
              <Textarea
                label="Subtitle"
                rows={3}
                value={v.subtitle}
                error={errors.subtitle}
                onChange={(e) => form.edit({ subtitle: e.target.value })}
              />
            </SectionCard>
            <SectionCard
              title="“Need more help?” card"
              description="Shown under the tiles: “You can contact us and book a personal session with Raphael.”"
            >
              <Input
                label="Card title"
                size="sm"
                value={help.title}
                error={errors.helpTitle}
                onChange={(e) => form.edit({ help: { ...help, title: e.target.value } })}
              />
              <Textarea
                label="Text"
                rows={3}
                value={help.body}
                error={errors.helpBody}
                onChange={(e) => form.edit({ help: { ...help, body: e.target.value } })}
              />
              <Input
                label="Booking link"
                size="sm"
                inputMode="url"
                value={help.bookingUrl}
                error={errors.bookingUrl}
                onChange={(e) => form.edit({ help: { ...help, bookingUrl: e.target.value } })}
              />
              <Input
                label="Contact email"
                size="sm"
                inputMode="email"
                value={help.contactEmail}
                error={errors.contactEmail}
                onChange={(e) => form.edit({ help: { ...help, contactEmail: e.target.value } })}
              />
            </SectionCard>
          </div>
        </div>
      )}
      <SessionPicker
        open={picking}
        onOpenChange={setPicking}
        title="Add a SoS session"
        allow={(s) =>
          tiles.some((t) => t.sessionId === s.id)
            ? 'already a tile'
            : s.status !== 'live'
              ? 'publish it first'
              : s.type === 'youtube'
                ? 'SoS plays audio or video you upload'
                : null
        }
        onPick={(s) =>
          void setTiles(
            [
              ...tiles,
              {
                sessionId: s.id,
                title: s.title,
                feeling: s.sosFeeling ?? s.title,
                subtitle: s.sosSubtitle,
                durationSec: s.durationSec,
                status: s.status,
                order: tiles.length,
              },
            ],
            `${s.title} is now a SoS tile. Set its feeling and subtitle in the session.`,
          )
        }
      />
      {form.conflict ? (
        <ConflictDialog
          open
          mine={form.conflict.mine}
          theirs={form.conflict.theirs.value}
          fields={FIELDS}
          by={change?.by?.name}
          saving={form.saving}
          onKeepMine={form.keepMine}
          onTakeTheirs={form.takeTheirs}
        />
      ) : null}
    </>
  );
}
