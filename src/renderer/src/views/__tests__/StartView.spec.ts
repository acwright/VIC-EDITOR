import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import StartView from '../StartView.vue'
import MigrationDialog from '@/components/projects/MigrationDialog.vue'
import NewProjectDialog from '@/components/projects/NewProjectDialog.vue'
import { createProject } from '@/domain/factory'
import { serializeProject } from '@/domain/serialization'
import { SAMPLES } from '@/samples'
import { useProjectsStore } from '@/stores/projects'
import { createRepository } from '@/persistence/repository'
import { fakeDocumentBridge, type FakeDocumentBridge } from '@/testing/documentBridge'
import { fakeMigrationBridge, type FakeMigrationBridge } from '@/testing/migrationBridge'
import type { AppApi } from '@shared/api'

const push = vi.fn<(to: string) => void>()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: (to: string) => push(to) }) }))

let main: FakeDocumentBridge
let migration: FakeMigrationBridge

function mountView() {
  const errors: unknown[] = []
  const wrapper = mount(StartView, {
    global: { config: { errorHandler: (error: unknown) => errors.push(error) } },
  })
  return { wrapper, errors }
}

beforeEach(() => {
  push.mockClear()
  main = fakeDocumentBridge()
  migration = fakeMigrationBridge()
  localStorage.clear()
  vi.stubGlobal('api', {
    document: main.api,
    migration: migration.api,
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
    expect(dialog.props('location')).toBe('/documents')

    dialog.vm.$emit('chooseLocation')
    await flushPromises()
    expect(dialog.props('location')).toBe('/elsewhere')
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
    expect(dialog.props('location')).toBe('/documents')

    dialog.vm.$emit('create', { name: 'My Copy', type: 'hires' })
    await flushPromises()
    // The sample's own mode, under the name the dialog collected.
    expect(main.document?.name).toBe('My Copy')
    expect(main.document?.text).toContain('"type": "' + sample.build().type + '"')
  })

  // *Open…* asks main for a document and is answered with nothing: what the
  // dialog picked arrives the same way a double-click does, and `App.vue` is
  // what routes to it (D15). So what this view is responsible for is the ask.
  it('asks for a document rather than opening one itself', async () => {
    const project = createProject({ name: 'Title Screen', type: 'hires' })
    main.stage('Title Screen', serializeProject(project))
    const { wrapper } = mountView()

    await wrapper.findAll('button')[1]!.trigger('click')
    await flushPromises()

    expect(push).not.toHaveBeenCalled()
    // The document is waiting, which is the whole of what the click had to do.
    expect(await main.api.takePending()).toMatchObject({ status: 'ok' })
  })

  // D16: recents are the primary navigation here, since there is no list.
  it('lists recent documents, and asks for one by its opaque id', async () => {
    const project = createProject({ name: 'Title Screen', type: 'hires' })
    main.seed('Title Screen', serializeProject(project))
    const { wrapper } = mountView()
    await flushPromises()

    const list = wrapper.get('[aria-label="Recent documents"]')
    expect(list.text()).toContain('Title Screen')
    expect(list.text()).toContain('/documents')

    await list.findAll('button')[0]!.trigger('click')
    await flushPromises()
    expect(await main.api.takePending()).toMatchObject({ status: 'ok' })
  })

  it('shows no recents section at all when there are none', async () => {
    const { wrapper } = mountView()
    await flushPromises()
    expect(wrapper.find('[aria-label="Recent documents"]').exists()).toBe(false)
  })

  // D19: the first `v2.0` launch of a `v1.6` profile. It lands here because a
  // profile that never had documents has none to reopen.
  it('offers to copy what is in browser storage, and never moves it', async () => {
    const repository = createRepository()
    const project = createProject({ name: 'Star Voyager', type: 'hires' })
    repository.save(project)

    const { wrapper } = mountView()
    await flushPromises()

    const sheet = wrapper.getComponent(MigrationDialog)
    expect(sheet.props('plan')!.documents.map((document) => document.name)).toEqual([
      'Star Voyager',
    ])
    expect(sheet.props('folder')).toBe('~/Documents/VIC-20 Editor')

    sheet.vm.$emit('copy')
    await flushPromises()

    expect(migration.files.get('Star Voyager.vic20')).toContain('Star Voyager')
    // The original is still in browser storage until it is asked for (D19).
    expect(repository.load(project.id)).not.toBeNull()

    sheet.vm.$emit('removeCopies')
    await flushPromises()
    expect(repository.load(project.id)).toBeNull()
    expect(sheet.props('removed')).toBe(true)
  })

  it('does not offer a migration when there is nothing in browser storage', async () => {
    const { wrapper } = mountView()
    await flushPromises()
    expect(wrapper.getComponent(MigrationDialog).props('plan')).toBeNull()
  })

  it('does not offer one twice', async () => {
    createRepository().save(createProject({ name: 'Star Voyager', type: 'hires' }))
    migration.markDone()

    const { wrapper } = mountView()
    await flushPromises()
    expect(wrapper.getComponent(MigrationDialog).props('plan')).toBeNull()
  })

  it('shows why something failed, in a banner it can dismiss', async () => {
    const { wrapper } = mountView()
    useProjectsStore().lastError = 'That document could not be opened.'
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('could not be opened')
  })
})
