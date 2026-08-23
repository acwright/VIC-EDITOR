import { describe, expect, it } from 'vitest'
import { createProject } from '@/domain/factory'
import { PROJECT_TYPES } from '@/domain/modes'
import { ProjectValidationError, serializeProject } from '@/domain/serialization'
import { createDocumentStore } from '../documentStore'
import { DocumentError } from '../store'
import { describeProjectStore } from './storeContract'
import type { AppApi } from '@shared/api'
import type { DocumentResult, OpenDocument } from '@shared/document'

const TYPE = PROJECT_TYPES[0]!

/**
 * A stand-in for the main process: one document, held in memory.
 *
 * It is the *bridge* that is faked, not the adapter — everything the adapter
 * does (serialize, unwrap, check the id) runs for real. What the fake supplies
 * is main's half of D8: it names the file, and the adapter never sees a path.
 */
function fakeBridge(initial: { name?: string; text?: string } | null = null) {
  let document: OpenDocument | null = initial
    ? {
        path: `/documents/${initial.name ?? 'Alpha'}.vic20`,
        name: initial.name ?? 'Alpha',
        text: initial.text ?? '',
        stamp: { mtimeMs: 1, size: (initial.text ?? '').length },
      }
    : null
  let location = '/documents'
  /** Set to a sentence to make the next call fail the way a full disk would. */
  let failure: string | null = null
  const writes: string[] = []

  function ok<T>(value: T): DocumentResult<T> {
    return { status: 'ok', value }
  }

  function put(name: string, text: string): OpenDocument {
    document = {
      path: `${location}/${name}.vic20`,
      name,
      text,
      stamp: { mtimeMs: Date.now(), size: text.length },
    }
    return document
  }

  const api: AppApi['document'] = {
    async create({ name, text }) {
      if (failure) return { status: 'error', reason: failure }
      return ok(put(name, text))
    },
    async open() {
      if (failure) return { status: 'error', reason: failure }
      return document ? ok(document) : { status: 'none' }
    },
    async current() {
      if (failure) return { status: 'error', reason: failure }
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
      return location
    },
    async chooseLocation() {
      location = '/elsewhere'
      return location
    },
  }

  return {
    api,
    writes,
    get document() {
      return document
    },
    fail(reason: string) {
      failure = reason
    },
  }
}

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
    fakeBridge({ text: serializeProject(createProject({ name: 'Placeholder', type: TYPE })) }).api,
  ),
)

describe('documentStore', () => {
  it('is the document kind', () => {
    expect(createDocumentStore(fakeBridge().api).kind).toBe('document')
  })

  it('creates a document and remembers what the file is called', async () => {
    const bridge = fakeBridge()
    const store = createDocumentStore(bridge.api)
    expect(store.name).toBeNull()

    const project = createProject({ name: 'Star Voyager', type: TYPE })
    const created = await store.createDocument(project)

    expect(created).toEqual(project)
    expect(store.name).toBe('Star Voyager')
    // Main derived the filename; the adapter handed over a name and bytes (D8).
    expect(bridge.document?.path).toBe('/documents/Star Voyager.vic20')
  })

  it('writes the git-first serialization, not compact JSON (D4)', async () => {
    const bridge = fakeBridge()
    const store = createDocumentStore(bridge.api)
    const project = createProject({ name: 'Alpha', type: TYPE })

    await store.createDocument(project)
    await store.save(project)

    expect(bridge.writes).toEqual([serializeProject(project)])
  })

  it('loads the open document when the route names it', async () => {
    const bridge = fakeBridge()
    const store = createDocumentStore(bridge.api)
    const project = createProject({ name: 'Alpha', type: TYPE })
    await store.createDocument(project)

    expect(await store.load(project.id)).toEqual(project)
  })

  it('answers null when the route names something else', async () => {
    // A stale deep link, or a reload after the document was closed. There is no
    // second document to look in — main has one open (D9).
    const bridge = fakeBridge()
    const store = createDocumentStore(bridge.api)
    await store.createDocument(createProject({ name: 'Alpha', type: TYPE }))

    expect(await store.load(crypto.randomUUID())).toBeNull()
  })

  it('answers null, and forgets the name, when nothing is open', async () => {
    const bridge = fakeBridge()
    const store = createDocumentStore(bridge.api)
    await store.createDocument(createProject({ name: 'Alpha', type: TYPE }))
    await store.closeDocument()

    expect(store.name).toBeNull()
    expect(await store.load('anything')).toBeNull()
  })

  it('opens a document that is already there', async () => {
    const project = createProject({ name: 'Alpha', type: TYPE })
    const bridge = fakeBridge({ name: 'Star Voyager', text: serializeProject(project) })
    const store = createDocumentStore(bridge.api)

    expect(await store.openDocument()).toEqual(project)
    expect(store.name).toBe('Star Voyager')
  })

  it('reports a cancelled Open as nothing happening', async () => {
    const store = createDocumentStore(fakeBridge().api)
    expect(await store.openDocument()).toBeNull()
    expect(store.name).toBeNull()
  })

  it('throws DocumentError carrying main’s own sentence', async () => {
    const bridge = fakeBridge()
    bridge.fail('The disk is full.')
    const store = createDocumentStore(bridge.api)

    await expect(store.save(createProject({ name: 'Alpha', type: TYPE }))).rejects.toThrow(
      DocumentError,
    )
    await expect(store.openDocument()).rejects.toThrow('The disk is full.')
  })

  it('throws when the file is not a project, rather than opening it blank', async () => {
    const bridge = fakeBridge({ text: '{ "nope": true }' })
    const store = createDocumentStore(bridge.api)
    // ProjectValidationError says which field was wrong; the banner shows it.
    await expect(store.openDocument()).rejects.toThrow(ProjectValidationError)
  })

  it('reports where a new document would go, and where the user moved it to', async () => {
    const store = createDocumentStore(fakeBridge().api)
    expect(await store.defaultLocation()).toBe('/documents')
    expect(await store.chooseLocation()).toBe('/elsewhere')
    expect(await store.defaultLocation()).toBe('/elsewhere')
  })
})
