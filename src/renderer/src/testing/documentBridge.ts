/**
 * A stand-in for the main process's document surface (PLAN.md D8, D15).
 *
 * Three specs need one — the adapter's, the store's and the start screen's —
 * and they were each carrying their own before Phase F4 gave main six more ways
 * to hand a document over. One fake instead, modelled on what main actually
 * does: a tiny map of path → text, one *open* document, one *pending* document
 * and a list of recents. That shape is the point. The renderer never sees a
 * path, so a fake that lets it would let a spec pass on code the app could not
 * run.
 *
 * What it is not: a fake of the file mechanics. Atomic writes, stamps and name
 * derivation are `src/main/documentFile.ts` and are covered against a real disk
 * in the node vitest project.
 */

import { DOCUMENT_EXTENSION } from '@shared/document'
import type { AppApi } from '@shared/api'
import type { DocumentChange, DocumentResult, OpenDocument, RecentDocument } from '@shared/document'

export interface FakeDocumentBridge {
  /** What `window.api.document` would be. */
  api: AppApi['document']
  /** The document main has open, or null. */
  readonly document: OpenDocument | null
  /** Every text handed to `write`, in order. */
  readonly writes: string[]
  /** Put a document on disk *and* open it — main already had this one. */
  seed(name: string, text: string): OpenDocument
  /** A document arrives: a double-click, a drop, Open Recent (D15). */
  arrive(name: string, text: string): void
  /** What the next Open dialog will pick. Without one, the dialog is cancelled. */
  stage(name: string, text: string): void
  /** Make everything that touches the disk fail, the way a full one would. */
  fail(reason: string): void
  /**
   * Something outside the app wrote the open document — a `git checkout`, or
   * another editor. The stamp main is holding no longer matches, so the guard
   * starts refusing, and the change is announced (PLAN.md D6, D7).
   */
  changeOnDisk(text: string): void
  /** Something outside the app deleted it. */
  deleteOnDisk(): void
}

function ok<T>(value: T): DocumentResult<T> {
  return { status: 'ok', value }
}

export function fakeDocumentBridge(
  initial: { name?: string; text?: string } | null = null,
): FakeDocumentBridge {
  /** The world's files, as main can see them and the renderer cannot. */
  const files = new Map<string, string>()
  const writes: string[] = []
  const listeners = new Set<() => void>()

  let location = '/documents'
  let openPath: string | null = null
  /**
   * A revision per file, and the one the app last saw.
   *
   * This is `{mtimeMs, size}` in main (D6) reduced to the only thing a spec
   * needs from it: whether the file is still the one the app read. Every write
   * the *app* makes moves both; a write from outside moves only the file's, so
   * the guard refuses exactly as main's does.
   */
  const revisions = new Map<string, number>()
  let heldRevision: number | null = null
  let pendingPath: string | null = null
  let stagedPath: string | null = null
  let failure: string | null = null

  const changeListeners = new Set<(change: DocumentChange) => void>()

  const pathOf = (name: string): string => `${location}/${name}.${DOCUMENT_EXTENSION}`
  const nameOf = (path: string): string =>
    path.slice(path.lastIndexOf('/') + 1, -(DOCUMENT_EXTENSION.length + 1))

  function read(path: string): OpenDocument {
    const text = files.get(path) ?? ''
    return { path, name: nameOf(path), text, stamp: { mtimeMs: Date.now(), size: text.length } }
  }

  function write(path: string, text: string): string {
    files.set(path, text)
    revisions.set(path, (revisions.get(path) ?? 0) + 1)
    return path
  }

  /** The app has just read or written the file: this is the new baseline. */
  function hold(path: string | null): void {
    heldRevision = path === null ? null : (revisions.get(path) ?? 0)
  }

  /** How the open file differs from what the app last saw, if it does. */
  function drift(): DocumentChange | null {
    if (!openPath || heldRevision === null) return null
    if (!files.has(openPath)) return 'deleted'
    return revisions.get(openPath) === heldRevision ? null : 'modified'
  }

  function announceChange(change: DocumentChange): void {
    for (const listener of changeListeners) listener(change)
  }

  function announce(path: string): void {
    pendingPath = path
    for (const listener of listeners) listener()
  }

  const bridge: FakeDocumentBridge = {
    get document() {
      return openPath === null ? null : read(openPath)
    },
    writes,
    seed(name, text) {
      openPath = write(pathOf(name), text)
      hold(openPath)
      return read(openPath)
    },
    arrive(name, text) {
      announce(write(pathOf(name), text))
    },
    stage(name, text) {
      stagedPath = write(pathOf(name), text)
    },
    fail(reason) {
      failure = reason
    },
    changeOnDisk(text) {
      if (!openPath) return
      write(openPath, text)
      announceChange('modified')
    },
    deleteOnDisk() {
      if (!openPath) return
      files.delete(openPath)
      announceChange('deleted')
    },
    api: {
      async create({ name, text }) {
        if (failure) return { status: 'error', reason: failure }
        openPath = write(pathOf(name), text)
        hold(openPath)
        return ok(read(openPath))
      },
      // The dialog does not answer with the document; what it picked arrives
      // like everything else does (D15).
      async open() {
        if (stagedPath) announce(stagedPath)
        stagedPath = null
      },
      onPending(callback) {
        listeners.add(callback)
        return () => listeners.delete(callback)
      },
      async takePending() {
        const path = pendingPath
        pendingPath = null
        if (!path) return { status: 'none' }
        if (failure) return { status: 'error', reason: failure }
        openPath = path
        hold(openPath)
        return ok(read(path))
      },
      dropped(file) {
        // The preload derives the path; here the name is all there is to go on.
        const path = `${location}/${file.name}`
        if (files.has(path)) announce(path)
      },
      // The id is deliberately not the path: the renderer is given a handle and
      // hands it back, and a spec that leaned on a filename here would be
      // leaning on something the app never sees (D8).
      async recent() {
        return [...files.keys()].map((path, index): RecentDocument => ({
          id: `recent-${index}`,
          name: nameOf(path),
          directory: location,
        }))
      },
      async openRecent(id) {
        const path = [...files.keys()][Number(id.replace('recent-', ''))]
        if (path) announce(path)
      },
      // Re-reading is also how a reload is performed (D7): what comes back is
      // whatever the file holds now, and it becomes the new baseline.
      async current() {
        if (failure) return { status: 'error', reason: failure }
        if (!openPath) return { status: 'none' }
        if (!files.has(openPath)) {
          return { status: 'error', reason: `"${nameOf(openPath)}" could not be found.` }
        }
        hold(openPath)
        return ok(read(openPath))
      },
      async write(text, force = false) {
        if (failure) return { status: 'error', reason: failure }
        if (!openPath) return { status: 'error', reason: 'No document is open.' }
        // The stamp guard (D6): a file that is not the one the app read is not
        // written over, and the refusal is the renderer's question to answer.
        const change = drift()
        if (change && !force) return { status: 'conflict', change }
        writes.push(text)
        write(openPath, text)
        hold(openPath)
        return ok(read(openPath).stamp)
      },
      onChanged(callback) {
        changeListeners.add(callback)
        return () => changeListeners.delete(callback)
      },
      async close() {
        openPath = null
        hold(null)
      },
      async reveal() {},
      async defaultLocation() {
        return location
      },
      async chooseLocation() {
        location = '/elsewhere'
        return location
      },
    },
  }

  if (initial) bridge.seed(initial.name ?? 'Alpha', initial.text ?? '')
  return bridge
}
