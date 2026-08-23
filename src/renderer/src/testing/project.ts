/**
 * Test-only: put a project in front of the editor, the way `projects.open`
 * would.
 *
 * Opening goes through the async storage port since PLAN.md Phase F1. The
 * editor-store and editor-component specs are about neither storage nor
 * navigation — they just need a project open — so rather than turn every one
 * of their `it` blocks async to await a load that is a formality, they set the
 * state up directly here.
 *
 * The state this leaves behind has to match what `open()` leaves behind, or
 * the specs stop describing the running app: the project is persisted, it is
 * `current`, the list has it, and the save indicator is clean. The port's own
 * behavior is covered where it belongs, in `persistence/__tests__` and
 * `stores/__tests__/projects.spec.ts`.
 *
 * Not imported by anything the app ships.
 */

import { createProject, type CreateProjectOptions } from '@/domain/factory'
import type { Project } from '@/domain/types'
import { createRepository } from '@/persistence/repository'
import { useProjectsStore } from '@/stores/projects'

export function openTestProject(options: CreateProjectOptions): Project {
  const project = createProject(options)
  const repository = createRepository()
  repository.save(project)

  const projects = useProjectsStore()
  projects.current = project
  projects.saveState = 'saved'
  projects.summaries = repository.list()
  return project
}
