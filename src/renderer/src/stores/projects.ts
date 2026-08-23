/**
 * Projects store — the project list, the currently open project, and
 * debounced autosave with a dirty flag (drives the header save indicator).
 *
 * Storage is reached only through the `ProjectStore` port (PLAN.md D1), so
 * every action here is async. Mutating actions return null/false (and set
 * `lastError`) instead of rejecting, so views have a single error surface to
 * present.
 *
 * **This is where the two shells' storage differs, and the only place.** The
 * browser gets `browserStore` and with it a *list*; the desktop gets
 * `documentStore` and with it the one file main has open (D1, D8). `load` and
 * `save` are the same call either way — what differs is the surface *around*
 * them, and a job the running shell has no answer for returns null rather than
 * throwing "unsupported", because the view that would have called it is not
 * reachable there anyway (§4).
 *
 * Two things follow from the port being async and are load-bearing:
 *
 * - **Saves are serialized.** `saveCurrent` chains onto whatever save is still
 *   in flight rather than racing it, and `flushAutosave` awaits the chain — so
 *   the before-quit flush cannot report "done" while a write is outstanding.
 * - **`open`/`close` carry a token.** Awaiting a load means a second
 *   navigation can land mid-flight; the stale one drops its result instead of
 *   overwriting the newer project (or nulling it).
 */

import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Project } from '@/domain/types'
import { createProject, type CreateProjectOptions } from '@/domain/factory'
import {
  ProjectValidationError,
  deserializeProject,
  projectContentHash,
  serializeProject,
} from '@/domain/serialization'
import { encodeShare, shareUrl } from '@/domain/share'
import { StorageQuotaError, type ProjectSummary } from '@/persistence/repository'
import { createBrowserStore } from '@/persistence/browserStore'
import { createDocumentStore } from '@/persistence/documentStore'
import { DocumentError, type DocumentStore, type ProjectLibrary } from '@/persistence/store'
import { isDesktop } from '@/utils/desktop'

export type SaveState = 'saved' | 'saving' | 'unsaved'

export const AUTOSAVE_DELAY_MS = 500

export const useProjectsStore = defineStore('projects', () => {
  /**
   * The one storage call site (D1). Which adapter answers is decided here and
   * nowhere else — `load` and `save` go through the port either way, and the
   * two narrow references below are for the jobs only one shell has.
   */
  const adapter: ProjectLibrary | DocumentStore = isDesktop()
    ? createDocumentStore()
    : createBrowserStore()
  /** The list operations, in the browser build. Null on the desktop (D1). */
  const library: ProjectLibrary | null = adapter.kind === 'browser' ? adapter : null
  /** The document operations, on the desktop. Null in the browser (D1). */
  const documents: DocumentStore | null = adapter.kind === 'document' ? adapter : null

  const summaries = ref<ProjectSummary[]>([])
  /**
   * The open document's filename, without its extension — what the editor's
   * header shows now that no list view carries a name. Null in the browser,
   * where the header falls back to the project's own name.
   */
  const documentName = ref<string | null>(null)
  const current = ref<Project | null>(null)
  const saveState = ref<SaveState>('saved')
  /** Latest storage/validation failure, for the manager view's error banner. */
  const lastError = ref<string | null>(null)

  let autosaveTimer: ReturnType<typeof setTimeout> | undefined
  /** The tail of the save chain; every save queues behind it (see the header). */
  let saveChain: Promise<boolean> = Promise.resolve(true)
  /** Bumped by every open/close, so a load that lost the race can tell. */
  let openToken = 0
  /**
   * Content hash of the open project as it was last stored (D5). An autosave
   * tick that hashes the same writes nothing at all — against a git worktree
   * that is the difference between a file whose mtime churns while `git diff`
   * shows nothing, and one that moves only when the project does.
   */
  let storedHash: string | null = null

  async function refresh(): Promise<void> {
    // The desktop has no list to refresh: the OS is the project list (§4).
    if (!library) return
    summaries.value = await library.list()
  }

  /** Persist a project; on failure record the error and report false. */
  async function persist(project: Project): Promise<boolean> {
    try {
      await adapter.save(project)
      lastError.value = null
      return true
    } catch (error) {
      lastError.value = failureMessage(error, 'Saving the project failed.')
      return false
    }
  }

  /**
   * A storage failure, worded for the banner. A quota error and a disk error
   * both already carry a sentence written for a person; anything else falls
   * back to the caller's.
   */
  function failureMessage(error: unknown, fallback: string): string {
    if (error instanceof StorageQuotaError || error instanceof DocumentError) return error.message
    if (error instanceof ProjectValidationError) return error.message
    return fallback
  }

  async function create(options: CreateProjectOptions): Promise<Project | null> {
    return admit(createProject(options))
  }

  /** Persist a fully-formed project (e.g. a bundled sample) and list it. */
  async function createFrom(project: Project): Promise<Project | null> {
    return admit(project)
  }

  /**
   * Bring a brand-new project into storage.
   *
   * The two shells differ here and only here: the browser writes another entry
   * into its index, while the desktop writes a *file* — in the location the New
   * dialog showed — and that file becomes the open document (D10). Both answer
   * with the project, so the views that follow this with a navigation do not
   * care which happened.
   */
  async function admit(project: Project): Promise<Project | null> {
    if (documents) {
      try {
        const created = await documents.createDocument(project)
        documentName.value = documents.name
        lastError.value = null
        return created
      } catch (error) {
        lastError.value = failureMessage(error, 'Creating the document failed.')
        return null
      }
    }
    if (!(await persist(project))) return null
    await refresh()
    return project
  }

  /**
   * Open a document through the desktop's Open dialog (D15's dialog path).
   * Null when the user cancelled, or when the file could not be read — the
   * banner says which.
   */
  async function openDocument(): Promise<Project | null> {
    if (!documents) return null
    try {
      const project = await documents.openDocument()
      documentName.value = documents.name
      lastError.value = null
      return project
    } catch (error) {
      lastError.value = failureMessage(error, 'That document could not be opened.')
      return null
    }
  }

  /** Where a new document would go, for the New dialog's location row (D10). */
  async function defaultLocation(): Promise<string | null> {
    return documents ? await documents.defaultLocation() : null
  }

  /** Ask for another location; null when the user cancelled. */
  async function chooseLocation(): Promise<string | null> {
    return documents ? await documents.chooseLocation() : null
  }

  async function open(id: string): Promise<Project | null> {
    const token = ++openToken
    await flushAutosave()
    let project: Project | null
    try {
      project = await adapter.load(id)
      lastError.value = null
    } catch (error) {
      // Only the document adapter throws here — an unreadable or corrupt file.
      // The view shows its missing state; the banner says why (Phase F3).
      lastError.value = failureMessage(error, 'That document could not be opened.')
      project = null
    }
    // The name comes off the adapter rather than out of the project, because a
    // document is called what its *file* is called.
    if (documents) documentName.value = documents.name
    if (token !== openToken) return project // a newer open won; leave its result standing
    current.value = project
    storedHash = project ? projectContentHash(project) : null
    saveState.value = 'saved'
    return project
  }

  async function close(): Promise<void> {
    const token = ++openToken
    await flushAutosave()
    if (token !== openToken) return
    current.value = null
    storedHash = null
    saveState.value = 'saved'
    // One window, one document (D17): leaving the editor closes the file, so
    // the start screen is not sitting on top of a document main still holds.
    if (documents) {
      await documents.closeDocument()
      documentName.value = null
    }
  }

  async function rename(id: string, name: string): Promise<boolean> {
    // Renaming is renaming a *file* on the desktop, which is the file manager's
    // job now (§4). The view that offered it is not reachable there.
    if (!library) return false
    const isOpen = current.value?.id === id
    // The port renames what is *stored*, so anything still in the autosave
    // window has to land first or it would be renamed and then written back.
    if (isOpen) await flushAutosave()
    try {
      await library.rename(id, name)
    } catch {
      lastError.value = 'Renaming the project failed.'
      return false
    }
    if (current.value?.id === id) {
      current.value.name = name
      // The flush above landed everything else, so the stored copy and the open
      // one now agree and the next autosave tick has nothing to write (D5).
      storedHash = projectContentHash(current.value)
    }
    await refresh()
    return true
  }

  /** Copy a project under a fresh id; resolves to the copy's id. */
  async function duplicate(id: string): Promise<string | null> {
    if (!library) return null
    if (current.value?.id === id) await flushAutosave()
    let copyId: string
    try {
      copyId = await library.duplicate(id)
    } catch (error) {
      lastError.value =
        error instanceof StorageQuotaError ? error.message : 'Duplicating the project failed.'
      return null
    }
    await refresh()
    return copyId
  }

  async function remove(id: string): Promise<void> {
    if (!library) return
    await library.remove(id)
    if (current.value?.id === id) {
      current.value = null
      storedHash = null
      saveState.value = 'saved'
    }
    await refresh()
  }

  /** Import an uploaded project JSON file. Assigns a fresh id on collision. */
  async function importProject(json: string): Promise<Project | null> {
    let project: Project
    try {
      project = deserializeProject(json)
    } catch (error) {
      lastError.value =
        error instanceof ProjectValidationError
          ? `Import failed: ${error.message}`
          : 'Import failed: unreadable file.'
      return null
    }
    return adopt(project)
  }

  /** Take ownership of an already-validated project (upload, share link). */
  async function adopt(project: Project): Promise<Project | null> {
    if (library && (await library.load(project.id))) {
      project.id = crypto.randomUUID()
    }
    return admit(project)
  }

  /** The open project if it is the one asked for, otherwise a fresh load. */
  async function projectById(id: string): Promise<Project | null> {
    return current.value?.id === id ? current.value : await adapter.load(id)
  }

  /** Shareable URL carrying the whole project. Null (with lastError) on failure. */
  async function shareLink(id: string): Promise<string | null> {
    const project = await projectById(id)
    if (!project) {
      lastError.value = 'That project could not be loaded.'
      return null
    }
    try {
      return shareUrl(await encodeShare(project))
    } catch {
      lastError.value = 'Creating a share link failed.'
      return null
    }
  }

  /** Pretty-printed download payload for a project. */
  async function exportProject(id: string): Promise<{ filename: string; json: string } | null> {
    const project = await projectById(id)
    if (!project) return null
    const slug =
      project.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'project'
    return { filename: `${slug}.vic20.json`, json: serializeProject(project) }
  }

  /** Mark the open project dirty and schedule a debounced autosave. */
  function markDirty(): void {
    if (!current.value) return
    saveState.value = 'unsaved'
    clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => void saveCurrent(), AUTOSAVE_DELAY_MS)
  }

  /** Save the open project immediately (Ctrl/Cmd+S, close, tab hide). */
  function saveCurrent(): Promise<boolean> {
    clearTimeout(autosaveTimer)
    autosaveTimer = undefined
    // Queue behind any save still in flight rather than interleaving writes.
    saveChain = saveChain.then(writeCurrent, writeCurrent)
    return saveChain
  }

  async function writeCurrent(): Promise<boolean> {
    const project = current.value
    if (!project) return true
    // D5: nothing to write, so nothing is written — and `modifiedAt` is not
    // stamped, because it moves only when content moves.
    const hash = projectContentHash(project)
    if (hash === storedHash) {
      if (current.value === project) saveState.value = 'saved'
      return true
    }
    saveState.value = 'saving'
    project.modifiedAt = new Date().toISOString()
    const ok = await persist(project)
    if (ok) storedHash = hash
    // A save that finished after the project was closed or replaced must not
    // relabel the indicator for whatever is on screen now.
    if (current.value === project) saveState.value = ok ? 'saved' : 'unsaved'
    if (ok) await refresh()
    return ok
  }

  /**
   * Settle every outstanding write. Called before the window closes, so it
   * has to cover both a debounced edit that has not fired yet and a save that
   * fired and has not resolved.
   */
  async function flushAutosave(): Promise<void> {
    if (saveState.value !== 'saved' || autosaveTimer !== undefined) {
      await saveCurrent()
      return
    }
    await saveChain
  }

  function dismissError(): void {
    lastError.value = null
  }

  return {
    summaries,
    current,
    documentName,
    saveState,
    lastError,
    refresh,
    create,
    createFrom,
    admit,
    open,
    openDocument,
    defaultLocation,
    chooseLocation,
    close,
    rename,
    duplicate,
    remove,
    importProject,
    adopt,
    shareLink,
    exportProject,
    markDirty,
    saveCurrent,
    flushAutosave,
    dismissError,
  }
})
