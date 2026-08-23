import { BrowserWindow, app, dialog, ipcMain, type FileFilter } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { IPC } from '../shared/ipc'
import { DOCUMENT_EXTENSION, DOCUMENT_TYPE_NAME } from '../shared/document'
import type { OpenFileRequest, OpenedTextFile, SaveFileRequest } from '../shared/api'

/**
 * Native open and save dialogs.
 *
 * The renderer never learns a path unless the user picked one: it hands over
 * bytes and a suggested filename, main runs the dialog and does the write.
 * Cancelling is not a failure — every entry point here resolves to `null`, and
 * the renderer treats that as "nothing happened" rather than as an error worth
 * a toast. A write that genuinely fails is reported here, in a native error
 * box, because main is the side that knows why.
 */

/**
 * What each extension is called in the dialog's filter row. Anything not
 * listed falls back to the extension in caps, which is a worse label but never
 * a wrong one.
 */
const FILTER_NAMES: Record<string, string> = {
  s: 'Assembly Source',
  a: 'Assembly Source',
  asm: 'Assembly Source',
  bas: 'BASIC Listing',
  prg: 'PRG Program',
  bin: 'Binary',
  png: 'PNG Image',
  json: 'Project File',
  // *Save a Copy…* suggests `<name>.vic20`, so the filter row this dialog
  // picks from the extension has to know the document type's own name (D3, F7).
  [DOCUMENT_EXTENSION]: DOCUMENT_TYPE_NAME,
}

/** Where the last save and the last open landed, per §7 Phase E4. */
interface DialogState {
  saveDirectory?: string
  openDirectory?: string
}

const FILE = (): string => join(app.getPath('userData'), 'dialog-state.json')

function loadState(): DialogState {
  try {
    const parsed = JSON.parse(readFileSync(FILE(), 'utf-8')) as Partial<DialogState>
    return {
      saveDirectory: typeof parsed.saveDirectory === 'string' ? parsed.saveDirectory : undefined,
      openDirectory: typeof parsed.openDirectory === 'string' ? parsed.openDirectory : undefined,
    }
  } catch {
    return {}
  }
}

function saveState(state: DialogState): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(FILE(), JSON.stringify(state, null, 2), 'utf-8')
  } catch (error) {
    // Forgetting where the last export went is not a reason to fail the export.
    console.error('[dialogs] save state:', error)
  }
}

/** `['bin']` → a Binary row plus an All Files escape hatch. */
function filtersFor(extensions: string[]): FileFilter[] {
  const named = extensions
    .filter((extension) => extension !== '')
    .map((extension) => ({
      name: FILTER_NAMES[extension] ?? extension.toUpperCase(),
      extensions: [extension],
    }))
  return [...named, { name: 'All Files', extensions: ['*'] }]
}

/**
 * A save dialog followed by the write. Resolves to the path written, or `null`
 * if the user cancelled or the write failed.
 */
async function saveFile(
  parent: BrowserWindow | null,
  request: SaveFileRequest,
): Promise<string | null> {
  const state = loadState()
  const options = {
    // A remembered directory means the second export of a session starts where
    // the first one landed; the first falls back to the platform's downloads
    // folder, which is where the browser build would have put it.
    defaultPath: join(state.saveDirectory ?? app.getPath('downloads'), request.filename),
    filters: filtersFor([extname(request.filename).replace('.', '')]),
  }
  const { canceled, filePath } = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options)
  if (canceled || !filePath) return null

  try {
    writeFileSync(filePath, request.data)
  } catch (error) {
    reportFailure(parent, 'Export failed', filePath, error)
    return null
  }

  saveState({ ...state, saveDirectory: dirname(filePath) })
  return filePath
}

/**
 * An open dialog followed by a UTF-8 read. Resolves to `null` if the user
 * cancelled or the file could not be read.
 */
async function openTextFile(
  parent: BrowserWindow | null,
  request: OpenFileRequest,
): Promise<OpenedTextFile | null> {
  const state = loadState()
  const options = {
    properties: ['openFile' as const],
    ...(state.openDirectory ? { defaultPath: state.openDirectory } : {}),
    filters: filtersFor(request.extensions),
  }
  const { canceled, filePaths } = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  const path = filePaths[0]
  if (canceled || !path) return null

  let text: string
  try {
    text = readFileSync(path, 'utf-8')
  } catch (error) {
    reportFailure(parent, 'Import failed', path, error)
    return null
  }

  saveState({ ...state, openDirectory: dirname(path) })
  return { path, text }
}

function reportFailure(
  parent: BrowserWindow | null,
  title: string,
  path: string,
  error: unknown,
): void {
  const detail = `${path}\n\n${error instanceof Error ? error.message : String(error)}`
  if (parent) void dialog.showMessageBox(parent, { type: 'error', message: title, detail })
  else dialog.showErrorBox(title, detail)
}

/**
 * Wire both dialogs to their channels. The window a dialog hangs off is the one
 * the request came from, so it opens as a sheet rather than as a loose window.
 */
export function registerDialogHandlers(): void {
  ipcMain.handle(IPC.FILE_SAVE, (event, request: SaveFileRequest) =>
    saveFile(BrowserWindow.fromWebContents(event.sender), request),
  )
  ipcMain.handle(IPC.FILE_OPEN_TEXT, (event, request: OpenFileRequest) =>
    openTextFile(BrowserWindow.fromWebContents(event.sender), request),
  )
}
