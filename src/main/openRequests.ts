import { app, BrowserWindow } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { IPC } from '../shared/ipc'
import { isDocumentPath, resolveDocumentPath } from './documentFile'

/**
 * Every way a document can arrive, reduced to one code path (PLAN.md D15).
 *
 * macOS `open-file`, a path on `argv` at launch, a `second-instance`'s command
 * line, a file dropped on the window, the Open dialog and Open Recent all end
 * in `requestOpen`. From there exactly one thing happens: the path becomes
 * *pending* and the renderer is told a document is waiting. Nothing is adopted
 * until the renderer asks for it.
 *
 * **That indirection is the point, and it is what makes opening safe.** The
 * renderer holds the edit that a 500 ms autosave has not written yet; if main
 * swapped the open document out from under it, that write would land in the
 * newly opened file. So the renderer flushes first and *then* takes the pending
 * document — the same shape as the before-quit flush, and the reason
 * `takePendingDocument` is the only thing that moves the open document (D17).
 *
 * Two measurements from F0 are built into this file:
 *
 * - **`open-file` beats `whenReady` by milliseconds and arrives before any
 *   window exists** (S2), so the handler is installed at module scope and the
 *   path waits until the renderer asks. A cold-start double-click that "does
 *   nothing" is exactly what the queue rules out.
 * - **`argv` is empty on macOS** (S2). The document arrives only through
 *   `open-file` there, so `documentFromArgv` refuses to look on darwin rather
 *   than reading a path that is never present.
 */

/** The document waiting to be opened, if any. Absolute and resolved. */
let pending: string | null = null

/** The window to notify, once its renderer is up. */
let target: BrowserWindow | null = null
/**
 * Whether the renderer has finished loading.
 *
 * Before it has, a request only sits in `pending`: the renderer asks for it as
 * it starts (`takePending`), which is what covers the cold-start double-click
 * and the reopen-the-last-document launch alike (D11).
 */
let rendererReady = false

/**
 * Take a document request from anywhere at all.
 *
 * A path that is not there is dropped rather than reported: the sources this
 * has — a stale recent, an argument that is not a file — are all ones where
 * silence is the right answer. A path that *is* there but cannot be read is a
 * different thing, and the renderer hears about that when it takes it.
 */
export function requestOpen(path: string): void {
  const resolved = resolveDocumentPath(path)
  if (!resolved) return
  pending = resolved
  notify()
}

/** The waiting document, if any. Taking it clears it. */
export function takePendingDocument(): string | null {
  const path = pending
  pending = null
  return path
}

/** Whether a document is waiting — for the launch path, which asks before showing. */
export function hasPendingDocument(): boolean {
  return pending !== null
}

/**
 * The renderer is up.
 *
 * Called on `did-finish-load`, which also covers a ⌘R: a request that arrived
 * while the window was reloading is still pending and is announced again.
 */
export function rendererDidLoad(window: BrowserWindow): void {
  target = window
  rendererReady = true
  notify()
}

/** The window is gone; stop announcing to it. */
export function rendererDidUnload(): void {
  target = null
  rendererReady = false
}

function notify(): void {
  if (!pending || !rendererReady || !target || target.isDestroyed()) return
  // A double-click on a document while the app is running has to raise the
  // window. macOS activates the app itself; a `second-instance` on Windows and
  // Linux does not, and its window can be minimized.
  if (target.isMinimized()) target.restore()
  target.show()
  target.focus()
  target.webContents.send(IPC.DOCUMENT_PENDING)
}

/**
 * Install the macOS `open-file` handler.
 *
 * **Must be called at module scope**, before `whenReady` — S2 measured
 * `open-file` arriving 0 ms before the ready event on a cold start, so a
 * handler registered inside `whenReady().then()` misses the double-click that
 * launched the app.
 */
export function installOpenFileHandler(): void {
  app.on('open-file', (event, path) => {
    // Without this Electron falls back to its default, which is nothing useful.
    event.preventDefault()
    requestOpen(path)
  })
}

/**
 * The document named on a command line, or null.
 *
 * Windows and Linux deliver a double-click this way — `Exec=… %U` in the
 * `.desktop` entry, `"$appExe %1"` in the NSIS association — both at launch
 * (`process.argv`) and to a running app (`second-instance`).
 *
 * Only a path that **exists and carries one of the app's own extensions**
 * counts. Electron's own switches, a stray `.` from `electron-vite dev` and a
 * flag's value all appear here, and a document is the one thing that can be
 * recognised for what it is rather than guessed at (D3).
 */
export function documentFromArgv(argv: readonly string[]): string | null {
  // The document arrives only through `open-file` on macOS, where argv is
  // empty of it (S2). Reading argv there would find nothing at best.
  if (process.platform === 'darwin') return null
  return (
    argv.slice(1).find((argument) => {
      if (argument.startsWith('-')) return false
      if (!isDocumentPath(argument)) return false
      try {
        return existsSync(argument) && statSync(argument).isFile()
      } catch {
        return false
      }
    }) ?? null
  )
}
