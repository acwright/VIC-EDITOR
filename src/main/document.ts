import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { IPC } from '../shared/ipc'
import {
  DOCUMENT_EXTENSION,
  DOCUMENT_TYPE_NAME,
  LEGACY_DOCUMENT_EXTENSION,
  type CreateDocumentRequest,
  type DocumentResult,
  type DocumentStamp,
  type OpenDocument,
} from '../shared/document'

/**
 * The open document (PLAN.md D6, D8).
 *
 * This module is the only place in the app that knows a project has a path.
 * The renderer asks it to write, and it writes to whatever is open; the
 * renderer asks it for a new document, and it decides where that goes. Nothing
 * the renderer sends carries a path, which is the invariant that keeps the
 * preload surface small enough to enumerate.
 *
 * The file mechanics — the atomic write, the stamp, the name derivation — are
 * exported on their own and covered by `__tests__/document.spec.ts` in the node
 * vitest project, because "rename over the target" is exactly the kind of thing
 * that should not be verified only by driving the app.
 */

/** The document the app has open, or `null`. Main's answer, not the renderer's. */
let openPath: string | null = null
/** What it was when we last read or wrote it. Phase F5's guard reads this. */
let openStamp: DocumentStamp | null = null
/**
 * Where the next new document goes (D10). Seeded from the folder of the last
 * document opened, so the second project of a session lands beside the first.
 * In memory only for now — Phase F4 remembers the last document across launches
 * and will seed this from that instead.
 */
let newDocumentDirectory: string | null = null

// --- File mechanics (no Electron state; covered by the node spec) ---

/**
 * The name a document shows under: its filename with the extension taken off.
 *
 * The compound v1 name is tried first, or `Title Screen.vic20.json` would come
 * back as `Title Screen.vic20` (D3).
 */
export function documentName(path: string): string {
  const file = basename(path)
  for (const extension of [LEGACY_DOCUMENT_EXTENSION, DOCUMENT_EXTENSION]) {
    if (file.toLowerCase().endsWith(`.${extension}`)) return file.slice(0, -(extension.length + 1))
  }
  // Anything else was opened through the All Files row; drop its last extension.
  return basename(file, extname(file)) || file
}

/**
 * A project name as a filename. Only what a filesystem refuses is touched —
 * the separators and Windows' reserved set — so "Title Screen" stays
 * `Title Screen.vic20` rather than becoming a slug (D3).
 */
export function documentFileName(name: string): string {
  const safe =
    name
      .replace(/[<>:"/\\|?*]/g, ' ')
      .replace(/\s+/g, ' ')
      // A leading dot hides the file; a trailing dot or space is dropped by Windows.
      .replace(/^[.\s]+|[.\s]+$/g, '') || 'Project'
  return `${safe}.${DOCUMENT_EXTENSION}`
}

/** What a file is right now (D6). */
export function stampOf(path: string): DocumentStamp {
  const stats = statSync(path)
  return { mtimeMs: stats.mtimeMs, size: stats.size }
}

/** Read a document off disk. Throws with the reason when it cannot be read. */
export function readDocumentAt(path: string): OpenDocument {
  const text = readFileSync(path, 'utf-8')
  return { path, name: documentName(path), text, stamp: stampOf(path) }
}

/**
 * Write a document atomically (D6): a temporary file beside the target, then a
 * `rename` over it. A crash mid-write leaves the old charset intact rather than
 * a truncated one, which is the whole reason this is not a plain
 * `writeFileSync`.
 *
 * The temporary lives in the *same directory* on purpose: `rename` is atomic
 * only within a filesystem, and the system temp directory is often another one.
 */
export function writeDocumentAt(path: string, text: string): DocumentStamp {
  const temporary = `${path}.tmp`
  try {
    writeFileSync(temporary, text, 'utf-8')
    renameSync(temporary, path)
  } catch (error) {
    // Never leave a half-written .tmp beside the user's project.
    try {
      if (existsSync(temporary)) unlinkSync(temporary)
    } catch {
      // The write already failed; failing to tidy up is not the story to tell.
    }
    throw error
  }
  return stampOf(path)
}

// --- The open document ---

/** Adopt `path` as the open document and read it. */
function adopt(path: string): OpenDocument {
  const document = readDocumentAt(path)
  openPath = path
  openStamp = document.stamp
  // The next new document lands beside the one just opened (D10).
  newDocumentDirectory = dirname(path)
  return document
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
    return { status: 'ok', value: adopt(path) }
  } catch (error) {
    return { status: 'error', reason: reasonOf(error) }
  }
}

async function open(parent: BrowserWindow | null): Promise<DocumentResult<OpenDocument>> {
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
  if (canceled || !path) return { status: 'none' }

  try {
    return { status: 'ok', value: adopt(path) }
  } catch (error) {
    return { status: 'error', reason: reasonOf(error) }
  }
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
  ipcMain.handle(IPC.DOCUMENT_CURRENT, () => current())
  ipcMain.handle(IPC.DOCUMENT_WRITE, (_event, text: string) => write(text))
  ipcMain.handle(IPC.DOCUMENT_CLOSE, () => close())
  ipcMain.handle(IPC.DOCUMENT_REVEAL, () => reveal())
  ipcMain.handle(IPC.DOCUMENT_DEFAULT_LOCATION, () => currentLocation())
  ipcMain.handle(IPC.DOCUMENT_CHOOSE_LOCATION, (event) => chooseLocation(parentOf(event)))
}
