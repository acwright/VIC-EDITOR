import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import StartView from '../StartView.vue'
import NewProjectDialog from '@/components/projects/NewProjectDialog.vue'
import { createProject } from '@/domain/factory'
import { serializeProject } from '@/domain/serialization'
import { SAMPLES } from '@/samples'
import { useProjectsStore } from '@/stores/projects'
import type { AppApi } from '@shared/api'
import type { DocumentResult, OpenDocument } from '@shared/document'

const push = vi.fn<(to: string) => void>()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: (to: string) => push(to) }) }))

/** Main, faked far enough for the launcher to talk to it. */
function fakeMain() {
  let document: OpenDocument | null = null

  function ok<T>(value: T): DocumentResult<T> {
    return { status: 'ok', value }
  }

  const api: AppApi['document'] = {
    async create({ name, text }) {
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
    async write() {
      return { status: 'error', reason: 'not used' }
    },
    async close() {
      document = null
    },
    async reveal() {},
    async defaultLocation() {
      return '/Users/acwright/Documents'
    },
    async chooseLocation() {
      return '/Volumes/Work/charsets'
    },
  }

  return {
    api,
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
  }
}

let main: ReturnType<typeof fakeMain>

function mountView() {
  const errors: unknown[] = []
  const wrapper = mount(StartView, {
    global: { config: { errorHandler: (error: unknown) => errors.push(error) } },
  })
  return { wrapper, errors }
}

beforeEach(() => {
  push.mockClear()
  main = fakeMain()
  vi.stubGlobal('api', {
    document: main.api,
    // The view reports what it offers as it mounts, and subscribes to the
    // native menu; neither is what this spec is about, but both have to be there.
    menu: { setContext: vi.fn<() => void>(), onAction: () => () => {} },
  } satisfies Partial<AppApi>)
  setActivePinia(createPinia())
  HTMLDialogElement.prototype.showModal = vi.fn<() => void>()
  HTMLDialogElement.prototype.close = vi.fn<() => void>()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('StartView', () => {
  it('mounts every child without one of them throwing', async () => {
    const { errors } = mountView()
    await flushPromises()
    expect(errors).toEqual([])
  })

  // D12: it is a launcher, not a manager. It cannot list "your projects",
  // because the app no longer knows what those are — so it does not ask, and
  // it does not stand an empty list in the place where one would be.
  it('lists no projects, because the app has none to list', async () => {
    const { wrapper } = mountView()
    await flushPromises()
    expect(useProjectsStore().summaries).toEqual([])
    expect(wrapper.text()).not.toContain('No projects yet')
    expect(wrapper.text()).toContain('New Project…')
    expect(wrapper.text()).toContain('Open…')
  })

  it('offers a card per bundled sample', () => {
    const grid = mountView().wrapper.get('[aria-label="Sample projects"]')
    expect(grid.findAll('button')).toHaveLength(SAMPLES.length)
  })

  it('shows where a new document would go, and lets it be moved (D10)', async () => {
    const { wrapper } = mountView()
    const dialog = wrapper.getComponent(NewProjectDialog)

    await wrapper.findAll('button')[0]!.trigger('click')
    await flushPromises()
    expect(dialog.props('location')).toBe('/Users/acwright/Documents')

    dialog.vm.$emit('chooseLocation')
    await flushPromises()
    expect(dialog.props('location')).toBe('/Volumes/Work/charsets')
  })

  it('creates a document and goes to the editor', async () => {
    const { wrapper } = mountView()
    wrapper.getComponent(NewProjectDialog).vm.$emit('create', {
      name: 'Title Screen',
      type: 'hires',
    })
    await flushPromises()

    expect(main.document?.path).toBe('/documents/Title Screen.vic20')
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/edit\//))
  })

  // *New from Sample…* asks the same two questions as *New…*, so a sample
  // never lands in a folder nobody chose.
  it('routes a sample through the same dialog, named and located', async () => {
    const { wrapper } = mountView()
    const sample = SAMPLES[0]!
    const grid = wrapper.get('[aria-label="Sample projects"]')

    await grid.findAll('button')[0]!.trigger('click')
    await flushPromises()

    const dialog = wrapper.getComponent(NewProjectDialog)
    expect(dialog.props('sample')).toEqual(sample)
    expect(dialog.props('location')).toBe('/Users/acwright/Documents')

    dialog.vm.$emit('create', { name: 'My Copy', type: 'hires' })
    await flushPromises()
    // The sample's own mode, under the name the dialog collected.
    expect(main.document?.name).toBe('My Copy')
    expect(main.document?.text).toContain('"type": "' + sample.build().type + '"')
  })

  it('opens an existing document and goes to the editor', async () => {
    const project = createProject({ name: 'Title Screen', type: 'hires' })
    main.seed('Title Screen', serializeProject(project))
    const { wrapper } = mountView()

    await wrapper.findAll('button')[1]!.trigger('click')
    await flushPromises()
    expect(push).toHaveBeenCalledWith(`/edit/${project.id}`)
  })

  it('says why an unreadable document did not open, and stays put', async () => {
    main.seed('Broken', '{ "not": "a project" }')
    const { wrapper } = mountView()

    await wrapper.findAll('button')[1]!.trigger('click')
    await flushPromises()
    expect(push).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toBeTruthy()
  })
})
