import { beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '@/domain/factory'
import { createBrowserStore } from '../browserStore'
import { StorageQuotaError, createRepository, type KVStorage } from '../repository'
import { describeProjectLibrary } from './storeContract'

// The port's own suite, run against the localStorage adapter. Phase F3's
// document adapter runs the same one (PLAN.md D1).
describeProjectLibrary('browserStore', () => {
  localStorage.clear()
  return createBrowserStore()
})

// What is true of *this* adapter and not of the port.
describe('browserStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('is the browser kind', () => {
    expect(createBrowserStore().kind).toBe('browser')
  })

  it('reads what the repository wrote, and vice versa', async () => {
    // The adapter is a skin over `repository.ts`, not a second storage layout:
    // a project written by either has to be visible to the other, which is
    // what makes the migration in Phase F6 a copy rather than a conversion.
    const repository = createRepository()
    const project = createProject({ name: 'Shared', type: 'hires' })
    repository.save(project)

    const store = createBrowserStore()
    expect(await store.load(project.id)).toEqual(project)

    await store.rename(project.id, 'Renamed')
    expect(repository.load(project.id)?.name).toBe('Renamed')
  })

  it('rejects with StorageQuotaError when the storage is full', async () => {
    const full: KVStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
      removeItem: () => {},
    }
    const store = createBrowserStore(createRepository(full))
    // A synchronous throw from the repository has to arrive as a rejection:
    // the store above only ever awaits.
    await expect(store.save(createProject({ name: 'Big', type: 'multicolor' }))).rejects.toThrow(
      StorageQuotaError,
    )
  })
})
