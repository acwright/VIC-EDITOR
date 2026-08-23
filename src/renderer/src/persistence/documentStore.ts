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
import { DocumentError, type DocumentStore } from './store'
import type { AppApi } from '@shared/api'
import type { DocumentResult } from '@shared/document'

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
      unwrap(await api.write(serializeProject(project)))
    },

    async createDocument(project: Project): Promise<Project | null> {
      return take(unwrap(await api.create({ name: project.name, text: serializeProject(project) })))
    },

    async openDocument(): Promise<Project | null> {
      return take(unwrap(await api.open()))
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
