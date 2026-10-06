import { Pause, Play, RotateCw, Upload, X } from 'lucide-react';
import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { formatBytes } from '../lib/format';
import { Button } from './Button';
import { IconButton } from './IconButton';

export type FileRule = {
  /** MIME types or extensions, e.g. ['audio/mpeg', 'audio/wav', '.m4a']. `audio/*` style wildcards work. */
  accept: string[];
  maxBytes: number;
};

/** Checks a file before any upload starts (spec §10: wrong type or too large is rejected before upload). */
export function checkFile(file: File, rule: FileRule): string | null {
  const name = file.name.toLowerCase();
  const typeOk = rule.accept.some((a) =>
    a.startsWith('.') ? name.endsWith(a.toLowerCase()) : a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1)) : file.type === a,
  );
  if (!typeOk) return `${file.name}: this file type is not supported.`;
  if (file.size > rule.maxBytes) return `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(rule.maxBytes)}.`;
  return null;
}

export type UploadState =
  | { status: 'idle' }
  | { status: 'uploading' | 'processing'; fileName: string; progress: number }
  /** Stopped by the admin or by a lost connection. Parts already sent are kept. */
  | { status: 'paused'; fileName: string; progress: number; reason?: string }
  | { status: 'done'; fileName: string; meta?: string }
  | { status: 'error'; fileName: string; message: string };

type Props = {
  label: string;
  /** Under the label, e.g. "MP3, WAV or M4A · up to 500 MB". */
  hint?: string;
  rule: FileRule;
  multiple?: boolean;
  state?: UploadState;
  onFiles: (files: File[]) => void;
  /** Called with one message per rejected file. */
  onReject?: (messages: string[]) => void;
  onCancel?: () => void;
  onRetry?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
};

/** Drop zone + file button with progress, retry and cancel (design: SessionEditor.dc.html upload row). */
export function FileDrop({
  label,
  hint,
  rule,
  multiple,
  state = { status: 'idle' },
  onFiles,
  onReject,
  onCancel,
  onRetry,
  onPause,
  onResume,
  icon,
  disabled,
  className,
}: Props) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []).slice(0, multiple ? undefined : 1);
    const errors = files.map((f) => checkFile(f, rule)).filter((m): m is string => !!m);
    const good = files.filter((f) => !checkFile(f, rule));
    setRejected(errors);
    if (errors.length) onReject?.(errors);
    if (good.length) onFiles(good);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) take(e.dataTransfer.files);
  };

  const busy = state.status === 'uploading' || state.status === 'processing';
  const paused = state.status === 'paused';
  const pct = busy || paused ? Math.round(Math.min(1, Math.max(0, state.progress)) * 100) : 0;
  const verb = state.status === 'uploading' ? 'Uploading' : state.status === 'paused' ? 'Paused' : 'Processing';

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex items-center gap-4 rounded-[14px] border bg-input p-4 transition-colors',
          over ? 'border-ember bg-ember/10' : state.status === 'error' ? 'border-danger-border' : 'border-dashed border-outline',
          state.status === 'done' && 'border-solid border-border-strong',
        )}
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-tile bg-teal text-teal-text">
          {icon ?? <Upload size={22} aria-hidden />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-body font-semibold">{state.status === 'idle' ? label : state.fileName}</span>
          {state.status === 'idle' ? <span className="text-xs text-text-muted">{hint ?? 'Drop a file here, or choose one.'}</span> : null}
          {busy || paused ? (
            <>
              <div
                role="progressbar"
                aria-label={`${verb} ${state.fileName}`}
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1.5 rounded-full bg-border-strong"
              >
                <div
                  className={cn('h-1.5 rounded-full transition-[width]', paused ? 'bg-text-faint' : 'bg-ember')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="tabular text-xs text-text-muted" role={paused ? 'status' : undefined}>
                {verb} · {pct}%{paused && state.reason ? ` · ${state.reason}` : ''}
              </span>
            </>
          ) : null}
          {state.status === 'done' ? <span className="text-xs text-text-muted">{state.meta ?? 'Uploaded'}</span> : null}
          {state.status === 'error' ? (
            <span role="alert" className="text-xs font-semibold text-danger-text">
              {state.message}
            </span>
          ) : null}
        </div>
        {state.status === 'uploading' && onPause ? (
          <IconButton label="Pause upload" onClick={onPause}>
            <Pause size={18} aria-hidden />
          </IconButton>
        ) : null}
        {paused && onResume ? (
          <Button variant="outline" size="sm" onClick={onResume}>
            <Play size={14} aria-hidden />
            Resume
          </Button>
        ) : null}
        {(busy || paused) && onCancel ? (
          <IconButton label="Cancel upload" onClick={onCancel}>
            <X size={18} aria-hidden />
          </IconButton>
        ) : null}
        {state.status === 'error' && onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCw size={14} aria-hidden />
            Retry
          </Button>
        ) : null}
        {!busy && !paused ? (
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => input.current?.click()}>
            {state.status === 'idle' ? 'Choose file' : 'Replace'}
          </Button>
        ) : null}
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <input
          ref={input}
          id={inputId}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept={rule.accept.join(',')}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = ''; // picking the same file again must fire a change
          }}
        />
      </div>
      {rejected.length ? (
        <ul role="alert" className="flex flex-col gap-1 text-xs font-semibold text-danger-text">
          {rejected.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
