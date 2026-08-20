/**
 * The preload bridge's contract, shared by both sides of it.
 *
 * The preload script implements this and hands it to the renderer as
 * `window.api`; the renderer imports the type to know what it is holding.
 * Deliberately tiny and explicit — there is no `ipcRenderer` passthrough, so
 * the renderer can reach exactly what is listed here and nothing else.
 *
 * `window.api` is **undefined in the browser build**. Every renderer-side
 * caller has to treat it as optional; that check is what keeps one component
 * tree running in two shells.
 */

import type { MenuContext } from './menu'

/** The platforms we ship for. Anything else falls through as a bare string. */
export type Platform = 'darwin' | 'win32' | 'linux' | (string & NonNullable<unknown>)

export interface AppApi {
  app: {
    /** The packaged app's version — `app.getVersion()`, not `__APP_VERSION__`. */
    getVersion(): Promise<string>
    /** `process.platform` of the main process, captured at preload time. */
    readonly platform: Platform
    /**
     * Called when the window is closing. Flush, then call `saveComplete()`.
     * Returns an unsubscribe function.
     */
    onBeforeQuit(callback: () => void): () => void
    /** Tell main the flush is done and it may close for real. */
    saveComplete(): void
  }
  menu: {
    /**
     * Tell the native menu what the view on screen offers. Items whose action
     * is not in `enabled` are shown disabled rather than left silently inert.
     */
    setContext(context: MenuContext): void
    /**
     * A menu item was chosen; the callback gets its action id, which the view
     * feeds to the same handler table its keyboard shortcuts dispatch through.
     * Returns an unsubscribe function.
     */
    onAction(callback: (action: string) => void): () => void
  }
}
