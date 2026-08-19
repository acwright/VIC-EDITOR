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

  it('creates a project and lists it', () => {
    const store = useProjectsStore()
    const project = store.create({ name: 'Alpha', type: 'hires' })
    expect(project).not.toBeNull()
    expect(store.summaries.map((s) => s.name)).toEqual(['Alpha'])
    expect(store.lastError).toBeNull()
  })

  it('opens and closes a project', () => {
    const store = useProjectsStore()
    const project = store.create({ name: 'Alpha', type: 'hires' })!
    expect(store.open(project.id)?.name).toBe('Alpha')
    expect(store.current?.id).toBe(project.id)
    expect(store.saveState).toBe('saved')
    store.close()
    expect(store.current).toBeNull()
  })

  it('open returns null for a missing project', () => {
    const store = useProjectsStore()
    expect(store.open('missing')).toBeNull()
    expect(store.current).toBeNull()
  })

  it('renames a project', () => {
    const store = useProjectsStore()
    const project = store.create({ name: 'Alpha', type: 'hires' })!
    expect(store.rename(project.id, 'Beta')).toBe(true)
    expect(store.summaries[0]?.name).toBe('Beta')
  })

  it('duplicates a project with a fresh id and name suffix', () => {
    const store = useProjectsStore()
    const project = store.create({ name: 'Alpha', type: 'hires' })!
    const copy = store.duplicate(project.id)!
    expect(copy.id).not.toBe(project.id)
    expect(copy.name).toBe('Alpha copy')
    expect(copy.charset).toEqual(project.charset)
    expect(store.summaries).toHaveLength(2)
  })

  it('removes a project and clears it if open', () => {
    const store = useProjectsStore()
    const project = store.create({ name: 'Alpha', type: 'hires' })!
    store.open(project.id)
    store.remove(project.id)
    expect(store.summaries).toEqual([])
    expect(store.current).toBeNull()
  })

  describe('import / export', () => {
    it('round-trips through export and import', () => {
      const store = useProjectsStore()
      const project = store.create({ name: 'My Project!', type: 'hires' })!
      const payload = store.exportProject(project.id)!
      expect(payload.filename).toBe('my-project.vic20.json')

      store.remove(project.id)
      const imported = store.importProject(payload.json)!
      expect(imported.id).toBe(project.id) // no collision — id kept
      expect(store.summaries.map((s) => s.name)).toEqual(['My Project!'])
    })

    it('assigns a fresh id when importing a colliding project', () => {
      const store = useProjectsStore()
      const project = store.create({ name: 'Alpha', type: 'hires' })!
      const imported = store.importProject(serializeProject(project))!
      expect(imported.id).not.toBe(project.id)
      expect(store.summaries).toHaveLength(2)
    })

    it('names the TMS9918 editor when one of its files is uploaded (D17)', () => {
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
      expect(store.importProject(JSON.stringify(foreign))).toBeNull()
      expect(store.lastError).toContain('TMS9918 editor')
      expect(store.lastError).toContain('.vic20.json')
    })

    it('rejects a malformed upload with a readable error', () => {
      const store = useProjectsStore()
      expect(store.importProject('{oops')).toBeNull()
      expect(store.lastError).toContain('Import failed')

      const invalid = { ...createProject({ seed: 'blank', name: 'X', type: 'hires' }), version: 9 }
      expect(store.importProject(JSON.stringify(invalid))).toBeNull()
      expect(store.lastError).toContain('Unsupported project version')
    })
  })

  describe('share links', () => {
    it('builds a link that decodes back to the same project', async () => {
      const store = useProjectsStore()
      const project = store.create({ name: 'Shared', type: 'hires' })!
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

    it('adopts a shared project, keeping the local copy when ids collide', () => {
      const store = useProjectsStore()
      const project = store.create({ name: 'Alpha', type: 'hires' })!
      const adopted = store.adopt(structuredClone(project))!
      expect(adopted.id).not.toBe(project.id)
      expect(store.summaries).toHaveLength(2)
    })
  })

  describe('save → reload → share → import (the Phase 9 bar)', () => {
    /** A project with something in every field a round trip could lose. */
    function drawnProject() {
      const store = useProjectsStore()
      const project = store.create({
        name: 'Round Trip',
        type: 'mixed',
        settings: { columns: 28, rows: 16, charHeight: 16, screenColor: 6, borderColor: 2 },
        seed: 'blank',
      })!
      store.open(project.id)
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
      store.saveCurrent()
      store.close()
      return current
    }

    it('survives a save and reload byte for byte', () => {
      const store = useProjectsStore()
      const saved = drawnProject()
      // A reload is a fresh store over the same storage.
      setActivePinia(createPinia())
      const reloaded = useProjectsStore()
      reloaded.refresh()
      expect(serializeProject(reloaded.open(saved.id)!)).toBe(serializeProject(saved))
      expect(store.lastError).toBeNull()
    })

    it('survives a share link and its import back', async () => {
      const store = useProjectsStore()
      const saved = drawnProject()
      const url = (await store.shareLink(saved.id))!

      // Opened in another browser: nothing stored, so the id survives too.
      setActivePinia(createPinia())
      localStorage.clear()
      const other = useProjectsStore()
      const shared = await decodeShare(readShareHash(new URL(url).hash)!)
      expect(serializeProject(other.adopt(shared)!)).toBe(serializeProject(saved))
    })

    it('survives a download and its upload back', () => {
      const store = useProjectsStore()
      const saved = drawnProject()
      const payload = store.exportProject(saved.id)!
      expect(payload.filename).toBe('round-trip.vic20.json')

      store.remove(saved.id)
      expect(serializeProject(store.importProject(payload.json)!)).toBe(serializeProject(saved))
    })

    it('keeps the summary in step with the geometry it was saved at', async () => {
      const store = useProjectsStore()
      const saved = drawnProject()
      expect(store.summaries[0]).toMatchObject({
        columns: 28,
        rows: 16,
        charHeight: 16,
        type: 'mixed',
      })
      // …and a shared copy summarises the same way when it lands elsewhere.
      const shared = await decodeShare(await encodeShare(saved))
      setActivePinia(createPinia())
      localStorage.clear()
      const other = useProjectsStore()
      other.adopt(shared)
      expect(other.summaries[0]).toMatchObject({ columns: 28, rows: 16, charHeight: 16 })
    })
  })

  describe('autosave', () => {
    it('debounces markDirty into one save and updates modifiedAt', () => {
      vi.useFakeTimers()
      const store = useProjectsStore()
      const project = store.create({ name: 'Alpha', type: 'hires' })!
      store.open(project.id)

      store.current!.name = 'Edited'
      store.markDirty()
      expect(store.saveState).toBe('unsaved')
      store.markDirty() // second call within the window re-debounces

      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1)
      expect(store.saveState).toBe('unsaved')
      vi.advanceTimersByTime(1)
      expect(store.saveState).toBe('saved')
      expect(store.summaries[0]?.name).toBe('Edited')
    })

    it('close flushes a pending autosave', () => {
      vi.useFakeTimers()
      const store = useProjectsStore()
      const project = store.create({ name: 'Alpha', type: 'hires' })!
      store.open(project.id)

      store.current!.name = 'Flushed'
      store.markDirty()
      store.close()

      expect(store.summaries[0]?.name).toBe('Flushed')
      expect(store.current).toBeNull()
    })

    it('saveCurrent saves immediately', () => {
      const store = useProjectsStore()
      const project = store.create({ name: 'Alpha', type: 'hires' })!
      store.open(project.id)
      store.current!.name = 'Now'
      expect(store.saveCurrent()).toBe(true)
      expect(store.saveState).toBe('saved')
      expect(store.summaries[0]?.name).toBe('Now')
    })
  })
})
