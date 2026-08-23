import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createProject } from '@/domain/factory'
import { serializeProject } from '@/domain/serialization'
import { fakeDocumentBridge, type FakeDocumentBridge } from '@/testing/documentBridge'
import { useProjectsStore } from '../projects'
import type { AppApi } from '@shared/api'

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

let main: FakeDocumentBridge

beforeEach(() => {
  main = fakeDocumentBridge()
  // The whole of `isDesktop()`: the preload bridge being there at all.
  vi.stubGlobal('api', { document: main.api } satisfies Partial<AppApi>)
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('projects store, on the desktop', () => {
  // *Save a Copy…* suggests a name to the save dialog (F7). For a document
  // someone renamed in Finder that is the name on screen — the file's — not
  // the project's own, which nothing has shown them since the list went away.
  it('names a copy after the open document, not the project inside it', async () => {
    const store = useProjectsStore()
    const project = createProject({ name: 'untitled', type: 'hires' })
    main.seed('Title Screen', serializeProject(project))
    await store.open(project.id)

    const payload = await store.exportProject(project.id)
    expect(payload?.filename).toBe('Title Screen.vic20')
    // And the copy is byte-identical to what the document holds (D4).
    expect(payload?.json).toBe(main.document?.text)
  })

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

  it('takes a document that arrived, and names it', async () => {
    // Every way in ends here (D15); this is the shape of all of them.
    const project = createProject({ name: 'Title Screen', type: 'hires' })
    main.arrive('Title Screen', serializeProject(project))

    const store = useProjectsStore()
    expect((await store.takePendingDocument())?.id).toBe(project.id)
    expect(store.current?.id).toBe(project.id)
    expect(store.documentName).toBe('Title Screen')
    expect(store.saveState).toBe('saved')
  })

  it('answers null when nothing is waiting, and leaves what is open alone', async () => {
    // A launch with no document to reopen (D11), and a cancelled Open dialog.
    const store = useProjectsStore()
    const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
    await store.open(project.id)

    expect(await store.takePendingDocument()).toBeNull()
    expect(store.current?.id).toBe(project.id)
  })

  it('flushes the open document into its own file before taking the next (D17)', async () => {
    vi.useFakeTimers()
    const store = useProjectsStore()
    const first = (await store.create({ name: 'Alpha', type: 'hires' }))!
    await store.open(first.id)

    // An edit inside the 500 ms autosave window — the write main would
    // otherwise perform *after* it had swapped documents.
    store.current!.name = 'Alpha edited'
    store.markDirty()

    const second = createProject({ name: 'Beta', type: 'hires' })
    main.arrive('Beta', serializeProject(second))
    expect((await store.takePendingDocument())?.id).toBe(second.id)

    // The edit went to Alpha's file, and Beta's is untouched by it.
    expect(main.writes).toHaveLength(1)
    expect(main.writes[0]).toContain('Alpha edited')
    expect(main.document?.text).toBe(serializeProject(second))
  })

  it('says why an arriving document could not be read, and keeps the open one', async () => {
    const store = useProjectsStore()
    const project = (await store.create({ name: 'Alpha', type: 'hires' }))!
    await store.open(project.id)

    main.arrive('Broken', '{ "not": "a project" }')
    expect(await store.takePendingDocument()).toBeNull()
    expect(store.lastError).toBeTruthy()
    expect(store.current?.id).toBe(project.id)
  })

  it('asks for a document rather than being answered with one', async () => {
    // The dialog and Open Recent both resolve to nothing: what they asked for
    // arrives through `takePendingDocument` (D15).
    const project = createProject({ name: 'Title Screen', type: 'hires' })
    main.stage('Title Screen', serializeProject(project))

    const store = useProjectsStore()
    await expect(store.openDocument()).resolves.toBeUndefined()
    expect((await store.takePendingDocument())?.id).toBe(project.id)
  })

  it('lists recent documents, and opens one by its id (D16)', async () => {
    const project = createProject({ name: 'Title Screen', type: 'hires' })
    main.seed('Title Screen', serializeProject(project))

    const store = useProjectsStore()
    const recent = await store.recentDocuments()
    expect(recent.map((entry) => entry.name)).toEqual(['Title Screen'])

    await store.openRecentDocument(recent[0]!.id)
    expect((await store.takePendingDocument())?.id).toBe(project.id)
  })

  it('reports where a new document would go', async () => {
    const store = useProjectsStore()
    expect(await store.defaultLocation()).toBe('/documents')
    expect(await store.chooseLocation()).toBe('/elsewhere')
  })
})

/**
 * The file changing underneath the editor (PLAN.md D7), which is the safety
 * property this round rests on: **a `git checkout` must never be eaten by a
 * debounced autosave that was already in flight.**
 *
 * Two halves, and they are deliberately different. Nothing unsaved → take the
 * file and say so quietly, because that is the branch switch doing what it was
 * asked to. Anything unsaved → ask, and write nothing until answered. Every
 * case below asserts what is *on disk* afterwards, not only what the store
 * thinks, because the version on disk is the one that would be lost.
 */
describe('the document changing on disk', () => {
  /** A document open, saved, and known to be so. */
  async function opened(name = 'Alpha') {
    const store = useProjectsStore()
    const project = (await store.create({ name, type: 'hires' }))!
    await store.open(project.id)
    return { store, project }
  }

  /** What a branch holding another version of the same file looks like. */
  function theBranchVersion(name = 'From the branch') {
    return createProject({ name, type: 'hires' })
  }

  it('reloads in place when nothing here is unsaved', async () => {
    const { store } = await opened()
    const theirs = theBranchVersion()
    main.changeOnDisk(serializeProject(theirs))

    expect((await store.documentChangedOnDisk('modified'))?.id).toBe(theirs.id)
    expect(store.current?.id).toBe(theirs.id)
    expect(store.saveState).toBe('saved')
    // Quiet: a note, not a question.
    expect(store.documentConflict).toBeNull()
    expect(store.lastNotice).toBe('Reloaded from disk.')
  })

  it('asks, and writes nothing, when there is an unsaved edit', async () => {
    vi.useFakeTimers()
    const { store } = await opened()
    store.current!.name = 'Alpha edited'
    store.markDirty()

    const theirs = theBranchVersion()
    main.changeOnDisk(serializeProject(theirs))
    expect(await store.documentChangedOnDisk('modified')).toBeNull()
    expect(store.documentConflict).toBe('modified')

    // The debounce that was in flight lands on the guard and is refused: the
    // checkout is still there, whole. This is the case the round exists for.
    await vi.advanceTimersByTimeAsync(600)
    expect(main.document?.text).toBe(serializeProject(theirs))
    expect(main.writes).toEqual([])
  })

  it('takes the file when the reload is chosen, discarding the edit', async () => {
    vi.useFakeTimers()
    const { store } = await opened()
    store.current!.name = 'Alpha edited'
    store.markDirty()
    const theirs = theBranchVersion()
    main.changeOnDisk(serializeProject(theirs))
    await store.documentChangedOnDisk('modified')

    expect((await store.reloadDocument())?.id).toBe(theirs.id)
    expect(store.current?.name).toBe('From the branch')
    expect(store.saveState).toBe('saved')
    expect(store.documentConflict).toBeNull()

    // The discarded edit had a write scheduled. It must not arrive afterwards.
    await vi.advanceTimersByTimeAsync(600)
    expect(main.document?.text).toBe(serializeProject(theirs))
  })

  it('overwrites the file when this version is kept', async () => {
    const { store } = await opened()
    store.current!.name = 'Alpha edited'
    store.markDirty()
    main.changeOnDisk(serializeProject(theBranchVersion()))
    await store.documentChangedOnDisk('modified')

    expect(await store.overwriteDocument()).toBe(true)
    expect(main.document?.text).toContain('Alpha edited')
    expect(store.saveState).toBe('saved')
    expect(store.documentConflict).toBeNull()
  })

  it('says why saving stopped when the question is waved away, and does not ask twice', async () => {
    vi.useFakeTimers()
    const { store } = await opened()
    store.current!.name = 'Alpha edited'
    store.markDirty()
    main.changeOnDisk(serializeProject(theBranchVersion()))
    await store.documentChangedOnDisk('modified')

    store.dismissConflict()
    expect(store.documentConflict).toBeNull()
    expect(store.lastError).toContain('Saving is paused')
    expect(store.saveState).toBe('unsaved')

    // Editing on carries on being refused — but the dialog does not come back
    // every 500 ms to say so.
    store.current!.name = 'Alpha edited again'
    store.markDirty()
    await vi.advanceTimersByTimeAsync(600)
    expect(store.documentConflict).toBeNull()
    expect(store.lastError).toContain('Saving is paused')
    expect(main.writes).toEqual([])
  })

  it('asks again when the file changes a second time', async () => {
    const { store } = await opened()
    store.current!.name = 'Alpha edited'
    store.markDirty()
    main.changeOnDisk(serializeProject(theBranchVersion('Branch A')))
    await store.documentChangedOnDisk('modified')
    store.dismissConflict()

    main.changeOnDisk(serializeProject(theBranchVersion('Branch B')))
    await store.documentChangedOnDisk('modified')
    expect(store.documentConflict).toBe('modified')
  })

  it('says a deleted document is gone rather than recreating it', async () => {
    vi.useFakeTimers()
    const { store } = await opened()
    main.deleteOnDisk()

    // Even with nothing unsaved: there is nothing to reload, and putting the
    // file back is a decision only the user can take.
    expect(await store.documentChangedOnDisk('deleted')).toBeNull()
    expect(store.documentConflict).toBe('deleted')

    store.current!.name = 'Alpha edited'
    store.markDirty()
    await vi.advanceTimersByTimeAsync(600)
    expect(main.document?.text).toBe('')
    expect(main.writes).toEqual([])
  })

  it('puts a deleted document back when that is what is asked for', async () => {
    const { store, project } = await opened()
    main.deleteOnDisk()
    await store.documentChangedOnDisk('deleted')

    expect(await store.overwriteDocument()).toBe(true)
    expect(main.document?.text).toContain(project.name)
    expect(store.documentConflict).toBeNull()
  })

  it('raises the conflict from a refused save, even before it was announced', async () => {
    // The watcher and the focus check can both be beaten by a save that was
    // already on its way; the guard is what actually stops it (D6).
    const { store } = await opened()
    main.changeOnDisk(serializeProject(theBranchVersion()))

    store.current!.name = 'Alpha edited'
    expect(await store.saveCurrent()).toBe(false)
    expect(store.documentConflict).toBe('modified')
    expect(store.saveState).toBe('unsaved')
  })

  it('leaves the question behind when another document is opened', async () => {
    const { store } = await opened()
    store.current!.name = 'Alpha edited'
    store.markDirty()
    main.changeOnDisk(serializeProject(theBranchVersion()))
    await store.documentChangedOnDisk('modified')

    const second = createProject({ name: 'Beta', type: 'hires' })
    main.arrive('Beta', serializeProject(second))
    expect((await store.takePendingDocument())?.id).toBe(second.id)
    expect(store.documentConflict).toBeNull()
  })

  it('ignores an announcement when no document is open', async () => {
    const store = useProjectsStore()
    expect(await store.documentChangedOnDisk('modified')).toBeNull()
    expect(store.documentConflict).toBeNull()
  })
})
