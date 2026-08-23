import { watch, type FSWatcher } from 'node:fs'
import { basename, dirname } from 'node:path'

/**
 * Noticing that the open document changed underneath us (PLAN.md D7, S3).
 *
 * **The watch is on the document's *directory*, never on the document.** S3
 * measured why, ten trials a row against a real repository: `git checkout`
 * replaces the file rather than rewriting it, so the inode a file watcher holds
 * is gone after the first branch switch. That watcher reports the checkout that
 * kills it and then sees nothing, silently, forever — which is worse than
 * having no watcher at all. A non-recursive watch on `dirname` survives every
 * one of them, and stays quiet: a branch switch touching 21 files produced two
 * events, both naming the document, none from `.git/` or `src/`.
 *
 * Two more things S3 settled and this file assumes:
 *
 * - **Event names carry no information.** macOS reports `rename` for an
 *   in-place write. So an event is only ever a reason to go and look; what
 *   actually changed is decided by the `stat` in `document.ts`.
 * - **This is an optimization, not the mechanism.** Focus + `stat` ships
 *   regardless and is what the app relies on; a directory that cannot be
 *   watched — a volume that went away, a permission — costs the app nothing
 *   but promptness.
 *
 * There is no Electron in here, which is what lets the node vitest project
 * exercise it against a real disk and a real `git checkout`.
 */

/**
 * How long to let events settle before looking.
 *
 * One logical change is several events — a `.tmp` renamed over the target is
 * two, an editor that truncates and rewrites is more — and they arrive within
 * a few milliseconds of each other. Long enough to coalesce those; short
 * enough that a branch switch feels immediate.
 */
const SETTLE_MS = 60

let watcher: FSWatcher | null = null
/** The document being watched, absolute and resolved. */
let watched: string | null = null
let settle: ReturnType<typeof setTimeout> | undefined

/**
 * Watch the directory `path` lives in, and call `onChange` when something in it
 * touches that name. Passing `null` stops watching.
 *
 * Re-arming is the caller's job and is not optional: the watch is per
 * *directory*, so a document opened somewhere else needs a new one (S3).
 */
export function watchDocument(path: string | null, onChange: () => void): void {
  stopWatchingDocument()
  if (!path) return

  const file = basename(path)
  try {
    // `persistent: false` so the watcher never holds the process open — the app
    // quits when its window closes, not when its watchers are collected.
    watcher = watch(dirname(path), { persistent: false }, (_event, name) => {
      // The event name is the only thing worth reading here, and only to ignore
      // the neighbors: the `.tmp` of our own atomic write is one of them.
      // A null name (which some platforms send) is taken as "go and look".
      if (name !== null && basename(name.toString()) !== file) return
      clearTimeout(settle)
      settle = setTimeout(onChange, SETTLE_MS)
    })
    // A watcher that errors is a watcher that has stopped. Drop it rather than
    // leaving a dead handle behind; focus + `stat` still covers the app.
    watcher.on('error', () => stopWatchingDocument())
    watched = path
  } catch {
    watcher = null
    watched = null
  }
}

/** Stop watching, and forget anything that was still settling. */
export function stopWatchingDocument(): void {
  clearTimeout(settle)
  settle = undefined
  watcher?.close()
  watcher = null
  watched = null
}

/** The document currently being watched, or null. For tests and for tracing. */
export function watchedDocument(): string | null {
  return watched
}
