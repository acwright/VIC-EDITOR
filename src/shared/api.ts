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

import type { CreateDocumentRequest, DocumentResult, DocumentStamp, OpenDocument } from './document'
import type { MenuContext } from './menu'

/** The platforms we ship for. Anything else falls through as a bare string. */
export type Platform = 'darwin' | 'win32' | 'linux' | (string & NonNullable<unknown>)

/** What a save dialog is given: the bytes to write and the name to suggest. */
export interface SaveFileRequest {
  /**
   * The suggested filename, extension included. The extension also picks the
   * dialog's filter row, so it is not decoration.
   */
  filename: string
  /** Exactly what lands on disk — text is UTF-8 encoded by the caller. */
  data: Uint8Array
}

/** What an open dialog offers. */
export interface OpenFileRequest {
  /** Extensions without the dot, e.g. `['json']`. */
  extensions: string[]
}

/** A file the user chose, read as UTF-8. */
export interface OpenedTextFile {
  path: string
  text: string
}

export interface AppApi {
  app: {
    /** The packaged app's version — `app.getVersion()`, not `__APP_VERSION__`. */
    getVersion(): Promise<string>
    /** `process.platform` of the main process, captured at preload time. */
    readonly platform: Platform
    /**
     * Called when the window is closing. Flush, then call `saveComplete()`.
     * Returns an unsubscribe function.
     *
     * The callback may be async — flushing goes through async storage
     * (PLAN.md D1) — and is expected to call `saveComplete()` itself once the
     * flush settles. Nothing awaits the promise it returns; main's own
     * 5-second safety valve is the backstop.
     */
    onBeforeQuit(callback: () => void | Promise<void>): () => void
    /** Tell main the flush is done and it may close for real. */
    saveComplete(): void
  }
  files: {
    /**
     * Run a save dialog, then write. Resolves to the path written, or `null`
     * if the user cancelled — cancelling is a no-op, not an error. A write
     * that fails is reported by main in a native error box and also resolves
     * to `null`, so the renderer has one thing to check either way.
     */
    save(request: SaveFileRequest): Promise<string | null>
    /**
     * Run an open dialog, then read the chosen file as UTF-8. Resolves to
     * `null` if the user cancelled.
     */
    openText(request: OpenFileRequest): Promise<OpenedTextFile | null>
  }
  /**
   * The open document (PLAN.md D8). **Absent in the browser build**, like the
   * rest of `window.api` — the web app keeps its projects in `localStorage`
   * and its project manager (D20).
   *
   * Nothing here takes a path. `write` writes to whatever main has open, and
   * `create` puts the new document in the folder main is holding — so the
   * renderer can display where a file is and can never name one.
   */
  document: {
    /**
     * Write a new document into the current location and adopt it. Fails
     * rather than overwriting when a file of that name is already there.
     */
    create(request: CreateDocumentRequest): Promise<DocumentResult<OpenDocument>>
    /** Run an open dialog and adopt what was chosen. `none` if cancelled. */
    open(): Promise<DocumentResult<OpenDocument>>
    /**
     * Re-read the open document. `none` when there is none — which is how the
     * renderer finds its way back after a reload (D9).
     */
    current(): Promise<DocumentResult<OpenDocument>>
    /** Write to the open document, atomically (D6). Answers with its new stamp. */
    write(text: string): Promise<DocumentResult<DocumentStamp>>
    /** Forget the open document. Writes nothing. */
    close(): Promise<void>
    /** Show the open document in Finder / Explorer / the desktop's file manager. */
    reveal(): Promise<void>
    /** Where a new document would go right now, for the New dialog's row (D10). */
    defaultLocation(): Promise<string>
    /**
     * Run a folder dialog; main remembers the result and returns it for
     * display. `null` if the user cancelled.
     */
    chooseLocation(): Promise<string | null>
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
