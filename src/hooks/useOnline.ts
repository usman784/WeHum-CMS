import { useSyncExternalStore } from 'react';

const subscribe = (l: () => void) => {
  window.addEventListener('online', l);
  window.addEventListener('offline', l);
  return () => {
    window.removeEventListener('online', l);
    window.removeEventListener('offline', l);
  };
};

/** False while the browser reports no network. Drives the offline banner; mutations are disabled meanwhile (spec §10). */
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine);
