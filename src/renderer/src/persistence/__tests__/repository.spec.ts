import { beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '@/domain/factory'
import { PROJECT_TYPES } from '@/domain/modes'
import {
  INDEX_KEY,
  StorageQuotaError,
  createRepository,
  projectKey,
  summarize,
  type KVStorage,
} from '../repository'

describe('repository', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts empty', () => {
    expect(createRepository().list()).toEqual([])
  })

  it.each(PROJECT_TYPES)('lists and loads a %s project', (type) => {
    const repository = createRepository()
    const project = createProject({ seed: 'blank', name: 'P', type })
    repository.save(project)

    // Regression: the index summary guard once hard-coded its type list and
    // dropped saved projects of a type it had not been updated for. It now
    // derives from MODES, so this covers every type.
    expect(repository.list()).toEqual([
      {
        id: project.id,
        name: 'P',
        type,
        columns: 22,
        rows: 23,
        charHeight: 8,
        modifiedAt: project.modifiedAt,
      },
    ])
    expect(repository.load(project.id)).toEqual(project)
  })

  it('summarises the settings the manager list shows (D3, D8)', () => {
    const repository = createRepository()
    const project = createProject({
      seed: 'blank',
      name: 'Wide',
      type: 'hires',
      settings: { columns: 28, rows: 16, charHeight: 16 },
    })
    repository.save(project)

    expect(repository.list()[0]).toMatchObject({ columns: 28, rows: 16, charHeight: 16 })
  })

  it('re-summarises after a geometry change', () => {
    const repository = createRepository()
    const project = createProject({ seed: 'blank', name: 'Resized', type: 'hires' })
    repository.save(project)
    project.settings.columns = 20
    project.settings.rows = 10
    project.screens[0] = {
      name: 'Screen 1',
      cells: Array(200).fill(32),
      colors: Array(200).fill(6),
    }
    repository.save(project)

    expect(repository.list()[0]).toMatchObject({ columns: 20, rows: 10 })
  })

  describe('index entries written before the summary carried geometry', () => {
    /** Save a project, then rewrite its index entry in the older shape. */
    function saveWithLegacyIndex(name: string) {
      const repository = createRepository()
      const project = createProject({
        seed: 'blank',
        name,
        type: 'mixed',
        settings: { columns: 28, rows: 16 },
      })
      repository.save(project)
      const { id, type, modifiedAt } = summarize(project)
      localStorage.setItem(INDEX_KEY, JSON.stringify([{ id, name, type, modifiedAt }]))
      return { repository, project }
    }

    it('rebuilds them from the project rather than hiding it', () => {
      const { repository, project } = saveWithLegacyIndex('Legacy')
      expect(repository.list()).toEqual([summarize(project)])
    })

    it('heals the stored index so the rebuild happens once', () => {
      const { repository, project } = saveWithLegacyIndex('Legacy')
      repository.list()
      expect(JSON.parse(localStorage.getItem(INDEX_KEY)!)).toEqual([summarize(project)])
    })

    it('drops one whose project is gone', () => {
      const { repository, project } = saveWithLegacyIndex('Orphan')
      localStorage.removeItem(projectKey(project.id))
      expect(repository.list()).toEqual([])
    })
  })

  it('still drops index entries naming an unknown type', () => {
    const repository = createRepository()
    localStorage.setItem(
      INDEX_KEY,
      JSON.stringify([{ id: 'x', name: 'Bogus', type: 'graphics1', modifiedAt: 'now' }]),
    )
    expect(repository.list()).toEqual([])
  })

  it('updates the index entry on re-save instead of duplicating it', () => {
    const repository = createRepository()
    const project = createProject({ seed: 'blank', name: 'Alpha', type: 'hires' })
    repository.save(project)
    repository.save({ ...project, name: 'Renamed' })

    const index = repository.list()
    expect(index).toHaveLength(1)
    expect(index[0]?.name).toBe('Renamed')
  })

  it('lists most recently modified first', () => {
    const repository = createRepository()
    const older = createProject({ seed: 'blank', name: 'Old', type: 'hires' })
    const newer = createProject({ seed: 'blank', name: 'New', type: 'hires' })
    repository.save({ ...older, modifiedAt: '2026-01-01T00:00:00.000Z' })
    repository.save({ ...newer, modifiedAt: '2026-06-01T00:00:00.000Z' })

    expect(repository.list().map((s) => s.name)).toEqual(['New', 'Old'])
  })

  it('removes a project and its index entry', () => {
    const repository = createRepository()
    const project = createProject({ seed: 'blank', name: 'Gone', type: 'hires' })
    repository.save(project)
    repository.remove(project.id)

    expect(repository.list()).toEqual([])
    expect(repository.load(project.id)).toBeNull()
    expect(localStorage.getItem(projectKey(project.id))).toBeNull()
  })

  it('returns null for a missing project', () => {
    expect(createRepository().load('nope')).toBeNull()
  })

  it('tolerates a corrupt index', () => {
    localStorage.setItem(INDEX_KEY, '{oops')
    expect(createRepository().list()).toEqual([])
    localStorage.setItem(INDEX_KEY, JSON.stringify([{ bogus: true }, 42]))
    expect(createRepository().list()).toEqual([])
  })

  it('returns null for a corrupt or invalid stored project', () => {
    localStorage.setItem(projectKey('bad-json'), '{oops')
    expect(createRepository().load('bad-json')).toBeNull()

    localStorage.setItem(projectKey('bad-shape'), JSON.stringify({ version: 99 }))
    expect(createRepository().load('bad-shape')).toBeNull()
  })

  it('throws StorageQuotaError when the storage is full', () => {
    const full: KVStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
      removeItem: () => {},
    }
    const repository = createRepository(full)
    const project = createProject({ seed: 'blank', name: 'Big', type: 'hires' })
    expect(() => repository.save(project)).toThrowError(StorageQuotaError)
  })
})
