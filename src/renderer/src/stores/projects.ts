/**
 * Projects store — the project list, the currently open project, and
 * debounced autosave with a dirty flag (drives the header save indicator).
 *
 * Storage is reached only through the `ProjectLibrary` port (PLAN.md D1), so
 * every action here is async. Mutating actions return null/false (and set
 * `lastError`) instead of rejecting, so views have a single error surface to
 * present.
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
  serializeProject,
} from '@/domain/serialization'
import { encodeShare, shareUrl } from '@/domain/share'
import { StorageQuotaError, type ProjectSummary } from '@/persistence/repository'
import { createBrowserStore } from '@/persistence/browserStore'

export type SaveState = 'saved' | 'saving' | 'unsaved'

export const AUTOSAVE_DELAY_MS = 500

export const useProjectsStore = defineStore('projects', () => {
  const library = createBrowserStore()

  const summaries = ref<ProjectSummary[]>([])
  const current = ref<Project | null>(null)
  const saveState = ref<SaveState>('saved')
  /** Latest storage/validation failure, for the manager view's error banner. */
  const lastError = ref<string | null>(null)

  let autosaveTimer: ReturnType<typeof setTimeout> | undefined
  /** The tail of the save chain; every save queues behind it (see the header). */
  let saveChain: Promise<boolean> = Promise.resolve(true)
  /** Bumped by every open/close, so a load that lost the race can tell. */
  let openToken = 0

  async function refresh(): Promise<void> {
    summaries.value = await library.list()
  }

  /** Persist a project; on failure record the error and report false. */
  async function persist(project: Project): Promise<boolean> {
    try {
      await library.save(project)
      lastError.value = null
      return true
    } catch (error) {
      lastError.value =
        error instanceof StorageQuotaError ? error.message : 'Saving the project failed.'
      return false
    }
  }

  async function create(options: CreateProjectOptions): Promise<Project | null> {
    const project = createProject(options)
    if (!(await persist(project))) return null
    await refresh()
    return project
  }

  /** Persist a fully-formed project (e.g. a bundled sample) and list it. */
  async function createFrom(project: Project): Promise<Project | null> {
    if (!(await persist(project))) return null
    await refresh()
    return project
  }

  async function open(id: string): Promise<Project | null> {
    const token = ++openToken
    await flushAutosave()
    const project = await library.load(id)
    if (token !== openToken) return project // a newer open won; leave its result standing
    current.value = project
    saveState.value = 'saved'
    return project
  }

  async function close(): Promise<void> {
    const token = ++openToken
    await flushAutosave()
    if (token !== openToken) return
    current.value = null
    saveState.value = 'saved'
  }

  async function rename(id: string, name: string): Promise<boolean> {
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
    if (current.value?.id === id) current.value.name = name
    await refresh()
    return true
  }

  /** Copy a project under a fresh id; resolves to the copy's id. */
  async function duplicate(id: string): Promise<string | null> {
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
    await library.remove(id)
    if (current.value?.id === id) {
      current.value = null
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
    if (await library.load(project.id)) {
      project.id = crypto.randomUUID()
    }
    if (!(await persist(project))) return null
    await refresh()
    return project
  }

  /** The open project if it is the one asked for, otherwise a fresh load. */
  async function projectById(id: string): Promise<Project | null> {
    return current.value?.id === id ? current.value : await library.load(id)
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
    saveState.value = 'saving'
    project.modifiedAt = new Date().toISOString()
    const ok = await persist(project)
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
    saveState,
    lastError,
    refresh,
    create,
    createFrom,
    open,
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
