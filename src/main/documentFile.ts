import {
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import {
  DOCUMENT_EXTENSION,
  LEGACY_DOCUMENT_EXTENSION,
  type DocumentStamp,
  type OpenDocument,
} from '../shared/document'

/**
 * The file mechanics behind the open document (PLAN.md D6): the atomic write,
 * the stamp, and the two extensions a document can arrive under.
 *
 * Separate from `document.ts` because none of it touches Electron — which is
 * what lets the node vitest project exercise it without a mock, and what lets
 * `recent.ts` name a document without reaching for the module that owns the
 * open one.
 */

/**
 * The name a document shows under: its filename with the extension taken off.
 *
 * The compound v1 name is tried first, or `Title Screen.vic20.json` would
 * come back as `Title Screen.vic20` (D3).
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

/**
 * A path as the app will hold it: absolute, and with every symlink resolved.
 *
 * S1 measured that `open-file` and a dropped file arrive fully resolved —
 * `/private/tmp/…` rather than `/tmp/…` — while a path typed at a shell does
 * not. Everything that compares two paths (recents, "is this already open?",
 * F5's guard) compares what comes out of here, or the same file arrives twice
 * under two names. Null when there is nothing there to resolve.
 */
export function resolveDocumentPath(path: string): string | null {
  try {
    return realpathSync(resolve(path))
  } catch {
    return null
  }
}

/** Whether a name is one this app opens by double-click (D3). */
export function isDocumentPath(path: string): boolean {
  const file = basename(path).toLowerCase()
  return file.endsWith(`.${DOCUMENT_EXTENSION}`) || file.endsWith(`.${LEGACY_DOCUMENT_EXTENSION}`)
}
