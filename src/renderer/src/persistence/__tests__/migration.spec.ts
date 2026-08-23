import { beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '@/domain/factory'
import { deserializeProject } from '@/domain/serialization'
import { createMigrator } from '../migration'
import { createRepository, projectKey, type ProjectRepository } from '../repository'
import { fakeMigrationBridge, type FakeMigrationBridge } from '@/testing/migrationBridge'

/**
 * The renderer's half of the one-time migration (PLAN.md D19).
 *
 * The seeded storage the phase asks for is a real `localStorage` holding what a
 * `v1.6` profile would: several projects and one entry that cannot be read.
 * What is checked here is everything main cannot see — that the corrupt entry
 * is *named* rather than dropped, that what crosses the bridge is the git-first
 * document (D4), and above all that nothing is removed from browser storage
 * unless it is asked for, and then only what was actually written.
 */

let main: FakeMigrationBridge
let repository: ProjectRepository

/** A project in browser storage, as `v1.6` left it. */
function seed(name: string, modifiedAt: string): string {
  const project = { ...createProject({ name, type: 'hires' }), modifiedAt }
  repository.save(project)
  return project.id
}

/** An entry the index lists and the storage cannot produce a project for. */
function seedCorrupt(name: string): string {
  const id = seed(name, '2026-01-01T00:00:00.000Z')
  localStorage.setItem(projectKey(id), '{ this is not json')
  return id
}

beforeEach(() => {
  localStorage.clear()
  main = fakeMigrationBridge()
  repository = createRepository()
})

describe('what is waiting', () => {
  it('is every project in browser storage, newest first', async () => {
    seed('Oldest', '2026-01-01T00:00:00.000Z')
    seed('Newest', '2026-06-01T00:00:00.000Z')

    const plan = await createMigrator(main.api, repository).pending()
    expect(plan!.documents.map((document) => document.name)).toEqual(['Newest', 'Oldest'])
    expect(plan!.unreadable).toEqual([])
  })

  it('names an entry it cannot read rather than dropping it (D19)', async () => {
    seed('Star Voyager', '2026-06-01T00:00:00.000Z')
    seedCorrupt('Broken')

    const plan = await createMigrator(main.api, repository).pending()
    expect(plan!.documents.map((document) => document.name)).toEqual(['Star Voyager'])
    expect(plan!.unreadable).toEqual(['Broken'])
  })

  it('is nothing at all once the migration has happened', async () => {
    seed('Star Voyager', '2026-06-01T00:00:00.000Z')
    main.markDone()

    expect(await createMigrator(main.api, repository).pending()).toBeNull()
  })

  it('is nothing at all when browser storage is empty', async () => {
    expect(await createMigrator(main.api, repository).pending()).toBeNull()
  })

  // An offer that can only fail is worse than silence: there is nothing to
  // write, so nothing would be, and the entries stay where they are either way.
  it('is nothing at all when every entry is unreadable', async () => {
    seedCorrupt('Broken')
    expect(await createMigrator(main.api, repository).pending()).toBeNull()
  })
})

describe('copying', () => {
  it('hands main the git-first document, and keeps the originals (D2, D4)', async () => {
    const id = seed('Star Voyager', '2026-06-01T00:00:00.000Z')
    const migrator = createMigrator(main.api, repository)

    const outcome = await migrator.run((await migrator.pending())!)

    expect(outcome.written).toEqual([{ id, file: 'Star Voyager.vic20' }])
    const text = main.files.get('Star Voyager.vic20')!
    // The same file the web build's *Download* writes, and one the app reads
    // back as the same project — a copy, not a conversion.
    expect(text).toContain('\n  "version": 1,\n')
    expect(deserializeProject(text).id).toBe(id)
    // Nothing left browser storage.
    expect(repository.load(id)).not.toBeNull()
  })

  it('carries the skipped names through to the result', async () => {
    seed('Star Voyager', '2026-06-01T00:00:00.000Z')
    seedCorrupt('Broken')
    const migrator = createMigrator(main.api, repository)

    const outcome = await migrator.run((await migrator.pending())!)
    expect(outcome.unreadable).toEqual(['Broken'])
  })

  it('reports a project main could not write, and leaves it in storage', async () => {
    const id = seed('Star Voyager', '2026-06-01T00:00:00.000Z')
    main.fail('The disk is full.')
    const migrator = createMigrator(main.api, repository)

    const outcome = await migrator.run((await migrator.pending())!)

    expect(outcome.done).toBe(false)
    expect(outcome.failed).toEqual([{ id, name: 'Star Voyager', reason: 'The disk is full.' }])
    await migrator.removeBrowserCopies(outcome)
    expect(repository.load(id)).not.toBeNull()
  })
})

describe('removing the browser copies', () => {
  it('happens only when asked, and only for what was written (D19)', async () => {
    const written = seed('Star Voyager', '2026-06-01T00:00:00.000Z')
    const corrupt = seedCorrupt('Broken')
    const migrator = createMigrator(main.api, repository)

    const outcome = await migrator.run((await migrator.pending())!)
    // Still there until the user says so.
    expect(repository.load(written)).not.toBeNull()

    await migrator.removeBrowserCopies(outcome)

    expect(repository.load(written)).toBeNull()
    // The entry that could not be read was never copied, so it is never removed
    // — it is the one project a mistake here would destroy.
    expect(localStorage.getItem(projectKey(corrupt))).not.toBeNull()
    expect(repository.list().map((summary) => summary.name)).toEqual(['Broken'])
  })
})
