import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocketEvent, useSocketStatus, useSubscribe } from '../../hooks/useLive';
import { api } from '../../lib/api';
import { fileChecksum } from '../../lib/checksum';
import { formatBytes, formatDuration } from '../../lib/format';
import { qk } from '../../lib/query';
import { Upload, type UploadKind, type UploadSnapshot } from '../../lib/upload';
import type { FileRule, UploadState } from '../../ui/FileDrop';

const MB = 1024 * 1024;

/** Same limits as the API (`backend/src/modules/admin/media.ts`), so a wrong file is refused before any upload. */
export const FILE_RULES: Record<UploadKind, FileRule> = {
  audio: { accept: ['audio/*', '.mp3', '.wav', '.m4a', '.aac', '.flac'], maxBytes: 500 * MB },
  video: { accept: ['video/*', '.mp4', '.mov'], maxBytes: 2048 * MB },
  image: { accept: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], maxBytes: 10 * MB },
};

export type MediaJobResult = {
  durationSec?: number;
  lufs?: number | null;
  /** Set when the loudness is outside −16 ±1 LUFS. */
  loudnessWarning?: string | null;
  /** Start/end comparison for loops: `seamless` false means an audible click when repeated. */
  loop?: { seamless: boolean; diffDb: number | null } | null;
  codec?: string;
};

export type Media = {
  id: string;
  kind: UploadKind;
  name: string | null;
  mime: string;
  bytes: number;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  error: string | null;
  durationSec: number | null;
  loudnessLufs: number | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  createdAt: string;
  /** Short-lived URL for the CMS player / thumbnail. Null until ready. */
  previewUrl: string | null;
  job: {
    id: string;
    status: 'queued' | 'running' | 'done' | 'failed';
    progress: number;
    result: MediaJobResult | null;
    error: string | null;
  } | null;
};

const settled = (m?: Media) => m?.status === 'ready' || m?.status === 'failed';

/**
 * One media asset. While it is processing: `job:progress` from the socket patches the progress, and the asset is
 * re-read when the job ends. If the socket is down, it is polled every 3 s instead (spec §10 "Socket down").
 */
export function useMedia(id: string | null | undefined) {
  const qc = useQueryClient();
  const live = useSocketStatus() === 'live';
  const q = useQuery({
    queryKey: qk.media.detail(id ?? ''),
    queryFn: () => api<Media>(`/v1/admin/media/${id}`).then((r) => r.data),
    enabled: !!id,
    refetchInterval: (query) => (settled(query.state.data) ? false : live ? 15_000 : 3000),
    staleTime: 60_000,
  });
  useSubscribe(id && !settled(q.data) ? ['jobs'] : []);
  const jobId = q.data?.job?.id;
  useSocketEvent('job:progress', (j) => {
    if (!id || j.id !== jobId) return;
    if (j.status === 'done' || j.status === 'failed') void qc.invalidateQueries({ queryKey: qk.media.detail(id) });
    else
      qc.setQueryData<Media>(qk.media.detail(id), (m) =>
        m?.job ? { ...m, job: { ...m.job, status: j.status as 'running', progress: j.progress } } : m,
      );
  });
  return q;
}

/** "15:00 · −16.2 LUFS · 14 MB" */
export function mediaMeta(m: Media): string {
  return [
    m.durationSec ? formatDuration(m.durationSec) : null,
    m.width && m.height ? `${m.width} × ${m.height}` : null,
    m.loudnessLufs !== null && m.kind !== 'image' ? `${m.loudnessLufs.toFixed(1).replace('-', '−')} LUFS` : null,
    formatBytes(m.bytes),
  ]
    .filter(Boolean)
    .join(' · ');
}

type Options = {
  kind: UploadKind;
  /** The asset that is attached now (edit screen), so the row shows it before any new upload. */
  mediaId?: string | null;
  /** Called once when processing has finished and the file can be used. */
  onReady?: (media: Media) => void;
  /** Called as soon as the upload has an id (the form can already point at it; publishing waits for "ready"). */
  onUploaded?: (mediaId: string) => void;
};

/**
 * Upload one file and follow it until it is processed. Returns the `state` for <FileDrop> and its handlers.
 * A lost connection pauses the upload; it resumes by itself when the browser is online again.
 */
export function useMediaUpload({ kind, mediaId: attached, onReady, onUploaded }: Options) {
  const [snap, setSnap] = useState<UploadSnapshot | null>(null);
  const [fileName, setFileName] = useState('');
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const upload = useRef<Upload | null>(null);
  const lastFile = useRef<File | null>(null);
  const ready = useRef(onReady);
  ready.current = onReady;
  const uploaded = useRef(onUploaded);
  uploaded.current = onUploaded;

  const mediaId = uploadedId ?? attached ?? null;
  const media = useMedia(mediaId);

  const start = useCallback(
    (file: File) => {
      upload.current?.cancel();
      lastFile.current = file;
      setFileName(file.name);
      setUploadedId(null);
      const u = new Upload(file, kind, { checksum: fileChecksum, onChange: (s) => upload.current === u && setSnap(s) });
      upload.current = u;
      setSnap(u.state);
      u.done.then(
        (done) => {
          if (upload.current !== u) return;
          setUploadedId(done.id);
          uploaded.current?.(done.id);
        },
        () => {},
      );
    },
    [kind],
  );

  // Tell the form once per asset when it becomes usable.
  const told = useRef<string | null>(null);
  useEffect(() => {
    if (media.data?.status === 'ready' && uploadedId === media.data.id && told.current !== media.data.id) {
      told.current = media.data.id;
      ready.current?.(media.data);
    }
  }, [media.data, uploadedId]);

  // Back online: carry on without asking.
  useEffect(() => {
    const onOnline = () => upload.current?.state.pausedBy === 'network' && upload.current.resume();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);
  // Leaving the screen mid-upload: stop sending. S3 drops the unfinished parts.
  useEffect(() => () => upload.current?.cancel(), []);

  const m = media.data;
  let state: UploadState = { status: 'idle' };
  const active = snap && snap.status !== 'done' && snap.status !== 'cancelled';
  if (active && snap.status === 'failed') state = { status: 'error', fileName, message: snap.error ?? 'The upload failed.' };
  else if (active && snap.status === 'paused') {
    state = { status: 'paused', fileName, progress: snap.progress, reason: snap.pausedBy === 'network' ? 'connection lost' : undefined };
  } else if (active) state = { status: 'uploading', fileName, progress: snap.status === 'hashing' ? 0 : snap.progress };
  else if (m?.status === 'processing' || m?.status === 'uploading') {
    state = { status: 'processing', fileName: m.name ?? fileName, progress: (m.job?.progress ?? 0) / 100 };
  } else if (m?.status === 'failed')
    state = { status: 'error', fileName: m.name ?? fileName, message: m.error ?? 'Processing failed. Upload the file again.' };
  else if (m?.status === 'ready') state = { status: 'done', fileName: m.name ?? fileName, meta: mediaMeta(m) };
  else if (snap?.status === 'done') state = { status: 'processing', fileName, progress: 0 }; // the asset is being read for the first time

  return {
    state,
    media: m,
    /** True from the first byte until processing has finished: publishing must wait. */
    busy: state.status === 'uploading' || state.status === 'paused' || state.status === 'processing',
    // Stays after the upload has finished, until another file is chosen: the admin should not miss it.
    duplicateOf: snap && snap.status !== 'cancelled' ? (snap.duplicateOf ?? null) : null,
    start,
    pause: () => upload.current?.pause(),
    resume: () => upload.current?.resume(),
    cancel: () => {
      upload.current?.cancel();
      setSnap(null);
    },
    /** After a failed upload or failed processing: send the same file again. */
    retry: () => lastFile.current && start(lastFile.current),
  };
}
