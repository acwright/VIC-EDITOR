/**
 * The Electron bridge, from the renderer's side.
 *
 * The same component tree runs in a browser tab and in a native window, so
 * `window.api` is present in one and absent in the other. Rather than let that
 * check spread through the views, it lives here: `desktop()` returns the bridge
 * or `null`, and callers branch once on the result.
 */
import type { AppApi } from '@shared/api'

/** The bridge the preload script exposed, or `null` in the browser build. */
export function desktop(): AppApi | null {
  if (typeof window === 'undefined') return null
  return (window as Window & { api?: AppApi }).api ?? null
}

/** Whether this is the desktop app. */
export function isDesktop(): boolean {
  return desktop() !== null
}
