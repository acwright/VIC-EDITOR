import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'
import {
  DOCUMENT_EXTENSION,
  MIGRATION_FOLDER_NAME,
  type MigrationDocument,
  type MigrationFailure,
  type MigrationResult,
  type MigrationWritten,
} from '../shared/document'
import { documentFileName, writeDocumentAt } from './documentFile'
import { useDocumentDirectory } from './document'
import { displayDirectory, noteRecentDocument } from './recent'

/**
 * The one-time move out of browser storage (PLAN.md D19).
 *
 * A `v1.6` desktop user's projects live in the app's own `localStorage` and
 * nowhere else. `v2.0` cannot read them from here — `localStorage` belongs to
 * the renderer's origin — so the two processes split the job the way they split
 * everything else in this round: **the renderer reads and serializes, main
 * writes and remembers.** What crosses is a name and some text, never a path
 * (D8).
 *
 * Three properties are the whole point of the phase:
 *
 * - **It copies.** Nothing here removes anything from browser storage. If a
 *   copy went wrong the originals are still there — and the sheet says so —
 *   which is also what makes downgrading to `v1.6` still work.
 * - **It happens once.** A marker in `userData` is what says so, and it is set
 *   only when something was actually written.
 * - **It never silently drops a project.** A name already taken gets a suffix
 *   rather than overwriting a file, and a project that could not be written is
 *   named in the result with the reason.
 *
 * The marker is main's rather than the renderer's on purpose: `localStorage` is
 * exactly the thing this round is moving away from, and a marker stored beside
 * the projects it describes would be cleared by the same "clear browsing data"
 * that clears them — offering to migrate projects that are no longer there.
 */

/** `<userData>/migration.json`: written once, read at every launch. */
const FILE = (): string => join(app.getPath('userData'), 'migration.json')

/**
 * A folder the user picked in place of the default, for this launch.
 *
 * Not remembered across launches: the choice only exists inside the one sheet
 * that offers it, and the sheet is shown once.
 */
let chosenFolder: string | null = null

/** Where the copies go (D19, §9). */
function folder(): string {
  return chosenFolder ?? join(app.getPath('documents'), MIGRATION_FOLDER_NAME)
}

/** Whether the migration is still to happen — i.e. the marker is not set. */
export function migrationPending(): boolean {
  return !existsSync(FILE())
}

/**
 * Record that it happened, with what it did.
 *
 * The contents are for a person reading the folder later, and for anyone
 * debugging a report of "it asked me twice"; nothing in the app reads them
 * back — the file's *existence* is the marker.
 */
function markMigrated(directory: string, count: number): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    const record = { migratedAt: new Date().toISOString(), folder: directory, count }
    writeFileSync(FILE(), `${JSON.stringify(record, null, 2)}\n`, 'utf-8')
  } catch (error) {
    // A marker that cannot be written means the offer comes back next launch,
    // which is annoying and safe. It is not a reason to fail the migration —
    // the files are already on disk by the time this runs.
    console.error('[migration] marker:', error)
  }
}

/** What the marker says, for the tests and for anything that wants the folder. */
export function migrationRecord(): { migratedAt: string; folder: string; count: number } | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(FILE(), 'utf-8'))
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as { migratedAt: string; folder: string; count: number })
      : null
  } catch {
    return null
  }
}

/**
 * A path in `directory` that is not taken — by a file already there, or by one
 * this same run is about to write.
 *
 * Two projects can share a name in browser storage, where the id is the
 * identity; a filename cannot. `Star Voyager 2.vic20` is the answer, in the
 * shape the platform's own file managers use, and it is why this is a copy that
 * cannot lose a project rather than one that can overwrite one.
 */
function freePath(directory: string, name: string, taken: Set<string>): string {
  const file = documentFileName(name)
  const stem = file.slice(0, -(DOCUMENT_EXTENSION.length + 1))
  for (let index = 1; ; index++) {
    const candidate = index === 1 ? file : `${stem} ${index}.${DOCUMENT_EXTENSION}`
    const key = candidate.toLowerCase()
    const path = join(directory, candidate)
    if (!taken.has(key) && !existsSync(path)) {
      taken.add(key)
      return path
    }
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Write every project, seed recents with them, and set the marker (D19).
 *
 * The order given is most-recently-modified first, which is the order the sheet
 * lists them in; recents are seeded in reverse so that the newest project ends
 * up at the *top* of Recent Documents rather than the bottom.
 */
export function migrateDocuments(documents: MigrationDocument[]): MigrationResult {
  const directory = folder()
  const written: MigrationWritten[] = []
  const failed: MigrationFailure[] = []
  const paths: string[] = []
  const taken = new Set<string>()

  try {
    mkdirSync(directory, { recursive: true })
  } catch (error) {
    // The folder itself is the failure, so every project shares it — and the
    // marker stays unset, because this migration has not happened.
    const reason = reasonOf(error)
    return {
      folder: displayDirectory(directory),
      written: [],
      failed: documents.map(({ id, name }) => ({ id, name, reason })),
      done: false,
    }
  }

  for (const document of documents) {
    try {
      const path = freePath(directory, document.name, taken)
      writeDocumentAt(path, document.text)
      written.push({ id: document.id, file: path.slice(directory.length + 1) })
      paths.push(path)
    } catch (error) {
      failed.push({ id: document.id, name: document.name, reason: reasonOf(error) })
    }
  }

  for (const path of [...paths].reverse()) noteRecentDocument(path)

  const done = written.length > 0
  if (done) {
    markMigrated(directory, written.length)
    // The copies are where this user's projects now are, so the next *New…*
    // should land beside them rather than in `~/Documents` (D10).
    useDocumentDirectory(directory)
  }
  return { folder: displayDirectory(directory), written, failed, done }
}

async function choose(parent: BrowserWindow | null): Promise<string | null> {
  const options = {
    properties: ['openDirectory' as const, 'createDirectory' as const],
    defaultPath: folder(),
  }
  const { canceled, filePaths } = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  const path = filePaths[0]
  if (canceled || !path) return null
  chosenFolder = path
  return displayDirectory(path)
}

/** Test-only: forget the folder a run chose, the way a fresh launch would. */
export function resetMigrationState(): void {
  chosenFolder = null
}

/** For the tests and for `run`; exported so the spec need not guess the default. */
export function migrationFolder(): string {
  return folder()
}

export function registerMigrationHandlers(): void {
  const parentOf = (event: Electron.IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(event.sender)

  ipcMain.handle(IPC.MIGRATION_PENDING, () => migrationPending())
  ipcMain.handle(IPC.MIGRATION_FOLDER, () => displayDirectory(folder()))
  ipcMain.handle(IPC.MIGRATION_CHOOSE, (event) => choose(parentOf(event)))
  ipcMain.handle(IPC.MIGRATION_RUN, (_event, documents: MigrationDocument[]) =>
    migrateDocuments(documents),
  )
}
