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

import type {
  CreateDocumentRequest,
  DocumentChange,
  DocumentResult,
  DocumentWriteResult,
  MigrationDocument,
  MigrationResult,
  OpenDocument,
  RecentDocument,
} from './document'
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
    /**
     * Run an open dialog. It resolves when the dialog closes and carries
     * nothing: what the user chose arrives through `onPending` like every
     * other way into a document (D15).
     */
    open(): Promise<void>
    /**
     * A document is waiting — a double-click, a drop, Open Recent, the Open
     * dialog, or the last document at launch (D11, D15). Returns an
     * unsubscribe function.
     */
    onPending(callback: () => void): () => void
    /**
     * Adopt what is waiting. `none` when nothing is, which is what a launch
     * with no document to reopen answers.
     *
     * **Flush before calling this.** Main swaps the open document here, so a
     * write still in the autosave window has to have landed in the old file
     * already (D17).
     */
    takePending(): Promise<DocumentResult<OpenDocument>>
    /**
     * The user dropped a file on the window. The preload turns the `File` into
     * a path with `webUtils.getPathForFile` (S5) — which the isolated renderer
     * has no way to do itself — and hands main a path the user just produced,
     * exactly as a dialog would (D8).
     */
    dropped(file: File): void
    /** Recent Documents, for the start screen's list (D16). */
    recent(): Promise<RecentDocument[]>
    /** Open a recent document by its opaque id. Arrives through `onPending`. */
    openRecent(id: string): Promise<void>
    /**
     * Re-read the open document. `none` when there is none — which is how the
     * renderer finds its way back after a reload (D9).
     */
    current(): Promise<DocumentResult<OpenDocument>>
    /**
     * Write to the open document, atomically (D6). Answers with its new stamp,
     * or with `conflict` when the file no longer matches the stamp main is
     * holding — a branch switch, another editor, a deletion. A conflict is not
     * a failure: it is the write declining to happen, and D7 is the renderer
     * answering it.
     *
     * `force` is that answer — overwrite what is on disk, or recreate a file
     * that is gone — and belongs to a choice the user just made.
     */
    write(text: string, force?: boolean): Promise<DocumentWriteResult>
    /**
     * The open document changed on disk, or is gone (D7). Returns an
     * unsubscribe function.
     *
     * An announcement rather than an instruction: whether the change can simply
     * be taken depends on the unsaved edit the renderer is holding, which is
     * why main does not decide.
     */
    onChanged(callback: (change: DocumentChange) => void): () => void
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
  /**
   * The one-time move out of browser storage (PLAN.md D19). **Absent in the
   * browser build**, which is not going anywhere (D20).
   *
   * The two processes each know half of it: main holds the marker and writes
   * the files, and only the renderer can read the `localStorage` the projects
   * are in. So the renderer reads and serializes, and hands the text over —
   * still without naming a file (D8).
   */
  migration: {
    /**
     * Whether the migration has yet to happen. True until a run has written
     * something; the renderer still has to check whether there is anything to
     * copy, which is the half main cannot see.
     */
    pending(): Promise<boolean>
    /** Where the copies would go, as it should read on screen (~ collapsed). */
    folder(): Promise<string>
    /** Run a folder dialog and remember the answer; `null` if cancelled. */
    choose(): Promise<string | null>
    /**
     * Write these projects, seed Recent Documents with them, and set the
     * marker. Nothing here touches the originals — removing those is the
     * renderer's to offer afterwards, and never automatic (D19).
     */
    run(documents: MigrationDocument[]): Promise<MigrationResult>
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
