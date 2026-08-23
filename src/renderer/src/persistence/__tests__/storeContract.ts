/**
 * The `ProjectStore` / `ProjectLibrary` contract, written against the port
 * rather than against any one adapter (PLAN.md D1, Phase F1).
 *
 * `browserStore.spec.ts` runs it against localStorage today; the desktop's
 * document adapter inherits the same suite in Phase F3, which is the point of
 * writing it here. Nothing in it may reach for `localStorage`, a repository or
 * a file path — a test that needs one of those belongs in the adapter's own
 * spec, beside this suite's call.
 *
 * Not a `.spec.ts` file: vitest collects those, and this one has no tests of
 * its own until an adapter calls it.
 */

import { describe, expect, it } from 'vitest'
import { createProject } from '@/domain/factory'
import { PROJECT_TYPES } from '@/domain/modes'
import type { Project } from '@/domain/types'
import { MissingProjectError, type ProjectLibrary, type ProjectStore } from '../store'

/** Whatever the build's first mode is: the port says nothing about modes. */
const TYPE = PROJECT_TYPES[0]!

/** Makes a fresh, empty store. Called before each test in the suite. */
export type StoreFactory<T extends ProjectStore> = () => T | Promise<T>

function seed(name = 'Alpha'): Project {
  return createProject({ name, type: TYPE })
}

/** The narrow half: what an editor needs of any adapter. */
export function describeProjectStore(label: string, makeStore: StoreFactory<ProjectStore>): void {
  describe(`${label} — ProjectStore contract`, () => {
    it('saves a project and loads it back unchanged', async () => {
      const store = await makeStore()
      const project = seed()
      await store.save(project)
      expect(await store.load(project.id)).toEqual(project)
    })

    it('resolves to null for a project it does not have', async () => {
      const store = await makeStore()
      expect(await store.load('missing')).toBeNull()
    })

    it('replaces a project on re-save rather than keeping both', async () => {
      const store = await makeStore()
      const project = seed()
      await store.save(project)
      await store.save({ ...project, name: 'Renamed' })
      expect((await store.load(project.id))?.name).toBe('Renamed')
    })

    it('returns a detached copy, so editing it does not reach storage', async () => {
      const store = await makeStore()
      const project = seed()
      await store.save(project)

      const loaded = (await store.load(project.id))!
      loaded.name = 'Local edit'
      expect((await store.load(project.id))?.name).toBe('Alpha')
    })
  })
}

/** The wide half: what a *list* of projects needs. Browser build only. */
export function describeProjectLibrary(
  label: string,
  makeLibrary: StoreFactory<ProjectLibrary>,
): void {
  describeProjectStore(label, makeLibrary)

  describe(`${label} — ProjectLibrary contract`, () => {
    it('starts empty', async () => {
      expect(await (await makeLibrary()).list()).toEqual([])
    })

    it('lists a saved project once, however often it is saved', async () => {
      const library = await makeLibrary()
      const project = seed()
      await library.save(project)
      await library.save(project)

      const list = await library.list()
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ id: project.id, name: 'Alpha', type: TYPE })
    })

    it('lists most recently modified first', async () => {
      const library = await makeLibrary()
      await library.save({ ...seed('Old'), modifiedAt: '2026-01-01T00:00:00.000Z' })
      await library.save({ ...seed('New'), modifiedAt: '2026-06-01T00:00:00.000Z' })
      expect((await library.list()).map((s) => s.name)).toEqual(['New', 'Old'])
    })

    it('renames a project in place, keeping its id and content', async () => {
      const library = await makeLibrary()
      const project = seed()
      await library.save(project)
      await library.rename(project.id, 'Beta')

      const loaded = (await library.load(project.id))!
      expect(loaded.name).toBe('Beta')
      expect(loaded.id).toBe(project.id)
      expect((await library.list()).map((s) => s.name)).toEqual(['Beta'])
    })

    it('stamps modifiedAt on rename', async () => {
      const library = await makeLibrary()
      const project = { ...seed(), modifiedAt: '2020-01-01T00:00:00.000Z' }
      await library.save(project)
      await library.rename(project.id, 'Beta')
      expect((await library.load(project.id))!.modifiedAt).not.toBe(project.modifiedAt)
    })

    it('duplicates under a fresh id, suffixing the name and copying the content', async () => {
      const library = await makeLibrary()
      const project = seed()
      await library.save(project)

      const copyId = await library.duplicate(project.id)
      expect(copyId).not.toBe(project.id)

      const copy = (await library.load(copyId))!
      expect(copy.name).toBe('Alpha copy')
      expect({ ...copy, id: '', name: '', createdAt: '', modifiedAt: '' }).toEqual({
        ...project,
        id: '',
        name: '',
        createdAt: '',
        modifiedAt: '',
      })
      expect(await library.list()).toHaveLength(2)
    })

    it('leaves the original alone when the copy is edited and saved', async () => {
      const library = await makeLibrary()
      const project = seed()
      await library.save(project)

      const copy = (await library.load(await library.duplicate(project.id)))!
      copy.name = 'Edited copy'
      await library.save(copy)

      expect(await library.load(project.id)).toEqual(project)
    })

    it('removes a project and its list entry', async () => {
      const library = await makeLibrary()
      const project = seed()
      await library.save(project)
      await library.remove(project.id)

      expect(await library.list()).toEqual([])
      expect(await library.load(project.id)).toBeNull()
    })

    it('removing a project that is not there is not an error', async () => {
      const library = await makeLibrary()
      await expect(library.remove('missing')).resolves.toBeUndefined()
    })

    it('rejects with MissingProjectError when renaming or duplicating nothing', async () => {
      const library = await makeLibrary()
      await expect(library.rename('missing', 'X')).rejects.toThrow(MissingProjectError)
      await expect(library.duplicate('missing')).rejects.toThrow(MissingProjectError)
    })
  })
}
