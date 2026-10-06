import { useEffect, useState } from 'react';

/** The value, once it has stopped changing for `ms` (search boxes: 300 ms, spec §12). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** Window height minus what sits above and below a table, so the table fills the screen. */
export function useAvailableHeight(reserved: number, min = 320): number {
  const measure = () => Math.max(min, (typeof window === 'undefined' ? 900 : window.innerHeight) - reserved);
  const [h, setH] = useState(measure);
  useEffect(() => {
    const onResize = () => setH(measure());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reserved, min]);
  return h;
}
