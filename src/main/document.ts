import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { IPC } from '../shared/ipc'
import {
  DOCUMENT_EXTENSION,
  DOCUMENT_TYPE_NAME,
  type CreateDocumentRequest,
  type DocumentResult,
  type DocumentStamp,
  type OpenDocument,
} from '../shared/document'
import {
  documentFileName,
  readDocumentAt,
  resolveDocumentPath,
  writeDocumentAt,
} from './documentFile'
import { noteRecentDocument, recentDocumentPath, recentDocuments } from './recent'
import { requestOpen, takePendingDocument } from './openRequests'
import { loadLastDocument, saveLastDocument } from './windowState'

/**
 * The open document (PLAN.md D6, D8).
 *
 * This module is the only place in the app that knows a project has a path.
 * The renderer asks it to write, and it writes to whatever is open; the
 * renderer asks it for a new document, and it decides where that goes. Nothing
 * the renderer sends carries a path, which is the invariant that keeps the
 * preload surface small enough to enumerate.
 *
 * The file mechanics — the atomic write, the stamp, the name derivation — live
 * in `documentFile.ts`, which touches no Electron and is covered on its own in
 * the node vitest project, because "rename over the target" is exactly the kind
 * of thing that should not be verified only by driving the app.
 *
 * **`adopt` is the only thing that moves the open document**, and every arrival
 * reaches it through `openRequests.ts` (D15) after the renderer has flushed
 * whatever it was holding (D17).
 */

/** The document the app has open, or `null`. Main's answer, not the renderer's. */
let openPath: string | null = null
/** What it was when we last read or wrote it. Phase F5's guard reads this. */
let openStamp: DocumentStamp | null = null
/**
 * Where the next new document goes (D10). Seeded from the folder of the last
 * document opened, so the second project of a session lands beside the first —
 * and, at launch, from the document the app last had open, so it survives a
 * restart as well.
 */
let newDocumentDirectory: string | null = null

// --- The open document ---

/**
 * Adopt `path` as the open document and read it.
 *
 * The path is resolved first, so that the same file reached two ways — a
 * dropped `/tmp/x` and an `open-file` `/private/tmp/x` (S1) — is one entry in
 * recents and one document here.
 */
function adopt(path: string): OpenDocument {
  const resolved = resolveDocumentPath(path) ?? path
  const document = readDocumentAt(resolved)
  openPath = resolved
  openStamp = document.stamp
  // The next new document lands beside the one just opened (D10).
  newDocumentDirectory = dirname(resolved)
  // Recents are the desktop's primary navigation (D16), and the last document
  // is what the next launch reopens (D11).
  noteRecentDocument(resolved)
  saveLastDocument(resolved)
  return document
}

/** Adopt a path, with the failure worded for the renderer's banner. */
function adoptResult(path: string): DocumentResult<OpenDocument> {
  try {
    return { status: 'ok', value: adopt(path) }
  } catch (error) {
    return { status: 'error', reason: reasonOf(error) }
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Where a new document goes right now (D10). */
function currentLocation(): string {
  return newDocumentDirectory ?? app.getPath('documents')
}

function create(request: CreateDocumentRequest): DocumentResult<OpenDocument> {
  const directory = currentLocation()
  const path = join(directory, documentFileName(request.name))
  try {
    mkdirSync(directory, { recursive: true })
    // Creating a document must never eat one that is already there. Asking for
    // another name is a better answer than a suffix nobody asked for on a file
    // they are about to spend an evening in.
    if (existsSync(path)) {
      return { status: 'error', reason: `"${basename(path)}" already exists in that folder.` }
    }
    writeDocumentAt(path, request.text)
    return adoptResult(path)
  } catch (error) {
    return { status: 'error', reason: reasonOf(error) }
  }
}

/**
 * Run the Open dialog, and put what the user chose into the arrival path
 * rather than answering with it.
 *
 * The dialog is one of six ways a document arrives and it is not the special
 * one, so it ends where a double-click ends: pending, until the renderer has
 * flushed and asks for it (D15, D17).
 */
async function open(parent: BrowserWindow | null): Promise<void> {
  const options = {
    properties: ['openFile' as const],
    defaultPath: currentLocation(),
    filters: [
      // One row for both names: a dialog filter matches on the last extension,
      // so `json` is what admits a v1 `.vic20.json` export (D3).
      { name: DOCUMENT_TYPE_NAME, extensions: [DOCUMENT_EXTENSION, 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  }
  const { canceled, filePaths } = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  const path = filePaths[0]
  if (canceled || !path) return
  requestOpen(path)
}

/** Hand over whatever is waiting, adopting it in the act (D15). */
function takePending(): DocumentResult<OpenDocument> {
  const path = takePendingDocument()
  return path ? adoptResult(path) : { status: 'none' }
}

/** Open a recent document by the opaque id the renderer was given (D16). */
function openRecent(id: string): void {
  const path = recentDocumentPath(id)
  if (path) requestOpen(path)
}

/**
 * Reopen the document that was open when the app last quit (D11).
 *
 * It goes through the arrival path like everything else, so the renderer
 * decides when it lands — which at launch is before the first paint, and is why
 * relaunching puts you back in the editor rather than on the launcher.
 */
export function restoreLastDocument(): void {
  const remembered = loadLastDocument()
  if (!remembered) return
  const path = resolveDocumentPath(remembered)
  if (!path) {
    // Deleted, renamed or on a volume that is not mounted: the start screen is
    // the honest answer, and the app stops asking for it.
    saveLastDocument(null)
    return
  }
  newDocumentDirectory = dirname(path)
  requestOpen(path)
}

/**
 * Re-read the open document.
 *
 * The renderer calls this on every mount, so a ⌘R at `/edit/<id>` finds its way
 * back to the file rather than to storage that no longer holds it (D9).
 */
function current(): DocumentResult<OpenDocument> {
  if (!openPath) return { status: 'none' }
  if (!existsSync(openPath)) {
    return { status: 'error', reason: `"${basename(openPath)}" could not be found.` }
  }
  try {
    const document = readDocumentAt(openPath)
    openStamp = document.stamp
    return { status: 'ok', value: document }
  } catch (error) {
    return { status: 'error', reason: reasonOf(error) }
  }
}

function write(text: string): DocumentResult<DocumentStamp> {
  if (!openPath) return { status: 'error', reason: 'No document is open.' }
  try {
    openStamp = writeDocumentAt(openPath, text)
    return { status: 'ok', value: openStamp }
  } catch (error) {
    return { status: 'error', reason: reasonOf(error) }
  }
}

function close(): void {
  openPath = null
  openStamp = null
  // Closing a document is a decision: the next launch shows the start screen
  // rather than reopening what was deliberately put away (D11).
  saveLastDocument(null)
}

function reveal(): void {
  if (openPath) shell.showItemInFolder(openPath)
}

async function chooseLocation(parent: BrowserWindow | null): Promise<string | null> {
  const options = {
    properties: ['openDirectory' as const, 'createDirectory' as const],
    defaultPath: currentLocation(),
  }
  const { canceled, filePaths } = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  const path = filePaths[0]
  if (canceled || !path) return null
  newDocumentDirectory = path
  return path
}

/** The open document's path, for the parts of main that need it (F4, F5). */
export function openDocumentPath(): string | null {
  return openPath
}

/** The stamp the open document had when we last touched it (F5's guard). */
export function openDocumentStamp(): DocumentStamp | null {
  return openStamp
}

/**
 * Forget everything, including the remembered location. Test-only: the app
 * closes a document, but it never un-remembers where the last one was.
 */
export function resetDocumentState(): void {
  close()
  newDocumentDirectory = null
}

/**
 * Wire the document surface to its channels. A dialog hangs off the window the
 * request came from, so it opens as a sheet rather than as a loose window — the
 * same rule `dialogs.ts` follows.
 */
export function registerDocumentHandlers(): void {
  const parentOf = (event: Electron.IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(event.sender)

  ipcMain.handle(IPC.DOCUMENT_CREATE, (_event, request: CreateDocumentRequest) => create(request))
  ipcMain.handle(IPC.DOCUMENT_OPEN, (event) => open(parentOf(event)))
  ipcMain.handle(IPC.DOCUMENT_TAKE_PENDING, () => takePending())
  ipcMain.on(IPC.DOCUMENT_DROPPED, (_event, path: string) => requestOpen(path))
  ipcMain.handle(IPC.DOCUMENT_RECENT, () => recentDocuments())
  ipcMain.handle(IPC.DOCUMENT_OPEN_RECENT, (_event, id: string) => openRecent(id))
  ipcMain.handle(IPC.DOCUMENT_CURRENT, () => current())
  ipcMain.handle(IPC.DOCUMENT_WRITE, (_event, text: string) => write(text))
  ipcMain.handle(IPC.DOCUMENT_CLOSE, () => close())
  ipcMain.handle(IPC.DOCUMENT_REVEAL, () => reveal())
  ipcMain.handle(IPC.DOCUMENT_DEFAULT_LOCATION, () => currentLocation())
  ipcMain.handle(IPC.DOCUMENT_CHOOSE_LOCATION, (event) => chooseLocation(parentOf(event)))
}
