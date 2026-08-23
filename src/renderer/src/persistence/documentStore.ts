/**
 * The desktop build's adapter: the storage port over `window.api.document`
 * (PLAN.md D1, D8).
 *
 * Where `browserStore.ts` is a skin over a key-value store, this is a skin over
 * *the one file the app has open*. The consequences are worth stating, because
 * they are what the rest of the renderer is allowed to assume:
 *
 * - **`load(id)` reads the open document and checks its id.** There is no
 *   lookup by id to do — main has one document open, and the route's id is the
 *   project's own (D9). A mismatch means the route is stale, so it answers
 *   `null` exactly as a missing project does in the browser.
 * - **`save(project)` names no file.** It hands main the serialized text and
 *   main writes whatever it has open, atomically (D6).
 * - **A save can be *refused*.** Main holds the stamp the file had when the app
 *   last touched it, and will not write over a file that no longer matches —
 *   the `git checkout` case this whole round rests on (D6). That comes back as
 *   `DocumentConflictError`, and `reloadDocument` and `overwrite` are the two
 *   answers to it (D7).
 * - **Opening is a request, not a call that returns a document.** Every way a
 *   document can arrive — a double-click, a drop, Open Recent, the dialog, the
 *   last document at launch — ends in `takePending` (D15), so there is one
 *   place that parses a file and one place that names what is open.
 * - **Failures reject.** Cancelling a dialog is not a failure and resolves to
 *   `null`; a disk that said no throws `DocumentError` carrying main's own
 *   sentence, which the Pinia store turns into `lastError`.
 *
 * Serialization is `serializeProject` — the same one the web build's downloads
 * go through (D4). There is one format, and this is one of its two writers.
 */

import type { Project } from '@/domain/types'
import { deserializeProject, serializeProject } from '@/domain/serialization'
import { desktop } from '@/utils/desktop'
import { DocumentConflictError, DocumentError, type DocumentStore } from './store'
import type { AppApi } from '@shared/api'
import type { DocumentResult, RecentDocument } from '@shared/document'

/** The bridge's document surface. */
type DocumentApi = AppApi['document']

/**
 * The bridge, or a thrower.
 *
 * The adapter is only ever constructed in the desktop shell, so this cannot
 * fire in the app. It exists so that a mistake — wiring the document store into
 * the browser build — fails loudly at the first call rather than reading
 * `undefined.current` somewhere further down.
 */
function bridge(): DocumentApi {
  const api = desktop()
  if (!api) throw new DocumentError('The desktop bridge is not available.')
  return api.document
}

/** Unwrap a result: the value, `null` for the benign empty case, or a throw. */
function unwrap<T>(result: DocumentResult<T>): T | null {
  if (result.status === 'ok') return result.value
  if (result.status === 'none') return null
  throw new DocumentError(result.reason)
}

export function createDocumentStore(api: DocumentApi = bridge()): DocumentStore {
  /** The open document's name, refreshed by every call that reads or writes one. */
  let name: string | null = null

  /**
   * Write the project through, guarded or not (D6, D7).
   *
   * A refusal comes back as `conflict` rather than as an error, and is thrown
   * as one: the Pinia store tells the two apart, because one of them is a
   * question for the user and the other is a banner.
   */
  async function put(project: Project, force: boolean): Promise<void> {
    const result = await api.write(serializeProject(project), force)
    if (result.status === 'conflict') throw new DocumentConflictError(result.change)
    unwrap(result)
  }

  /** Adopt what main answered with, remembering its name for the header. */
  function take(document: { name: string; text: string } | null): Project | null {
    name = document?.name ?? null
    if (!document) return null
    // A document that is not a project throws `ProjectValidationError`, which
    // says which field was wrong — that is the "reports why rather than opening
    // blank" the phase asks for, and it is already written.
    return deserializeProject(document.text)
  }

  return {
    kind: 'document',

    get name(): string | null {
      return name
    },

    async load(id: string): Promise<Project | null> {
      const project = take(unwrap(await api.current()))
      // The route outlived the document it named — a stale deep link, or a
      // reload after the document was closed.
      return project?.id === id ? project : null
    },

    async save(project: Project): Promise<void> {
      await put(project, false)
    },

    async overwrite(project: Project): Promise<void> {
      await put(project, true)
    },

    async reloadDocument(): Promise<Project | null> {
      return take(unwrap(await api.current()))
    },

    async createDocument(project: Project): Promise<Project | null> {
      return take(unwrap(await api.create({ name: project.name, text: serializeProject(project) })))
    },

    async requestOpen(): Promise<void> {
      await api.open()
    },

    async openRecent(id: string): Promise<void> {
      await api.openRecent(id)
    },

    recent(): Promise<RecentDocument[]> {
      return api.recent()
    },

    async takePending(): Promise<Project | null> {
      return take(unwrap(await api.takePending()))
    },

    async closeDocument(): Promise<void> {
      name = null
      await api.close()
    },

    defaultLocation(): Promise<string> {
      return api.defaultLocation()
    },

    chooseLocation(): Promise<string | null> {
      return api.chooseLocation()
    },
  }
}
