import { describe, expect, it } from 'vitest'
import { createProject } from '@/domain/factory'
import { PROJECT_TYPES } from '@/domain/modes'
import { ProjectValidationError, serializeProject } from '@/domain/serialization'
import { fakeDocumentBridge } from '@/testing/documentBridge'
import { createDocumentStore } from '../documentStore'
import { DocumentConflictError, DocumentError } from '../store'
import { describeProjectStore } from './storeContract'

const TYPE = PROJECT_TYPES[0]!

// The port's own suite, run against the document adapter. `browserStore.spec.ts`
// runs the same one (PLAN.md D1) — which is the point of having written it
// against the port rather than against localStorage.
//
// It starts with a document open, because that is the one precondition the two
// adapters do not share: `save` writes to whatever main has open, and with
// nothing open main refuses rather than inventing a file (D8). The editor never
// reaches `save` in that state either — it has a document or it has the start
// screen.
describeProjectStore('documentStore', () =>
  createDocumentStore(
    fakeDocumentBridge({
      text: serializeProject(createProject({ name: 'Placeholder', type: TYPE })),
    }).api,
  ),
)

describe('documentStore', () => {
  it('is the document kind', () => {
    expect(createDocumentStore(fakeDocumentBridge().api).kind).toBe('document')
  })

  it('creates a document and remembers what the file is called', async () => {
    const bridge = fakeDocumentBridge()
    const store = createDocumentStore(bridge.api)
    expect(store.name).toBeNull()

    const project = createProject({ name: 'Title Screen', type: TYPE })
    const created = await store.createDocument(project)

    expect(created).toEqual(project)
    expect(store.name).toBe('Title Screen')
    // Main derived the filename; the adapter handed over a name and bytes (D8).
    expect(bridge.document?.path).toBe('/documents/Title Screen.vic20')
  })

  it('writes the git-first serialization, not compact JSON (D4)', async () => {
    const bridge = fakeDocumentBridge()
    const store = createDocumentStore(bridge.api)
    const project = createProject({ name: 'Alpha', type: TYPE })

    await store.createDocument(project)
    await store.save(project)

    expect(bridge.writes).toEqual([serializeProject(project)])
  })

  it('loads the open document when the route names it', async () => {
    const bridge = fakeDocumentBridge()
    const store = createDocumentStore(bridge.api)
    const project = createProject({ name: 'Alpha', type: TYPE })
    await store.createDocument(project)

    expect(await store.load(project.id)).toEqual(project)
  })

  it('answers null when the route names something else', async () => {
    // A stale deep link, or a reload after the document was closed. There is no
    // second document to look in — main has one open (D9).
    const bridge = fakeDocumentBridge()
    const store = createDocumentStore(bridge.api)
    await store.createDocument(createProject({ name: 'Alpha', type: TYPE }))

    expect(await store.load(crypto.randomUUID())).toBeNull()
  })

  it('answers null, and forgets the name, when nothing is open', async () => {
    const bridge = fakeDocumentBridge()
    const store = createDocumentStore(bridge.api)
    await store.createDocument(createProject({ name: 'Alpha', type: TYPE }))
    await store.closeDocument()

    expect(store.name).toBeNull()
    expect(await store.load('anything')).toBeNull()
  })

  it('takes a document that has arrived, whichever way it came (D15)', async () => {
    const project = createProject({ name: 'Alpha', type: TYPE })
    const bridge = fakeDocumentBridge()
    const store = createDocumentStore(bridge.api)

    // A double-click, a drop, Open Recent and the Open dialog all end here.
    bridge.arrive('Title Screen', serializeProject(project))

    expect(await store.takePending()).toEqual(project)
    expect(store.name).toBe('Title Screen')
  })

  it('answers null, and touches nothing, when no document is waiting', async () => {
    // What a launch with nothing to reopen answers, and what a cancelled Open
    // dialog leaves behind (D11, D15).
    const bridge = fakeDocumentBridge()
    const store = createDocumentStore(bridge.api)
    await store.requestOpen()

    expect(await store.takePending()).toBeNull()
    expect(store.name).toBeNull()
  })

  it('opens what the Open dialog picked, through the same arrival path', async () => {
    const project = createProject({ name: 'Alpha', type: TYPE })
    const bridge = fakeDocumentBridge()
    const store = createDocumentStore(bridge.api)
    bridge.stage('Title Screen', serializeProject(project))

    // The dialog answers with nothing; the document is waiting afterwards.
    await expect(store.requestOpen()).resolves.toBeUndefined()
    expect(await store.takePending()).toEqual(project)
  })

  it('opens a recent document by the id it was given, never by a path (D8, D16)', async () => {
    const project = createProject({ name: 'Alpha', type: TYPE })
    const bridge = fakeDocumentBridge({ name: 'Title Screen', text: serializeProject(project) })
    const store = createDocumentStore(bridge.api)

    const [entry] = await store.recent()
    expect(entry).toMatchObject({ name: 'Title Screen', directory: '/documents' })
    await store.openRecent(entry!.id)

    expect(await store.takePending()).toEqual(project)
  })

  it('throws DocumentError carrying main’s own sentence', async () => {
    const bridge = fakeDocumentBridge()
    bridge.fail('The disk is full.')
    const store = createDocumentStore(bridge.api)

    await expect(store.save(createProject({ name: 'Alpha', type: TYPE }))).rejects.toThrow(
      DocumentError,
    )
    bridge.arrive('Title Screen', '{}')
    await expect(store.takePending()).rejects.toThrow('The disk is full.')
  })

  it('throws when the file is not a project, rather than opening it blank', async () => {
    const bridge = fakeDocumentBridge()
    const store = createDocumentStore(bridge.api)
    bridge.arrive('Broken', '{ "nope": true }')
    // ProjectValidationError says which field was wrong; the banner shows it.
    await expect(store.takePending()).rejects.toThrow(ProjectValidationError)
  })

  // --- The file changing underneath us (PLAN.md D6, D7) ---

  it('refuses a save when the file is no longer the one it read', async () => {
    const bridge = fakeDocumentBridge()
    const store = createDocumentStore(bridge.api)
    const project = createProject({ name: 'Alpha', type: TYPE })
    await store.createDocument(project)

    // A branch switch, or another program writing to it.
    bridge.changeOnDisk(serializeProject(createProject({ name: 'From the branch', type: TYPE })))

    project.name = 'Alpha edited'
    await expect(store.save(project)).rejects.toThrow(DocumentConflictError)
    // The refusal is the point: the checkout is still on disk, whole.
    expect(bridge.document?.text).toContain('From the branch')
  })

  it('refuses a save to a file that is gone, rather than recreating it', async () => {
    const bridge = fakeDocumentBridge()
    const store = createDocumentStore(bridge.api)
    const project = createProject({ name: 'Alpha', type: TYPE })
    await store.createDocument(project)
    bridge.deleteOnDisk()

    project.name = 'Alpha edited'
    await expect(store.save(project)).rejects.toMatchObject({ change: 'deleted' })
    expect(bridge.document?.text).toBe('')
  })

  it('takes the file when told to reload, and can save again afterwards', async () => {
    const bridge = fakeDocumentBridge()
    const store = createDocumentStore(bridge.api)
    const mine = createProject({ name: 'Alpha', type: TYPE })
    await store.createDocument(mine)

    const theirs = createProject({ name: 'From the branch', type: TYPE })
    bridge.changeOnDisk(serializeProject(theirs))

    expect(await store.reloadDocument()).toEqual(theirs)
    // Reloading is also what clears the conflict: the adapter has read what is
    // there now, so the next ordinary save is no longer refused.
    theirs.name = 'Edited after the reload'
    await expect(store.save(theirs)).resolves.toBeUndefined()
  })

  it('overwrites the file when told to keep this version', async () => {
    const bridge = fakeDocumentBridge()
    const store = createDocumentStore(bridge.api)
    const mine = createProject({ name: 'Alpha', type: TYPE })
    await store.createDocument(mine)
    bridge.changeOnDisk(serializeProject(createProject({ name: 'From the branch', type: TYPE })))

    mine.name = 'Alpha edited'
    await expect(store.overwrite(mine)).resolves.toBeUndefined()
    expect(bridge.document?.text).toBe(serializeProject(mine))
    // And the conflict is over: an ordinary save goes through.
    await expect(store.save(mine)).resolves.toBeUndefined()
  })

  it('puts back a document that was deleted, when told to', async () => {
    const bridge = fakeDocumentBridge()
    const store = createDocumentStore(bridge.api)
    const project = createProject({ name: 'Alpha', type: TYPE })
    await store.createDocument(project)
    bridge.deleteOnDisk()

    await expect(store.overwrite(project)).resolves.toBeUndefined()
    expect(bridge.document?.text).toBe(serializeProject(project))
  })

  it('reports where a new document would go, and where the user moved it to', async () => {
    const store = createDocumentStore(fakeDocumentBridge().api)
    expect(await store.defaultLocation()).toBe('/documents')
    expect(await store.chooseLocation()).toBe('/elsewhere')
    expect(await store.defaultLocation()).toBe('/elsewhere')
  })
})
