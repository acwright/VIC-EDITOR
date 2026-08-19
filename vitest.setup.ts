/**
 * Node's experimental webstorage global (Node 22+) shadows jsdom's
 * localStorage with an unusable stub (undefined unless Node is launched with
 * --localstorage-file). Install a working in-memory implementation so tests
 * exercise real storage behavior.
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

if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
  })
}

if (!globalThis.sessionStorage) {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: new MemoryStorage(),
    configurable: true,
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
