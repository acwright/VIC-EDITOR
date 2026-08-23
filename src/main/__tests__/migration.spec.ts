import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATION_FOLDER_NAME, type MigrationDocument } from '../../shared/document'

/**
 * The one-time move out of browser storage (PLAN.md D19), in the node vitest
 * project — against a real folder, because everything worth checking here is
 * about files that already exist.
 *
 * The three properties the phase rests on, and the ones a run of the app is
 * worst at showing: that a name already taken produces another file rather than
 * overwriting one, that the marker is set exactly when something was written,
 * and that a project which could not be written is *reported* rather than
 * quietly lost.
 */

let userData: string
let documents: string
let home: string

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) =>
      name === 'home' ? home : name === 'documents' ? documents : userData,
    addRecentDocument: vi.fn<() => void>(),
    clearRecentDocuments: vi.fn<() => void>(),
  },
  BrowserWindow: {},
  dialog: {},
  ipcMain: { handle: () => {}, on: () => {} },
  shell: {},
}))

const {
  migrateDocuments,
  migrationFolder,
  migrationPending,
  migrationRecord,
  resetMigrationState,
} = await import('../migration')
const { recentDocumentPaths } = await import('../recent')

let root: string

/** A project as the renderer hands it over: an id, a name and some text. */
function project(name: string, id = name.toLowerCase()): MigrationDocument {
  return { id, name, text: `{\n  "name": "${name}"\n}\n` }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vic20-migration-'))
  userData = join(root, 'userData')
  documents = join(root, 'documents')
  home = join(root, 'home')
  resetMigrationState()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('the migration folder', () => {
  it('is the app’s own folder inside ~/Documents (§9)', () => {
    expect(migrationFolder()).toBe(join(documents, MIGRATION_FOLDER_NAME))
  })

  it('is created if it is not there', () => {
    migrateDocuments([project('Star Voyager')])
    expect(existsSync(join(documents, MIGRATION_FOLDER_NAME, 'Star Voyager.vic20'))).toBe(true)
  })
})

describe('migrating', () => {
  it('writes one file per project, named as the project is', () => {
    const result = migrateDocuments([project('Star Voyager'), project('Tile Set')])

    expect(result.written.map((entry) => entry.file)).toEqual([
      'Star Voyager.vic20',
      'Tile Set.vic20',
    ])
    expect(result.failed).toEqual([])
    expect(readFileSync(join(migrationFolder(), 'Star Voyager.vic20'), 'utf-8')).toContain(
      'Star Voyager',
    )
  })

  // Browser storage identifies a project by id, so two of them can share a
  // name; a folder cannot. Neither may be lost.
  it('suffixes a name twice over rather than overwriting a project', () => {
    const result = migrateDocuments([
      project('Star Voyager', 'one'),
      project('Star Voyager', 'two'),
      project('Star Voyager', 'three'),
    ])

    expect(result.written.map((entry) => entry.file)).toEqual([
      'Star Voyager.vic20',
      'Star Voyager 2.vic20',
      'Star Voyager 3.vic20',
    ])
  })

  it('steps around a file that is already in the folder', () => {
    mkdirSync(migrationFolder(), { recursive: true })
    migrateDocuments([project('Star Voyager', 'first')])
    resetMigrationState()

    const result = migrateDocuments([project('Star Voyager', 'second')])
    expect(result.written[0]!.file).toBe('Star Voyager 2.vic20')
    // And the first file is untouched.
    expect(readFileSync(join(migrationFolder(), 'Star Voyager.vic20'), 'utf-8')).toContain(
      'Star Voyager',
    )
  })

  it('seeds recents so the newest project is at the top (D16, D19)', () => {
    // The renderer hands them over newest first, as the manager listed them.
    migrateDocuments([project('Newest'), project('Middle'), project('Oldest')])

    expect(recentDocumentPaths()).toEqual([
      join(migrationFolder(), 'Newest.vic20'),
      join(migrationFolder(), 'Middle.vic20'),
      join(migrationFolder(), 'Oldest.vic20'),
    ])
  })
})

describe('the marker', () => {
  it('is not set before a migration, and is set by one that wrote something', () => {
    expect(migrationPending()).toBe(true)
    const result = migrateDocuments([project('Star Voyager')])

    expect(result.done).toBe(true)
    expect(migrationPending()).toBe(false)
    expect(migrationRecord()).toMatchObject({ folder: migrationFolder(), count: 1 })
  })

  it('stays unset when the folder cannot be made, so the offer comes back', () => {
    // A *file* where `~/Documents` should be: the folder cannot be created, and
    // neither could any of the writes underneath it.
    mkdirSync(root, { recursive: true })
    writeFileSync(documents, 'not a folder', 'utf-8')

    const result = migrateDocuments([project('Star Voyager'), project('Tile Set')])

    expect(result.done).toBe(false)
    expect(result.written).toEqual([])
    expect(result.failed.map((entry) => entry.name)).toEqual(['Star Voyager', 'Tile Set'])
    expect(result.failed[0]!.reason).toBeTruthy()
    expect(migrationPending()).toBe(true)
  })

  it('names the project that could not be written and keeps the rest', () => {
    // A directory sitting where the atomic write's temporary file goes: the
    // write fails, the name it was going to take is still free, and the project
    // has to be reported rather than dropped.
    mkdirSync(join(migrationFolder(), 'Tile Set.vic20.tmp'), { recursive: true })

    const result = migrateDocuments([project('Star Voyager'), project('Tile Set')])

    expect(result.written.map((entry) => entry.file)).toEqual(['Star Voyager.vic20'])
    expect(result.failed.map((entry) => entry.name)).toEqual(['Tile Set'])
    // Something was written, so the migration happened — the sheet names what
    // did not, and those projects are still in browser storage.
    expect(result.done).toBe(true)
  })
})

describe('what the renderer is told', () => {
  it('is a folder as it reads on screen, and no path per file (D8)', () => {
    documents = join(home, 'Documents')
    const result = migrateDocuments([project('Star Voyager')])

    expect(result.folder).toBe(join('~', 'Documents', MIGRATION_FOLDER_NAME))
    expect(result.written[0]).toEqual({ id: 'star voyager', file: 'Star Voyager.vic20' })
  })
})
