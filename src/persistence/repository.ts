/**
 * localStorage-backed project repository:
 * an index key listing project summaries, plus one key per project.
 *
 * Projects are stored as compact JSON (localStorage quota is ~5 MB and
 * charsets are large); pretty-printing is reserved for file downloads.
 * Corrupt entries are tolerated and skipped rather than crashing the app.
 */

import type { CharHeight, Project, ProjectType } from '@/domain/types'
import { validateProject } from '@/domain/serialization'
import { CHAR_HEIGHTS, isProjectType } from '@/domain/modes'

export const INDEX_KEY = 'vic20-editor:projects'

export function projectKey(id: string): string {
  return `vic20-editor:project:${id}`
}

/**
 * What the manager list can show without loading (and validating) every
 * project: geometry and character height as well as the type, because on the
 * VIC those are project settings rather than properties of the mode (D3, D8).
 */
export interface ProjectSummary {
  id: string
  name: string
  type: ProjectType
  /** Screen geometry in cells; every screen in the project shares it (D8). */
  columns: number
  rows: number
  /** Pixel rows per character — 8 or 16 (D3). */
  charHeight: CharHeight
  modifiedAt: string
}

/** The index entry for a project, as written on every save. */
export function summarize(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    type: project.type,
    columns: project.settings.columns,
    rows: project.settings.rows,
    charHeight: project.settings.charHeight,
    modifiedAt: project.modifiedAt,
  }
}

/** Thrown when a write fails because browser storage is full. */
export class StorageQuotaError extends Error {
  constructor() {
    super(
      'Browser storage is full. Delete an unused project (download it first to keep a copy), then try again.',
    )
    this.name = 'StorageQuotaError'
  }
}

/** The subset of the DOM Storage interface the repository needs (injectable for tests). */
export interface KVStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface ProjectRepository {
  /** Project summaries, most recently modified first. */
  list(): ProjectSummary[]
  /** Load and validate a project; null if missing or corrupt. */
  load(id: string): Project | null
  /** Persist a project and update the index. Throws StorageQuotaError when full. */
  save(project: Project): void
  /** Remove a project and its index entry. */
  remove(id: string): void
}

/** An index entry written before the summary carried geometry and char height. */
type IndexEntry = Pick<ProjectSummary, 'id' | 'name' | 'type' | 'modifiedAt'> &
  Partial<ProjectSummary>

export function createRepository(storage: KVStorage = localStorage): ProjectRepository {
  function readIndex(): IndexEntry[] {
    const raw = storage.getItem(INDEX_KEY)
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isIndexEntry)
    } catch {
      return []
    }
  }

  function writeIndex(entries: IndexEntry[]): void {
    setOrThrowQuota(INDEX_KEY, JSON.stringify(entries))
  }

  function setOrThrowQuota(key: string, value: string): void {
    try {
      storage.setItem(key, value)
    } catch {
      // Browsers disagree on the error type/name here; any setItem failure
      // in practice means the quota was exceeded.
      throw new StorageQuotaError()
    }
  }

  function loadProject(id: string): Project | null {
    const raw = storage.getItem(projectKey(id))
    if (!raw) return null
    try {
      return validateProject(JSON.parse(raw))
    } catch {
      return null
    }
  }

  return {
    list() {
      const entries = readIndex()
      const summaries: ProjectSummary[] = []
      let repaired = false
      for (const entry of entries) {
        if (isSummary(entry)) {
          summaries.push(entry)
          continue
        }
        // An entry from before the summary carried geometry: rebuild it from
        // the project itself rather than dropping the project out of the list.
        repaired = true
        const project = loadProject(entry.id)
        if (project) summaries.push(summarize(project))
      }
      if (repaired) {
        try {
          writeIndex(summaries) // heal the index so this happens once
        } catch {
          // A full store just means the repair runs again next time.
        }
      }
      return summaries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    },

    load: loadProject,

    save(project) {
      setOrThrowQuota(projectKey(project.id), JSON.stringify(project))
      writeIndex([...readIndex().filter((entry) => entry.id !== project.id), summarize(project)])
    },

    remove(id) {
      storage.removeItem(projectKey(id))
      writeIndex(readIndex().filter((entry) => entry.id !== id))
    },
  }
}

/**
 * Index entries that fail this guard are dropped on read, so the type list must
 * never go stale — a hard-coded copy once silently hid every saved project of a
 * type it had not been updated for. `isProjectType` derives from `MODES`, so a
 * new type is picked up automatically.
 *
 * Geometry is checked separately by {@link isSummary}: a missing field there
 * means an entry written by an older build, which `list` rebuilds rather than
 * discards.
 */
function isIndexEntry(value: unknown): value is IndexEntry {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return (
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    isProjectType(s.type) &&
    typeof s.modifiedAt === 'string'
  )
}

function isSummary(entry: IndexEntry): entry is ProjectSummary {
  return (
    isPositiveInt(entry.columns) &&
    isPositiveInt(entry.rows) &&
    CHAR_HEIGHTS.includes(entry.charHeight as CharHeight)
  )
}

function isPositiveInt(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}
