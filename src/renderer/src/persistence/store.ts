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
