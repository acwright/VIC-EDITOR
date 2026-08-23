import { app } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import type { RecentDocument } from '../shared/document'
import { documentName } from './documentFile'

/**
 * Recent Documents, in `<userData>/recent-documents.json` (PLAN.md D16).
 *
 * The desktop app has no project list — the file system is the list (§4) — so
 * this is the primary navigation rather than a convenience, and it has to be
 * good: deep enough to be useful, pruned of files that are no longer there,
 * and shown in both places a person looks, the File menu and the start screen.
 *
 * **Paths never leave this process.** The renderer is given an opaque `id` per
 * entry and hands it back to open one, so *Open Recent* works without the
 * renderer being able to name a file (D8). The id is a hash of the resolved
 * path, so it is stable across launches and across a rebuild of the list.
 *
 * Paths are stored **resolved**: `open-file` and a dropped file both arrive
 * fully resolved (S1), so anything remembered has to be, or `/tmp/x` and
 * `/private/tmp/x` would sit in the list as two documents.
 *
 * Synchronous I/O, on `windowState.ts`'s model: one small file, read when the
 * menu is built and written when a document is opened, and a read failure
 * falls back to an empty list rather than blocking anything on a corrupt file.
 */

/** Deep enough to be useful, per D16. */
const LIMIT = 16

const FILE = (): string => join(app.getPath('userData'), 'recent-documents.json')

/** Rebuild the menu when the list moves; wired to `buildMenu` in `index.ts`. */
let onChange: (() => void) | null = null

export function onRecentDocumentsChanged(listener: () => void): void {
  onChange = listener
}

function read(): string[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(FILE(), 'utf-8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return []
  }
}

function write(paths: readonly string[]): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(FILE(), `${JSON.stringify(paths, null, 2)}\n`, 'utf-8')
  } catch (error) {
    // A list that cannot be remembered is not a reason to fail an open.
    console.error('[recent] save:', error)
  }
}

/**
 * The recent paths, with the ones that are gone dropped.
 *
 * Pruning happens on every read rather than on a timer: a document deleted or
 * moved behind the app's back should not still be in the File menu the next
 * time it is drawn, and the check is a `stat` per entry on a list of 16.
 */
export function recentDocumentPaths(): string[] {
  const stored = read()
  const live = stored.filter((path) => existsSync(path))
  if (live.length !== stored.length) write(live)
  return live
}

/** Put `path` at the front, keeping the list unique and no longer than `LIMIT`. */
export function noteRecentDocument(path: string): void {
  const paths = [path, ...recentDocumentPaths().filter((entry) => entry !== path)].slice(0, LIMIT)
  write(paths)
  // The platform's own recents — the Dock menu on macOS, the jump list on
  // Windows. Free, and it is where people look first on both.
  app.addRecentDocument(path)
  onChange?.()
}

/** Empty the list, including the platform's own copy of it. */
export function clearRecentDocuments(): void {
  write([])
  app.clearRecentDocuments()
  onChange?.()
}

/**
 * The renderer's view of the list: a name, where it lives, and an opaque
 * handle. No path (D8).
 */
export function recentDocuments(): RecentDocument[] {
  return recentDocumentPaths().map((path) => ({
    id: recentDocumentId(path),
    name: documentName(path),
    directory: displayDirectory(dirname(path)),
  }))
}

/** The path an id names, or null if it is no longer in the list. */
export function recentDocumentPath(id: string): string | null {
  return recentDocumentPaths().find((path) => recentDocumentId(path) === id) ?? null
}

/**
 * An entry's handle. A hash rather than an index, so a list that changed
 * between the start screen reading it and the user clicking cannot open the
 * neighbouring document.
 */
export function recentDocumentId(path: string): string {
  return createHash('sha1').update(path).digest('hex').slice(0, 16)
}

/**
 * A folder as it should read on screen: the home directory collapsed to `~`,
 * the way every other Unix tool writes it. Windows has no such convention, so
 * it gets the path it already recognises.
 */
export function displayDirectory(directory: string): string {
  if (process.platform === 'win32') return directory
  const home = app.getPath('home')
  if (directory === home) return '~'
  return directory.startsWith(home + sep) ? `~${directory.slice(home.length)}` : directory
}
