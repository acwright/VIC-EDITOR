/**
 * The one-time move out of browser storage, from the renderer's side
 * (PLAN.md D19).
 *
 * A `v1.6` desktop user's projects are in this origin's `localStorage` and
 * nowhere else. Main cannot read that, and this side cannot write a file — so
 * the job splits: **here we read, validate and serialize; main writes, seeds
 * recents and remembers that it happened** (`src/main/migration.ts`).
 *
 * It lives beside the two adapters rather than inside either, because it is the
 * one operation that touches *both* stores at once — the browser repository on
 * a desktop shell — which is precisely what `stores/projects.ts`'s single
 * adapter cannot express. The Pinia store keeps its one storage call site (D1)
 * and this stays out of it.
 *
 * Three rules, and they are the phase:
 *
 * - **It copies.** `removeBrowserCopies` exists, is never called on the app's
 *   own initiative, and is offered only after a run that wrote something.
 * - **A project that cannot be read is named, not dropped.** A corrupt entry
 *   comes back in `unreadable` and is shown by name in the sheet.
 * - **It is offered only when there is something to copy.** The marker is
 *   main's half of the answer; this side supplies the other half.
 */

import { serializeProject } from '@/domain/serialization'
import { desktop } from '@/utils/desktop'
import { createRepository, type ProjectRepository } from './repository'
import type { AppApi } from '@shared/api'
import type { MigrationDocument, MigrationResult } from '@shared/document'

/** The bridge's migration surface. */
type MigrationApi = AppApi['migration']

/** What is in browser storage, ready to hand over. */
export interface MigrationPlan {
  /** The projects that can be copied, newest first — the order the sheet lists. */
  documents: MigrationDocument[]
  /**
   * The names of index entries whose project could not be read or serialized.
   *
   * Named rather than counted: "one of your projects was skipped" is not
   * something a person can act on, and the entry is still in browser storage
   * for them to go and look at.
   */
  unreadable: string[]
}

/** What a run did, plus what was skipped before it started. */
export interface MigrationOutcome extends MigrationResult {
  unreadable: string[]
}

export interface Migrator {
  /**
   * The projects waiting to be copied, or `null` when there is nothing to do —
   * the migration already happened, or this profile has no projects in browser
   * storage.
   */
  pending(): Promise<MigrationPlan | null>
  /** Where the copies would go, as the sheet shows it. */
  folder(): Promise<string>
  /** Ask for another folder; `null` when the user cancelled. */
  choose(): Promise<string | null>
  /** Copy them (D19). */
  run(plan: MigrationPlan): Promise<MigrationOutcome>
  /**
   * Remove the browser copies of the projects that were written.
   *
   * Only the ones in `written`: a project that failed to copy is still only in
   * browser storage, and removing it would be the one thing this phase must
   * never do.
   */
  removeBrowserCopies(outcome: MigrationOutcome): Promise<void>
}

export function createMigrator(
  api: MigrationApi,
  repository: ProjectRepository = createRepository(),
): Migrator {
  /**
   * Read every project out of the index.
   *
   * `list()` is newest first, which is the order both the sheet and Recent
   * Documents want. A project that fails to load — a truncated entry, a schema
   * the validator rejects — is recorded by name and skipped; so is one that
   * cannot be serialized, which would be a project that validates but holds
   * something the formatter cannot write.
   */
  function collect(): MigrationPlan {
    const documents: MigrationDocument[] = []
    const unreadable: string[] = []
    for (const summary of repository.list()) {
      let project
      try {
        project = repository.load(summary.id)
      } catch {
        project = null
      }
      if (!project) {
        unreadable.push(summary.name)
        continue
      }
      try {
        documents.push({ id: project.id, name: project.name, text: serializeProject(project) })
      } catch {
        unreadable.push(summary.name)
      }
    }
    return { documents, unreadable }
  }

  return {
    async pending(): Promise<MigrationPlan | null> {
      if (!(await api.pending())) return null
      const plan = collect()
      // Nothing to copy is not a migration, so no sheet and no marker. A
      // profile holding *only* corrupt entries is the same answer: there is
      // nothing this could write, and an offer that can only fail is worse than
      // silence — the entries stay in browser storage either way.
      return plan.documents.length > 0 ? plan : null
    },

    folder(): Promise<string> {
      return api.folder()
    },

    choose(): Promise<string | null> {
      return api.choose()
    },

    async run(plan: MigrationPlan): Promise<MigrationOutcome> {
      // Plain objects, rebuilt here rather than passed through: the plan is
      // held in a `ref` by the view that shows it, so what arrives is a
      // reactive Proxy — and `ipcRenderer.invoke` structured-clones its
      // arguments, which fails on one with "An object could not be cloned".
      // Measured in the running app; nothing below the bridge can see it,
      // because a fake never clones.
      const documents = plan.documents.map(({ id, name, text }) => ({ id, name, text }))
      const result = await api.run(documents)
      return { ...result, unreadable: plan.unreadable }
    },

    async removeBrowserCopies(outcome: MigrationOutcome): Promise<void> {
      for (const entry of outcome.written) repository.remove(entry.id)
    },
  }
}

/**
 * The migrator for this shell, or `null` in the browser — where projects live
 * in `localStorage` and are staying there (D20).
 *
 * The same shape `desktop()` gives everything else that only one shell has: one
 * check at the top of the caller instead of a branch spread through it.
 */
export function migrator(repository?: ProjectRepository): Migrator | null {
  const api = desktop()
  return api ? createMigrator(api.migration, repository) : null
}
