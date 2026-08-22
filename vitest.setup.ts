/**
 * Storage under test is always this in-memory implementation, on every Node
 * version — installed unconditionally rather than only when `localStorage` is
 * missing, because whether it is missing varies by Node and that made the
 * suite's behavior depend on the runtime:
 *
 * - Node 22/26 shadow jsdom's `localStorage` with an experimental webstorage
 *   global that reads as `undefined` unless Node is launched with
 *   `--localstorage-file`, so a "install it if absent" guard installs it.
 * - Node 24 leaves jsdom's own `Storage` in place, so the same guard skips —
 *   and jsdom implements `Storage` as a proxy that `vi.spyOn` cannot
 *   intercept, so a test mocking `setItem` to throw silently mocks nothing.
 *
 * A plain class is spy-able everywhere, which is what the tests need.
 */

class MemoryStorage implements Storage {
  private map = new Map<string, string>()

  get length(): number {
    return this.map.size
  }

  clear(): void {
    this.map.clear()
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, name, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
}

/**
 * jsdom has no canvas implementation, so `getContext('2d')` throws a
 * "Not implemented" console error for every canvas a mounted component renders.
 * Components already treat a null context as "nothing to draw", which is the
 * behaviour we want under test — this just returns null quietly instead of
 * burying real failures in noise. Drawing itself is covered by the pure
 * renderers' specs, which pass their own recording context.
 */
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => null
}

/**
 * jsdom has no layout, so `scrollIntoView` is missing entirely rather than
 * being a no-op. Components that keep a selection visible call it on every
 * selection change; a stub here keeps that out of the components themselves.
 */
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

/**
 * jsdom has no layout and no ResizeObserver. Panels that size a canvas to the
 * space they are given construct one on mount; a stub that never fires is the
 * right behaviour here, since there are no boxes to observe — they keep the
 * default scale or column count, which is what these specs assert against.
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
}
