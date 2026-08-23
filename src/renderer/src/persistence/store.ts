/**
 * The storage port (PLAN.md D1).
 *
 * Every method is async because a disk-backed implementation cannot be
 * anything else; making the browser adapter async too is what keeps one call
 * site in `stores/projects.ts` rather than a branch per shell.
 *
 * The port splits in two. `ProjectStore` is what an *editor* needs — load one
 * project, save it back — and is all the desktop's document adapter will
 * implement. `ProjectLibrary` adds what a *list* of projects needs and exists
 * in the browser build alone, so nothing has to throw "unsupported" and the
 * type system says which surface exists where.
 */

import type { Project } from '@/domain/types'
import type { ProjectSummary } from './repository'

export interface ProjectStore {
  readonly kind: 'browser' | 'document'
  /** Load and validate a project; null if it is missing or unreadable. */
  load(id: string): Promise<Project | null>
  /** Persist a project. Rejects when the write fails (e.g. StorageQuotaError). */
  save(project: Project): Promise<void>
}

/** The extra surface a *list* of projects needs. Browser build only. */
export interface ProjectLibrary extends ProjectStore {
  readonly kind: 'browser'
  /** Project summaries, most recently modified first. */
  list(): Promise<ProjectSummary[]>
  rename(id: string, name: string): Promise<void>
  /** Copy a project under a fresh id; resolves to the copy's id. */
  duplicate(id: string): Promise<string>
  remove(id: string): Promise<void>
}

/**
 * The extra surface a *document* needs. Desktop build only.
 *
 * The mirror of `ProjectLibrary`: where the browser's extra jobs are about a
 * *list*, these are about the one file the app has open. Creating and opening
 * are here rather than on the port because they are the operations that reach
 * a dialog, and the browser has no answer for them.
 *
 * Nothing here takes or returns a path. `name` is what the header shows and
 * `defaultLocation` is what the New dialog displays; the file itself stays in
 * the main process (D8).
 */
export interface DocumentStore extends ProjectStore {
  readonly kind: 'document'
  /**
   * The open document's display name, or `null` when none is open. A plain
   * getter, refreshed by every call below — the Pinia store copies it into a
   * ref after each `await`, which is what makes it reactive on screen.
   */
  readonly name: string | null
  /** Write `project` into the current location as a new document (D10). */
  createDocument(project: Project): Promise<Project | null>
  /** Run an Open dialog and adopt what was chosen; `null` if cancelled. */
  openDocument(): Promise<Project | null>
  /** Forget the open document. Writes nothing. */
  closeDocument(): Promise<void>
  /** Where a new document would go, for the New dialog's location row (D10). */
  defaultLocation(): Promise<string>
  /** Ask for another location; `null` if the user cancelled. */
  chooseLocation(): Promise<string | null>
}

/**
 * A document operation failed, with the reason main gave. Distinct from
 * `MissingProjectError`: this is "the disk said no", which the Pinia store
 * turns into `lastError` for the view to show.
 */
export class DocumentError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'DocumentError'
  }
}

/**
 * A project the store was asked to act on is not there. Callers that read a
 * project (`load`) get `null` instead; this is for the operations that cannot
 * carry on without one, so the Pinia store has something to catch and turn
 * into `lastError`.
 */
export class MissingProjectError extends Error {
  constructor(id: string) {
    super(`No project with id ${id}.`)
    this.name = 'MissingProjectError'
  }
}
