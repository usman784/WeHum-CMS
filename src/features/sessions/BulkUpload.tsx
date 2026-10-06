import { useEffect, useRef, useState } from 'react';
import { fileChecksum } from '../../lib/checksum';
import { errorMessage } from '../../lib/form-errors';
import { Upload, UploadCancelled } from '../../lib/upload';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { FileDrop } from '../../ui/FileDrop';
import { StatBar } from '../../ui/Charts';
import { FILE_RULES } from '../media/api';
import { sessionApi, useSessionCache } from './api';

type Item = {
  key: string;
  file: File;
  status: 'waiting' | 'uploading' | 'done' | 'failed' | 'cancelled';
  progress: number;
  message?: string;
};

const RULE = { accept: [...FILE_RULES.audio.accept, ...FILE_RULES.video.accept], maxBytes: FILE_RULES.video.maxBytes };
const kindOf = (f: File) => (f.type.startsWith('video/') || /\.(mp4|mov)$/i.test(f.name) ? 'video' : 'audio') as 'audio' | 'video';
/** "steady_under_pressure-final.wav" → "Steady under pressure final" */
export const titleFromFile = (name: string) => {
  const t = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120); // prettier-ignore
  return t ? t[0]!.toUpperCase() + t.slice(1) : 'Untitled';
};

/**
 * Bulk upload (spec §9, screen 03): drop many finished files, each becomes a draft meditation with the file attached.
 * Titles come from the file names; the details are filled in afterwards. Two files upload at a time.
 */
export function BulkUploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const uploads = useRef(new Map<string, Upload>());
  const running = useRef(0);
  const queue = useRef<Item[]>([]);
  const cache = useSessionCache();

  const patch = (key: string, p: Partial<Item>) => setItems((all) => all.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const pump = () => {
    while (running.current < 2 && queue.current.length) {
      const item = queue.current.shift()!;
      running.current += 1;
      const kind = kindOf(item.file);
      if (item.file.size > FILE_RULES[kind].maxBytes) {
        patch(item.key, { status: 'failed', message: `Too large for ${kind}.` });
        running.current -= 1;
        continue;
      }
      const u = new Upload(item.file, kind, {
        checksum: fileChecksum,
        onChange: (s) => patch(item.key, { status: 'uploading', progress: s.progress }),
      });
      uploads.current.set(item.key, u);
      u.done
        .then((done) => sessionApi.create({ title: titleFromFile(item.file.name), type: kind, mediaId: done.id }))
        .then(
          () => patch(item.key, { status: 'done', progress: 1 }),
          (e: unknown) =>
            patch(
              item.key,
              e instanceof UploadCancelled ? { status: 'cancelled' } : { status: 'failed', message: errorMessage(e, 'Upload failed.') },
            ),
        )
        .finally(() => {
          uploads.current.delete(item.key);
          running.current -= 1;
          void cache.changed();
          pump();
        });
    }
  };

  const add = (files: File[]) => {
    const fresh = files.map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, status: 'waiting' as const, progress: 0 }));
    setItems((all) => [...all, ...fresh]);
    queue.current.push(...fresh);
    pump();
  };

  const stopAll = () => {
    queue.current = [];
    uploads.current.forEach((u) => u.cancel());
    setItems((all) => all.map((i) => (i.status === 'waiting' ? { ...i, status: 'cancelled' } : i)));
  };
  useEffect(() => stopAll, []);

  const busy = items.some((i) => i.status === 'waiting' || i.status === 'uploading');
  const done = items.filter((i) => i.status === 'done').length;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          stopAll();
          setItems([]);
        }
        onOpenChange(o);
      }}
      title="Bulk upload"
      description="Drop finished audio or video files. Each one becomes a draft; fill in theme, cover and details afterwards."
      size="lg"
      footer={
        <>
          <span className="mr-auto text-sm text-text-muted" role="status">
            {items.length ? `${done} of ${items.length} drafts created` : ''}
          </span>
          <Button variant={busy ? 'outline' : 'primary'} onClick={() => onOpenChange(false)}>
            {busy ? 'Stop and close' : 'Close'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FileDrop label="Audio or video files" hint="MP3, WAV, M4A up to 500 MB · MP4 up to 2 GB" rule={RULE} multiple onFiles={add} />
        {items.length ? (
          <ul aria-label="Files" className="flex flex-col">
            {items.map((i) => (
              <li key={i.key} className="flex items-center gap-3 border-t border-border py-2.5">
                <span className="min-w-0 flex-1 truncate text-body">{i.file.name}</span>
                {i.status === 'uploading' ? (
                  <StatBar label={`Uploading ${i.file.name}`} value={i.progress} showValue className="w-40" />
                ) : null}
                {i.status === 'waiting' ? <span className="text-sm text-text-muted">Waiting</span> : null}
                {i.status === 'done' ? <span className="text-sm font-semibold text-success-text">Draft created</span> : null}
                {i.status === 'cancelled' ? <span className="text-sm text-text-muted">Stopped</span> : null}
                {i.status === 'failed' ? <span className="text-sm font-semibold text-danger-text">{i.message}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Dialog>
  );
}
