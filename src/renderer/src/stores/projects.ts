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
import {
  DocumentConflictError,
  DocumentError,
  type DocumentStore,
  type ProjectLibrary,
} from '@/persistence/store'
import { isDesktop } from '@/utils/desktop'
import { documentFileName, type DocumentChange, type RecentDocument } from '@shared/document'

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
  /**
   * Something happened that is worth saying and is not a failure — a document
   * reloaded from disk, so far (D7). Quiet by design: it is the app reporting
   * that it did the obvious thing, not asking for anything.
   */
  const lastNotice = ref<string | null>(null)
  /**
   * The external change waiting on an answer (D7), or null.
   *
   * Set when the file changed and taking it would cost something — an unsaved
   * edit, or a file that is no longer there to take. `App.vue` renders the
   * dialog; the three actions below are the ways out of it.
   */
  const documentConflict = ref<DocumentChange | null>(null)

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
  /**
   * A conflict the user waved away, so the same one is not asked twice.
   *
   * Without it, dismissing the dialog and carrying on editing would re-raise it
   * on every autosave tick — the guard refuses every write until the conflict
   * is actually resolved. The banner still says why saving has stopped; only
   * the dialog is suppressed, and only until the next thing that changes the
   * situation.
   */
  let dismissedConflict: DocumentChange | null = null

  async function refresh(): Promise<void> {
    // The desktop has no list to refresh: the OS is the project list (§4).
    if (!library) return
    summaries.value = await library.list()
  }

  /**
   * Persist a project; on failure record the error and report false.
   *
   * `force` is the desktop's answer to a conflict and nothing else (D7): it
   * goes through `overwrite`, which is the one call that writes over a file the
   * app did not last write.
   */
  async function persist(project: Project, force = false): Promise<boolean> {
    try {
      if (force && documents) await documents.overwrite(project)
      else await adapter.save(project)
      lastError.value = null
      dismissedConflict = null
      return true
    } catch (error) {
      // A refused write is a question, not a failure: the file moved and only
      // the user can say which version wins (D6, D7).
      if (error instanceof DocumentConflictError) {
        raiseConflict(error.change)
        return false
      }
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
      // Creating a document adopts it, so whatever the editor is holding has to
      // be in the *old* file before that happens — the same flush every other
      // arrival does, for the same reason (D17). New… is reachable from the
      // editor since F7, which is when this began to matter.
      await flushAutosave()
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
   * Ask for a document through the desktop's Open dialog.
   *
   * It answers with nothing on purpose: the dialog is one of six ways a
   * document arrives and not the special one, so what the user chose comes back
   * through `takePendingDocument` like a double-click does (D15).
   */
  async function openDocument(): Promise<void> {
    await documents?.requestOpen()
  }

  /** Ask for a recent document by the opaque id the start screen was given (D16). */
  async function openRecentDocument(id: string): Promise<void> {
    await documents?.openRecent(id)
  }

  /** Recent Documents, for the start screen. Empty in the browser (D16). */
  async function recentDocuments(): Promise<RecentDocument[]> {
    return documents ? await documents.recent() : []
  }

  /**
   * Take the document main is holding for us, if it is holding one.
   *
   * This is the single arrival point (D15): a double-click, a drop, Open
   * Recent, the Open dialog and the reopen-at-launch all end here, and so does
   * a launch with nothing waiting, which answers null.
   *
   * The flush is the load-bearing line. Main swaps the open document inside
   * `takePending`, so whatever the editor was holding has to be written to the
   * *old* file before that happens — this is what D17's "opening a document
   * flushes the current one first" actually is.
   */
  async function takePendingDocument(): Promise<Project | null> {
    if (!documents) return null
    const token = ++openToken
    await flushAutosave()
    let project: Project | null
    try {
      project = await documents.takePending()
      lastError.value = null
    } catch (error) {
      // The file is not a project, or the disk said no. Main's own sentence is
      // what the banner shows, and whatever was open stays open.
      lastError.value = failureMessage(error, 'That document could not be opened.')
      return null
    }
    documentName.value = documents.name
    if (!project || token !== openToken) return project
    forgetConflict()
    current.value = project
    storedHash = projectContentHash(project)
    saveState.value = 'saved'
    return project
  }

  // --- The file changing underneath us (D7) ---

  /** A different document is on screen; the last one's question is not its. */
  function forgetConflict(): void {
    documentConflict.value = null
    dismissedConflict = null
    lastNotice.value = null
  }

  /** The open document's name as it reads in a sentence. */
  function documentLabel(): string {
    return documentName.value ? `"${documentName.value}"` : 'The document'
  }

  /** Why saving has stopped, for the banner behind a dismissed conflict. */
  function pausedMessage(change: DocumentChange): string {
    return change === 'deleted'
      ? `Saving is paused: ${documentLabel()} is no longer on disk.`
      : `Saving is paused: ${documentLabel()} changed on disk.`
  }

  /**
   * Whether the editor is holding something the file does not have.
   *
   * Three ways it can be: a debounce that has not fired, an indicator that says
   * so, or — the one worth checking explicitly — a project whose content no
   * longer hashes to what was last written (D5). This decides whether an
   * external change can simply be taken.
   */
  function hasUnsavedEdits(): boolean {
    if (!current.value) return false
    if (autosaveTimer !== undefined || saveState.value !== 'saved') return true
    return storedHash !== null && projectContentHash(current.value) !== storedHash
  }

  /** Put the question, unless it is the one the user already waved away. */
  function raiseConflict(change: DocumentChange): void {
    if (documentConflict.value === change) return
    if (dismissedConflict === change) {
      lastError.value = pausedMessage(change)
      return
    }
    lastError.value = null
    // A question about the file replaces whatever quiet note was on screen —
    // "Reloaded from disk" above a conflict dialog describes a state that has
    // already been overtaken.
    lastNotice.value = null
    documentConflict.value = change
  }

  /**
   * The open document changed on disk (D7).
   *
   * The whole decision is here, and it is the safety property the round rests
   * on. **Clean and merely changed** → take the file, quietly: that is a `git
   * checkout` doing what the user asked for, and the editor following it. **Any
   * unsaved edit, or a file that is gone** → ask, because either answer costs
   * something and only the user can weigh them.
   *
   * Nothing is written here either way. Main is already refusing writes to the
   * changed file, so the edit in memory cannot leak onto it while the question
   * is open.
   */
  async function documentChangedOnDisk(change: DocumentChange): Promise<Project | null> {
    if (!documents || !current.value) return null
    // A fresh announcement: whatever was waved away was about the state before
    // this one, so the question is worth asking again.
    dismissedConflict = null
    if (change === 'modified' && !hasUnsavedEdits()) return await reloadDocument()
    raiseConflict(change)
    return null
  }

  /**
   * Take what is on disk, discarding whatever the editor was holding (D7).
   *
   * The `clearTimeout` is the load-bearing line: the edit being discarded may
   * have a debounced write scheduled, and letting that fire after the reload
   * would put the discarded version straight back onto the file.
   */
  async function reloadDocument(): Promise<Project | null> {
    if (!documents) return null
    const token = ++openToken
    clearTimeout(autosaveTimer)
    autosaveTimer = undefined
    documentConflict.value = null
    dismissedConflict = null
    let project: Project | null
    try {
      project = await documents.reloadDocument()
      lastError.value = null
    } catch (error) {
      lastError.value = failureMessage(error, 'That document could not be reopened.')
      return null
    }
    documentName.value = documents.name
    if (!project || token !== openToken) return project
    current.value = project
    storedHash = projectContentHash(project)
    saveState.value = 'saved'
    lastNotice.value = 'Reloaded from disk.'
    return project
  }

  /**
   * Keep what is in the editor, and write it over the file (D7).
   *
   * The other answer to the same question, and the one that costs the version
   * on disk — the dialog says so before this runs. For a document that was
   * deleted it is "put it back", which is also the only way an autosave tick is
   * ever allowed to recreate a file the user removed.
   */
  async function overwriteDocument(): Promise<boolean> {
    if (!documents || !current.value) return false
    documentConflict.value = null
    dismissedConflict = null
    return await saveCurrent(true)
  }

  /** Neither answer, for now. The banner keeps saying why saving has stopped. */
  function dismissConflict(): void {
    const change = documentConflict.value
    if (!change) return
    documentConflict.value = null
    dismissedConflict = change
    // Nothing was written and nothing will be until this is answered, so the
    // indicator must stop claiming otherwise.
    saveState.value = 'unsaved'
    lastError.value = pausedMessage(change)
  }

  function dismissNotice(): void {
    lastNotice.value = null
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
    forgetConflict()
    current.value = project
    storedHash = project ? projectContentHash(project) : null
    saveState.value = 'saved'
    return project
  }

  async function close(): Promise<void> {
    const token = ++openToken
    await flushAutosave()
    if (token !== openToken) return
    forgetConflict()
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

  /**
   * What *Download* writes, and what *Save a Copy…* writes (D3, D4, F7).
   *
   * One payload for both, and one name: the document name main would give the
   * same project — `Title Screen.vic20`, not a slug and not the compound v1
   * extension. Both shells therefore produce a file the other opens, which is
   * what D2 promises, and a copy saved out of the desktop editor is a document
   * a double-click opens rather than something that has to be imported first.
   *
   * A copy of the *open document* is suggested under the document's own name
   * rather than the project's. The two agree for anything this app created —
   * main derives one from the other — and differ only for a file someone
   * renamed in Finder, where the name on screen is the one the user knows it
   * by. This is a suggestion for a save dialog, not a path: main still decides
   * where anything lands (D8).
   */
  async function exportProject(id: string): Promise<{ filename: string; json: string } | null> {
    const project = await projectById(id)
    if (!project) return null
    const named = current.value?.id === id ? (documentName.value ?? project.name) : project.name
    return { filename: documentFileName(named), json: serializeProject(project) }
  }

  /** Mark the open project dirty and schedule a debounced autosave. */
  function markDirty(): void {
    if (!current.value) return
    saveState.value = 'unsaved'
    clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => void saveCurrent(), AUTOSAVE_DELAY_MS)
  }

  /**
   * Save the open project immediately (Ctrl/Cmd+S, close, tab hide).
   *
   * `force` is D7's "keep my version" and is never set by the app itself:
   * `overwriteDocument` is its only caller, and it writes over a file that
   * changed underneath us.
   */
  function saveCurrent(force = false): Promise<boolean> {
    clearTimeout(autosaveTimer)
    autosaveTimer = undefined
    const write = (): Promise<boolean> => writeCurrent(force)
    // Queue behind any save still in flight rather than interleaving writes.
    saveChain = saveChain.then(write, write)
    return saveChain
  }

  async function writeCurrent(force = false): Promise<boolean> {
    const project = current.value
    if (!project) return true
    // D5: nothing to write, so nothing is written — and `modifiedAt` is not
    // stamped, because it moves only when content moves. A forced write skips
    // this: the file on disk is *not* what the hash describes, which is the
    // whole reason it is being forced.
    const hash = projectContentHash(project)
    if (!force && hash === storedHash) {
      if (current.value === project) saveState.value = 'saved'
      return true
    }
    saveState.value = 'saving'
    project.modifiedAt = new Date().toISOString()
    const ok = await persist(project, force)
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
    lastNotice,
    documentConflict,
    refresh,
    create,
    createFrom,
    admit,
    open,
    openDocument,
    openRecentDocument,
    recentDocuments,
    takePendingDocument,
    documentChangedOnDisk,
    reloadDocument,
    overwriteDocument,
    dismissConflict,
    dismissNotice,
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
