import { vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

/** In-memory stand-in for a socket.io client socket. `fire()` plays the server side. */
export class FakeSocket {
  connected = false;
  emitted: { event: string; payload: unknown }[] = [];
  private handlers = new Map<string, Set<Handler>>();

  constructor(
    public uri: string,
    public opts: { auth?: (cb: (data: object) => void) => void; transports?: string[] },
  ) {}

  on(event: string, h: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(h);
    return this;
  }

  off(event: string, h: Handler) {
    this.handlers.get(event)?.delete(h);
    return this;
  }

  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
    return this;
  }

  connect = vi.fn(() => this);
  disconnect = vi.fn(() => {
    this.connected = false;
    return this;
  });

  /** Server → client event. Returns after async handlers settle. */
  async fire(event: string, ...args: unknown[]) {
    if (event === 'connect') this.connected = true;
    if (event === 'disconnect') this.connected = false;
    await Promise.all([...(this.handlers.get(event) ?? [])].map((h) => h(...args)));
  }

  listenerCount = (event: string) => this.handlers.get(event)?.size ?? 0;
  sent = (event: string) => this.emitted.filter((e) => e.event === event).map((e) => e.payload);
  /** The handshake payload the client would send right now. */
  handshake() {
    let data: object = {};
    this.opts.auth?.((d) => {
      data = d;
    });
    return data;
  }
}

export const sockets: FakeSocket[] = [];
export const lastSocket = () => sockets[sockets.length - 1]!;

/** Use as the factory result of `vi.mock('socket.io-client', …)`. */
export const fakeIo = (uri: string, opts: FakeSocket['opts']) => {
  const s = new FakeSocket(uri, opts);
  sockets.push(s);
  return s;
};
