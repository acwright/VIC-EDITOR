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
import type { DocumentResult, OpenDocument, RecentDocument } from '@shared/document'

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
  let pendingPath: string | null = null
  let stagedPath: string | null = null
  let failure: string | null = null

  const pathOf = (name: string): string => `${location}/${name}.${DOCUMENT_EXTENSION}`
  const nameOf = (path: string): string =>
    path.slice(path.lastIndexOf('/') + 1, -(DOCUMENT_EXTENSION.length + 1))

  function read(path: string): OpenDocument {
    const text = files.get(path) ?? ''
    return { path, name: nameOf(path), text, stamp: { mtimeMs: Date.now(), size: text.length } }
  }

  function write(path: string, text: string): string {
    files.set(path, text)
    return path
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
    api: {
      async create({ name, text }) {
        if (failure) return { status: 'error', reason: failure }
        openPath = write(pathOf(name), text)
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
      async current() {
        if (failure) return { status: 'error', reason: failure }
        return openPath ? ok(read(openPath)) : { status: 'none' }
      },
      async write(text) {
        if (failure) return { status: 'error', reason: failure }
        if (!openPath) return { status: 'error', reason: 'No document is open.' }
        writes.push(text)
        files.set(openPath, text)
        return ok(read(openPath).stamp)
      },
      async close() {
        openPath = null
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
