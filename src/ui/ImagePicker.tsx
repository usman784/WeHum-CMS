import { ImagePlus } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { checkFile, type FileRule } from './FileDrop';

const RULE: FileRule = { accept: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 10 * 1024 * 1024 };

/** The largest centred square inside a w×h image. */
export function squareCrop(w: number, h: number) {
  const size = Math.min(w, h);
  return { sx: Math.round((w - size) / 2), sy: Math.round((h - size) / 2), size };
}

/** Why an image cannot be used as a 1:1 cover, or null when it is fine (spec screen 04: 1:1, at least 1200 px). */
export function coverProblem(w: number, h: number, minSize: number): string | null {
  const { size } = squareCrop(w, h);
  return size < minSize ? `The image is ${w} × ${h} px. It needs at least ${minSize} px on its shorter side.` : null;
}

/** Decode, centre-crop to a square and re-encode as JPEG. */
async function cropToSquare(file: File, minSize: number): Promise<{ blob: Blob; size: number }> {
  const bitmap = await createImageBitmap(file);
  const problem = coverProblem(bitmap.width, bitmap.height, minSize);
  if (problem) throw new Error(problem);
  const { sx, sy, size } = squareCrop(bitmap.width, bitmap.height);
  const out = Math.min(size, 2400); // large enough for every app size, small enough to upload fast
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  canvas.getContext('2d')!.drawImage(bitmap, sx, sy, size, size, 0, 0, out, out);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  if (!blob) throw new Error('This image could not be read.');
  return { blob, size: out };
}

type Props = {
  label: string;
  /** Current image (CDN URL) when nothing new was picked. */
  value?: string | null;
  /** Receives the cropped square JPEG. */
  onChange: (file: File) => void;
  minSize?: number;
  /** Small note on the image, e.g. "Uses the YouTube thumbnail (you can replace it)". */
  note?: string;
  disabled?: boolean;
  /** `avatar`: a round picture with only a short "Replace" strip (teacher photo). */
  variant?: 'cover' | 'avatar';
  className?: string;
};

/** Square cover picker: click or drop, centre-crops to 1:1, rejects images that are too small (design: SessionEditor.dc.html "Cover image"). */
export function ImagePicker({ label, value, onChange, minSize = 1200, note, disabled, variant = 'cover', className }: Props) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const take = async (file: File | undefined) => {
    if (!file) return;
    const bad = checkFile(file, RULE);
    if (bad) return setError(bad);
    try {
      const { blob } = await cropToSquare(file, minSize);
      setError(null);
      setPreview(URL.createObjectURL(blob));
      onChange(new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This image could not be read.');
    }
  };

  const shown = preview ?? value ?? null;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) void take(e.dataTransfer.files[0]);
        }}
        aria-label={shown ? `${label}: replace image` : `${label}: choose image`}
        className={cn(
          'relative flex aspect-square w-full flex-col overflow-hidden border bg-teal disabled:cursor-not-allowed disabled:opacity-60',
          variant === 'avatar' ? 'items-stretch justify-end rounded-full' : 'items-start justify-end gap-1 rounded-[14px] p-3 text-left',
          over ? 'border-ember' : error ? 'border-danger-border' : 'border-border-strong',
        )}
      >
        {shown ? <img src={shown} alt="" className="absolute inset-0 size-full object-cover" /> : null}
        {!shown ? (
          <span className="absolute inset-0 flex items-center justify-center text-teal-text">
            <ImagePlus size={28} aria-hidden />
          </span>
        ) : null}
        {/* Captions sit on a dark scrim over a photo, so they keep the dark tokens in both themes. */}
        {variant === 'avatar' ? (
          <span
            data-theme="dark"
            className="relative bg-bg/70 py-1 text-center text-overline font-semibold normal-case tracking-normal text-text"
          >
            {shown ? 'Replace' : 'Add photo'}
          </span>
        ) : (
          <span data-theme="dark" className="relative flex flex-col items-start gap-1">
            {note ? <span className="rounded-lg bg-bg/70 px-2 py-1 text-xs font-semibold text-text">{note}</span> : null}
            <span className="rounded-lg bg-bg/70 px-2 py-1 text-overline font-normal normal-case tracking-normal text-text">
              1:1, min {minSize} px · drop to replace
            </span>
          </span>
        )}
      </button>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={RULE.accept.join(',')}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error ? (
        <p role="alert" className="text-xs font-semibold text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
