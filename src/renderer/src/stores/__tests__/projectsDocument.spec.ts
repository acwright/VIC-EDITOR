import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createProject } from '@/domain/factory'
import { serializeProject } from '@/domain/serialization'
import { useProjectsStore } from '../projects'
import type { AppApi } from '@shared/api'
import type { DocumentResult, OpenDocument } from '@shared/document'

/**
 * The projects store on the desktop side of its one fork (PLAN.md D1, Phase
 * F3): the same actions, answered by a document instead of by a list.
 *
 * `projects.spec.ts` covers the browser half, which is unchanged. What is worth
 * checking here is that the store picks the document adapter at all, that the
 * jobs only a list can do fail quietly rather than throwing, and that the two
 * halves of "one document" — the name in the header and main's own open file —
 * are kept in step.
 */

/** Main, faked: one document, and a note of everything written to it. */
function fakeMain() {
  let document: OpenDocument | null = null
  let failure: string | null = null
  const writes: string[] = []

  function ok<T>(value: T): DocumentResult<T> {
    return { status: 'ok', value }
  }

  const api: AppApi['document'] = {
    async create({ name, text }) {
      if (failure) return { status: 'error', reason: failure }
      document = {
        path: `/documents/${name}.vic20`,
        name,
        text,
        stamp: { mtimeMs: 1, size: text.length },
      }
      return ok(document)
    },
    async open() {
      return document ? ok(document) : { status: 'none' }
    },
    async current() {
      return document ? ok(document) : { status: 'none' }
    },
    async write(text) {
      if (failure) return { status: 'error', reason: failure }
      if (!document) return { status: 'error', reason: 'No document is open.' }
      writes.push(text)
      document = { ...document, text, stamp: { mtimeMs: Date.now(), size: text.length } }
      return ok(document.stamp)
    },
    async close() {
      document = null
    },
    async reveal() {},
    async defaultLocation() {
      return '/documents'
    },
    async chooseLocation() {
      return '/elsewhere'
    },
  }

  return {
    api,
    writes,
    get document() {
      return document
    },
    seed(name: string, text: string) {
      document = {
        path: `/documents/${name}.vic20`,
        name,
        text,
        stamp: { mtimeMs: 1, size: text.length },
      }
    },
    fail(reason: string) {
      failure = reason
    },
  }
}

let main: ReturnType<typeof fakeMain>

beforeEach(() => {
  main = fakeMain()
  // The whole of `isDesktop()`: the preload bridge being there at all.
  vi.stubGlobal('api', { document: main.api } satisfies Partial<AppApi>)
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('projects store, on the desktop', () => {
  it('creates a project as a file and opens it', async () => {
    const store = useProjectsStore()
    const project = await store.create({ name: 'Title Screen', type: 'hires' })

    expect(project).not.toBeNull()
    expect(store.lastError).toBeNull()
    expect(main.document?.path).toBe('/documents/Title Screen.vic20')
    // The file holds the git-first serialization, not compact JSON (D4).
    expect(main.document?.text).toBe(serializeProject(project!))
  })

  it('shows the document’s name in place of the project list’s', async () => {
    const store = useProjectsStore()
    const project = (await store.create({ name: 'Title Screen', type: 'hires' }))!

    expect(store.documentName).toBe('Title Screen')
    await store.open(project.id)
    expect(store.documentName).toBe('Title Screen')
  })

  it('re-reads the open document rather than keeping a list', async () => {
    // A ⌘R at /edit/<id> lands here: the renderer asks main what is open and
    // reads it back, because main is the process that knows (D9).
    const project = createProject({ name: 'Title Screen', type: 'hires' })
    main.seed('Title Screen', serializeProject(project))

    const store = useProjectsStore()
    expect((await store.open(project.id))?.id).toBe(project.id)
    expect(store.current?.name).toBe('Title Screen')
    expect(store.summaries).toEqual([])
  })

  it('answers null when the route names a document that is not open', async () => {
    const store = useProjectsStore()
    await store.create({ name: 'Alpha', type: 'hires' })
    expect(await store.open(crypto.randomUUID())).toBeNull()
    expect(store.current).toBeNull()
  })

  it('says why a document could not be read, rather than opening blank', async () => {
    main.seed('Broken', '{ "not": "a project" }')
    const store = useProjectsStore()

    expect(await store.open('anything')).toBeNull()
    expect(store.lastError).toBeTruthy()
  })

  it('closes main’s document when the editor is left (D17)', async () => {
    const store = useProjectsStore()
    const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
    await store.open(project.id)

    await store.close()
    expect(main.document).toBeNull()
    expect(store.documentName).toBeNull()
  })

  it('writes an edit through to the file', async () => {
    vi.useFakeTimers()
    const store = useProjectsStore()
    const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
    await store.open(project.id)

    store.current!.name = 'Alpha edited'
    store.markDirty()
    await vi.advanceTimersByTimeAsync(600)

    expect(main.writes).toHaveLength(1)
    expect(main.document?.text).toContain('Alpha edited')
    expect(store.saveState).toBe('saved')
  })

  it('does not write when nothing changed (D5)', async () => {
    const store = useProjectsStore()
    const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
    await store.open(project.id)

    await store.saveCurrent()
    await store.saveCurrent()
    expect(main.writes).toEqual([])
  })

  it('reports a failed write in the banner and keeps the project dirty', async () => {
    const store = useProjectsStore()
    const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
    await store.open(project.id)
    main.fail('The disk is full.')

    store.current!.name = 'Alpha edited'
    store.markDirty()
    expect(await store.saveCurrent()).toBe(false)
    expect(store.lastError).toBe('The disk is full.')
    expect(store.saveState).toBe('unsaved')
  })

  it('refuses to create a second document of the same name', async () => {
    const store = useProjectsStore()
    await store.create({ name: 'Alpha', type: 'hires' })
    main.fail('"Alpha.vic20" already exists in that folder.')

    expect(await store.create({ name: 'Alpha', type: 'hires' })).toBeNull()
    expect(store.lastError).toContain('already exists')
  })

  it('has no list, and the list operations are quiet about it', async () => {
    // Rename, duplicate and delete are the file manager's job now (§4); the
    // view that offered them is not reachable in this shell.
    const store = useProjectsStore()
    const project = (await store.create({ name: 'Alpha', type: 'hires' }))!

    await store.refresh()
    expect(store.summaries).toEqual([])
    expect(await store.rename(project.id, 'Beta')).toBe(false)
    expect(await store.duplicate(project.id)).toBeNull()
    await expect(store.remove(project.id)).resolves.toBeUndefined()
    // None of it touched the file.
    expect(main.writes).toEqual([])
  })

  it('opens a document through the Open dialog', async () => {
    const project = createProject({ name: 'Title Screen', type: 'multicolor' })
    main.seed('Title Screen', serializeProject(project))

    const store = useProjectsStore()
    expect((await store.openDocument())?.id).toBe(project.id)
    expect(store.documentName).toBe('Title Screen')
  })

  it('reports where a new document would go', async () => {
    const store = useProjectsStore()
    expect(await store.defaultLocation()).toBe('/documents')
    expect(await store.chooseLocation()).toBe('/elsewhere')
  })
})
