import { builtinEnvironments, type Environment } from 'vitest/environments';

/**
 * jsdom, but with Node's own AbortController / AbortSignal.
 * jsdom replaces them with its own classes, and Node's `fetch` / `Request` (used by MSW and react-router in tests)
 * reject a signal that is not Node's. In a real browser there is only one implementation, so this mismatch
 * exists only in the test environment.
 */
export default <Environment>{
  name: 'jsdom-node-abort',
  transformMode: 'web',
  async setup(global, options) {
    const { AbortController, AbortSignal } = global;
    const env = await builtinEnvironments.jsdom.setup(global, options);
    global.AbortController = AbortController;
    global.AbortSignal = AbortSignal;
    return env;
  },
};
