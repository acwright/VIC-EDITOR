/**
 * The browser build's adapter: today's localStorage repository behind the
 * async port (PLAN.md D1).
 *
 * `repository.ts` keeps the storage mechanics — the index key, the per-project
 * key, quota handling — and this file is the thin async skin over it, plus the
 * two operations that used to live in the Pinia store. `rename` and
 * `duplicate` belong down here: they are load-mutate-save sequences, and the
 * store above should not know that a project is stored as JSON under a key.
 *
 * The methods are `async` although nothing in them awaits: a synchronous throw
 * from the repository (a full quota) then reaches the caller as a rejection,
 * which is what the port promises and what the document adapter will do.
 */

import type { Project } from '@/domain/types'
import { createRepository, type ProjectRepository, type ProjectSummary } from './repository'
import { MissingProjectError, type ProjectLibrary } from './store'

export function createBrowserStore(
  repository: ProjectRepository = createRepository(),
): ProjectLibrary {
  return {
    kind: 'browser',

    async load(id: string): Promise<Project | null> {
      return repository.load(id)
    },

    async save(project: Project): Promise<void> {
      repository.save(project)
    },

    async list(): Promise<ProjectSummary[]> {
      return repository.list()
    },

    async rename(id: string, name: string): Promise<void> {
      const project = repository.load(id)
      if (!project) throw new MissingProjectError(id)
      project.name = name
      project.modifiedAt = new Date().toISOString()
      repository.save(project)
    },

    async duplicate(id: string): Promise<string> {
      const source = repository.load(id)
      if (!source) throw new MissingProjectError(id)
      const now = new Date().toISOString()
      const copy: Project = {
        ...structuredClone(source),
        id: crypto.randomUUID(),
        name: `${source.name} copy`,
        createdAt: now,
        modifiedAt: now,
      }
      repository.save(copy)
      return copy.id
    },

    async remove(id: string): Promise<void> {
      repository.remove(id)
    },
  }
}
