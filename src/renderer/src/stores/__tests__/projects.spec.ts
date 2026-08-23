import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { serializeProject } from '@/domain/serialization'
import { createProject } from '@/domain/factory'
import { decodeShare, encodeShare, readShareHash } from '@/domain/share'
import { AUTOSAVE_DELAY_MS, useProjectsStore } from '../projects'

describe('projects store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a project and lists it', async () => {
    const store = useProjectsStore()
    const project = await store.create({ name: 'Alpha', type: 'hires' })
    expect(project).not.toBeNull()
    expect(store.summaries.map((s) => s.name)).toEqual(['Alpha'])
    expect(store.lastError).toBeNull()
  })

  it('opens and closes a project', async () => {
    const store = useProjectsStore()
    const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
    expect((await store.open(project.id))?.name).toBe('Alpha')
    expect(store.current?.id).toBe(project.id)
    expect(store.saveState).toBe('saved')
    await store.close()
    expect(store.current).toBeNull()
  })

  it('open resolves to null for a missing project', async () => {
    const store = useProjectsStore()
    expect(await store.open('missing')).toBeNull()
    expect(store.current).toBeNull()
  })

  it('a second open wins, however the loads interleave', async () => {
    // Awaiting a load means a fast second navigation can land while the first
    // is still in flight; the stale one must not overwrite what is now open.
    const store = useProjectsStore()
    const first = (await store.create({ name: 'First', type: 'hires' }))!
    const second = (await store.create({ name: 'Second', type: 'hires' }))!

    const stale = store.open(first.id)
    const fresh = store.open(second.id)
    await Promise.all([stale, fresh])

    expect(store.current?.id).toBe(second.id)
  })

  it('renames a project', async () => {
    const store = useProjectsStore()
    const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
    expect(await store.rename(project.id, 'Beta')).toBe(true)
    expect(store.summaries[0]?.name).toBe('Beta')
  })

  it('renames the open project in memory as well as in storage', async () => {
    const store = useProjectsStore()
    const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
    await store.open(project.id)
    await store.rename(project.id, 'Beta')
    expect(store.current?.name).toBe('Beta')
  })

  it('reports a rename of a project that is gone', async () => {
    const store = useProjectsStore()
    expect(await store.rename('missing', 'Beta')).toBe(false)
    expect(store.lastError).toContain('Renaming')
  })

  it('duplicates a project with a fresh id and name suffix', async () => {
    const store = useProjectsStore()
    const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
    const copyId = (await store.duplicate(project.id))!
    expect(copyId).not.toBe(project.id)

    const copy = (await store.open(copyId))!
    expect(copy.name).toBe('Alpha copy')
    expect(copy.charset).toEqual(project.charset)
    expect(store.summaries).toHaveLength(2)
  })

  it('removes a project and clears it if open', async () => {
    const store = useProjectsStore()
    const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
    await store.open(project.id)
    await store.remove(project.id)
    expect(store.summaries).toEqual([])
    expect(store.current).toBeNull()
  })

  describe('import / export', () => {
    it('round-trips through export and import', async () => {
      const store = useProjectsStore()
      const project = (await store.create({ name: 'My Project!', type: 'hires' }))!
      const payload = (await store.exportProject(project.id))!
      // The document name, not a slug and not the compound v1 extension: a
      // download and a document are the same file now (D3, F7).
      expect(payload.filename).toBe('My Project!.vic20')

      await store.remove(project.id)
      const imported = (await store.importProject(payload.json))!
      expect(imported.id).toBe(project.id) // no collision — id kept
      expect(store.summaries.map((s) => s.name)).toEqual(['My Project!'])
    })

    it('assigns a fresh id when importing a colliding project', async () => {
      const store = useProjectsStore()
      const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
      const imported = (await store.importProject(serializeProject(project)))!
      expect(imported.id).not.toBe(project.id)
      expect(store.summaries).toHaveLength(2)
    })

    it('names the TMS9918 editor when one of its files is uploaded (D17)', async () => {
      const store = useProjectsStore()
      const foreign = {
        version: 1,
        id: 'abc',
        name: 'Old',
        type: 'graphics1',
        createdAt: '2026-01-01T00:00:00.000Z',
        modifiedAt: '2026-01-01T00:00:00.000Z',
        settings: {},
        charsets: [[]],
        colors: { groups: [] },
        screens: [],
      }
      expect(await store.importProject(JSON.stringify(foreign))).toBeNull()
      expect(store.lastError).toContain('TMS9918 editor')
      expect(store.lastError).toContain('.vic20.json')
    })

    it('rejects a malformed upload with a readable error', async () => {
      const store = useProjectsStore()
      expect(await store.importProject('{oops')).toBeNull()
      expect(store.lastError).toContain('Import failed')

      const invalid = { ...createProject({ seed: 'blank', name: 'X', type: 'hires' }), version: 9 }
      expect(await store.importProject(JSON.stringify(invalid))).toBeNull()
      expect(store.lastError).toContain('Unsupported project version')
    })
  })

  describe('share links', () => {
    it('builds a link that decodes back to the same project', async () => {
      const store = useProjectsStore()
      const project = (await store.create({ name: 'Shared', type: 'hires' }))!
      const url = (await store.shareLink(project.id))!
      expect(url).toContain('#v=')

      const decoded = await decodeShare(readShareHash(new URL(url).hash)!)
      expect(decoded).toEqual(project)
    })

    it('reports a missing project instead of building a link', async () => {
      const store = useProjectsStore()
      expect(await store.shareLink('missing')).toBeNull()
      expect(store.lastError).toContain('could not be loaded')
    })

    it('adopts a shared project, keeping the local copy when ids collide', async () => {
      const store = useProjectsStore()
      const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
      const adopted = (await store.adopt(structuredClone(project)))!
      expect(adopted.id).not.toBe(project.id)
      expect(store.summaries).toHaveLength(2)
    })
  })

  describe('save → reload → share → import (the Phase 9 bar)', () => {
    /** A project with something in every field a round trip could lose. */
    async function drawnProject() {
      const store = useProjectsStore()
      const project = (await store.create({
        name: 'Round Trip',
        type: 'mixed',
        settings: { columns: 28, rows: 16, charHeight: 16, screenColor: 6, borderColor: 2 },
        seed: 'blank',
      }))!
      await store.open(project.id)
      const current = store.current!
      current.charset[7] = Array.from({ length: 16 }, (_, i) => (i * 17) & 0xff)
      current.charModes![7] = true
      current.screens[0]!.cells[9] = 7
      current.screens[0]!.colors[9] = 5
      current.screens.push({
        name: 'Screen 2',
        cells: Array(448).fill(32),
        colors: Array(448).fill(3),
      })
      await store.saveCurrent()
      await store.close()
      return current
    }

    it('survives a save and reload byte for byte', async () => {
      const store = useProjectsStore()
      const saved = await drawnProject()
      // A reload is a fresh store over the same storage.
      setActivePinia(createPinia())
      const reloaded = useProjectsStore()
      await reloaded.refresh()
      expect(serializeProject((await reloaded.open(saved.id))!)).toBe(serializeProject(saved))
      expect(store.lastError).toBeNull()
    })

    it('survives a share link and its import back', async () => {
      const store = useProjectsStore()
      const saved = await drawnProject()
      const url = (await store.shareLink(saved.id))!

      // Opened in another browser: nothing stored, so the id survives too.
      setActivePinia(createPinia())
      localStorage.clear()
      const other = useProjectsStore()
      const shared = await decodeShare(readShareHash(new URL(url).hash)!)
      expect(serializeProject((await other.adopt(shared))!)).toBe(serializeProject(saved))
    })

    it('survives a download and its upload back', async () => {
      const store = useProjectsStore()
      const saved = await drawnProject()
      const payload = (await store.exportProject(saved.id))!
      expect(payload.filename).toBe('Round Trip.vic20')

      await store.remove(saved.id)
      expect(serializeProject((await store.importProject(payload.json))!)).toBe(
        serializeProject(saved),
      )
    })

    it('keeps the summary in step with the geometry it was saved at', async () => {
      const store = useProjectsStore()
      const saved = await drawnProject()
      expect(store.summaries[0]).toMatchObject({
        columns: 28,
        rows: 16,
        charHeight: 16,
        type: 'mixed',
      })
      // …and a shared copy summarizes the same way when it lands elsewhere.
      const shared = await decodeShare(await encodeShare(saved))
      setActivePinia(createPinia())
      localStorage.clear()
      const other = useProjectsStore()
      await other.adopt(shared)
      expect(other.summaries[0]).toMatchObject({ columns: 28, rows: 16, charHeight: 16 })
    })
  })

  describe('autosave', () => {
    it('debounces markDirty into one save and updates modifiedAt', async () => {
      vi.useFakeTimers()
      const store = useProjectsStore()
      const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
      await store.open(project.id)

      store.current!.name = 'Edited'
      store.markDirty()
      expect(store.saveState).toBe('unsaved')
      store.markDirty() // second call within the window re-debounces

      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1)
      expect(store.saveState).toBe('unsaved')
      await vi.advanceTimersByTimeAsync(1)
      expect(store.saveState).toBe('saved')
      expect(store.summaries[0]?.name).toBe('Edited')
    })

    it('close flushes a pending autosave', async () => {
      vi.useFakeTimers()
      const store = useProjectsStore()
      const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
      await store.open(project.id)

      store.current!.name = 'Flushed'
      store.markDirty()
      await store.close()

      expect(store.summaries[0]?.name).toBe('Flushed')
      expect(store.current).toBeNull()
    })

    it('saveCurrent saves immediately', async () => {
      const store = useProjectsStore()
      const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
      await store.open(project.id)
      store.current!.name = 'Now'
      expect(await store.saveCurrent()).toBe(true)
      expect(store.saveState).toBe('saved')
      expect(store.summaries[0]?.name).toBe('Now')
    })

    it('flushAutosave resolves only once the write has landed', async () => {
      // The before-quit path (App.vue) waits on this and then tells main it is
      // safe to close, so "resolved" has to mean "written", not "scheduled".
      const store = useProjectsStore()
      const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
      await store.open(project.id)

      store.current!.name = 'Quitting'
      store.markDirty()
      await store.flushAutosave()

      expect(store.saveState).toBe('saved')
      expect(store.summaries[0]?.name).toBe('Quitting')
    })

    it('flushAutosave waits for a save that is already in flight', async () => {
      const store = useProjectsStore()
      const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
      await store.open(project.id)

      store.current!.name = 'In flight'
      const inFlight = store.saveCurrent()
      const flushed = store.flushAutosave()
      await Promise.all([inFlight, flushed])

      expect(store.saveState).toBe('saved')
      expect(store.summaries[0]?.name).toBe('In flight')
    })

    it('flushing with nothing to save is a no-op that still resolves', async () => {
      const store = useProjectsStore()
      await expect(store.flushAutosave()).resolves.toBeUndefined()
    })
  })

  describe('unchanged saves (D5)', () => {
    it('writes nothing, and stamps nothing, when the project has not changed', async () => {
      const store = useProjectsStore()
      const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
      await store.open(project.id)
      const stamp = store.current!.modifiedAt

      const setItem = vi.spyOn(localStorage, 'setItem')
      expect(await store.saveCurrent()).toBe(true)

      expect(setItem).not.toHaveBeenCalled()
      expect(store.current!.modifiedAt).toBe(stamp)
      expect(store.saveState).toBe('saved')
      setItem.mockRestore()
    })

    it('writes, and stamps, as soon as a pixel moves', async () => {
      vi.useFakeTimers()
      const store = useProjectsStore()
      const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
      await store.open(project.id)
      const stamp = store.current!.modifiedAt

      // Far enough that the ISO stamp is bound to differ.
      vi.setSystemTime(new Date(Date.parse(stamp) + 60_000))
      store.current!.charset[0]![0] = 1
      expect(await store.saveCurrent()).toBe(true)

      expect(store.current!.modifiedAt).not.toBe(stamp)
      const reopened = (await store.open(project.id))!
      expect(reopened.charset[0]![0]).toBe(1)
    })

    it('a second save of the same edit writes once', async () => {
      const store = useProjectsStore()
      const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
      await store.open(project.id)

      store.current!.name = 'Edited'
      await store.saveCurrent()
      const stamp = store.current!.modifiedAt

      const setItem = vi.spyOn(localStorage, 'setItem')
      await store.saveCurrent()
      expect(setItem).not.toHaveBeenCalled()
      expect(store.current!.modifiedAt).toBe(stamp)
      setItem.mockRestore()
    })
  })
})
