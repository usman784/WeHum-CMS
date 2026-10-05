import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { auth } from '../lib/api';
import { session } from '../lib/session';
import { mockAuth } from '../mocks/handlers';
import { server } from '../mocks/server';

// Node 25 ships its own half-working global `localStorage`, which hides the jsdom one. Use a plain in-memory store.
if (typeof globalThis.localStorage?.clear !== 'function') {
  const store = new Map<string, string>();
  const memory: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => store.get(k) ?? null,
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, String(v)),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true });
}

// Browser APIs that jsdom does not have but Radix and TanStack Virtual call.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

// A request with no handler fails the test: nothing may reach a real network.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  mockAuth.role = null;
  auth.set(null);
  session.reset();
  document.cookie = 'wh_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterAll(() => server.close());
