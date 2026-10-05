import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';

/** Only one sample plays at a time across the page: starting one stops the other. */
let current: HTMLAudioElement | null = null;

type Props = {
  /** Signed media URL. No element is created until the first play, so a long list makes no requests. */
  src: string | null | undefined;
  /** What is played, e.g. "Kyoto bowl". Used in the button's accessible name. */
  name: string;
  className?: string;
};

/** Round play/pause button for a sound sample (design: Sounds.dc.html "Play sample"). */
export function AudioPreview({ src, name, className }: Props) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(
    () => () => {
      audio.current?.pause();
      if (current === audio.current) current = null;
    },
    [],
  );
  // A new file for the same row: stop and forget the old element.
  useEffect(() => {
    audio.current?.pause();
    audio.current = null;
    setPlaying(false);
    setFailed(false);
  }, [src]);

  const toggle = () => {
    if (!src) return;
    if (!audio.current) {
      const el = new Audio(src);
      el.preload = 'none';
      el.addEventListener('ended', () => setPlaying(false));
      el.addEventListener('pause', () => setPlaying(false));
      el.addEventListener('play', () => setPlaying(true));
      el.addEventListener('error', () => {
        setFailed(true);
        setPlaying(false);
      });
      audio.current = el;
    }
    const el = audio.current;
    if (!el.paused) return el.pause();
    if (current && current !== el) current.pause();
    current = el;
    void el.play().catch(() => setFailed(true));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!src}
      aria-pressed={playing}
      aria-label={failed ? `Cannot play ${name}` : `${playing ? 'Pause' : 'Play'} sample: ${name}`}
      title={!src ? 'No audio yet' : failed ? 'This file cannot be played' : undefined}
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full bg-border transition-colors hover:bg-border-strong disabled:cursor-not-allowed disabled:opacity-50',
        failed ? 'text-danger-text' : 'text-ember-text',
        className,
      )}
    >
      {playing ? <Pause size={14} aria-hidden fill="currentColor" /> : <Play size={14} aria-hidden fill="currentColor" />}
    </button>
  );
}
