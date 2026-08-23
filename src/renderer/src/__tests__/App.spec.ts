import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'
import { createProject } from '@/domain/factory'
import { serializeProject } from '@/domain/serialization'
import { fakeDocumentBridge, type FakeDocumentBridge } from '@/testing/documentBridge'
import { useProjectsStore } from '@/stores/projects'
import { stubApi } from '@/utils/__tests__/stubApi'

/**
 * The renderer's half of the one arrival path (PLAN.md D15).
 *
 * Main announces that a document is waiting; this component is what turns that
 * into "the editor is showing it". It is also where a file dropped on the
 * window is handed over — the drop event is the renderer's, the path is the
 * preload's, and the two have to meet here (S5, D8).
 */

const push = vi.fn<(to: string) => void>()
const currentRoute = { value: { path: '/', params: {} as Record<string, unknown> } }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace: push, currentRoute }),
  RouterView: { template: '<div />' },
}))

let main: FakeDocumentBridge

beforeEach(() => {
  // jsdom has no showModal(); the conflict dialog only needs it not to throw.
  HTMLDialogElement.prototype.showModal = vi.fn<() => void>()
  HTMLDialogElement.prototype.close = vi.fn<() => void>()
  push.mockClear()
  currentRoute.value = { path: '/', params: {} }
  main = fakeDocumentBridge()
  vi.stubGlobal('api', stubApi({ document: main.api }))
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App, on the desktop', () => {
  it('opens a document that arrives, whichever way it came', async () => {
    const project = createProject({ name: 'Title Screen', type: 'hires' })
    mount(App)
    await flushPromises()

    // A double-click, a drop, Open Recent or the Open dialog: main announces,
    // and only then is the document adopted.
    main.arrive('Title Screen', serializeProject(project))
    await flushPromises()

    expect(push).toHaveBeenCalledWith(`/edit/${project.id}`)
  })

  it('stays where it is when the document that arrived is the one on screen', async () => {
    const project = createProject({ name: 'Title Screen', type: 'hires' })
    currentRoute.value = { path: `/edit/${project.id}`, params: { projectId: project.id } }
    mount(App)
    await flushPromises()

    main.arrive('Title Screen', serializeProject(project))
    await flushPromises()

    expect(push).not.toHaveBeenCalled()
  })

  it('says why one that would not open did not, and navigates nowhere', async () => {
    mount(App)
    await flushPromises()

    main.arrive('Broken', '{ "not": "a project" }')
    await flushPromises()

    expect(push).not.toHaveBeenCalled()
  })

  it('hands a dropped file to the bridge, and never derives a path itself (S5)', async () => {
    const dropped = vi.fn<(file: File) => void>()
    vi.stubGlobal('api', stubApi({ document: { ...main.api, dropped } }))
    mount(App)
    await flushPromises()

    const file = new File(['{}'], 'Title Screen.vic20')
    const event = new Event('drop') as DragEvent
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } })
    window.dispatchEvent(event)

    expect(dropped).toHaveBeenCalledWith(file)
  })

  it('cancels dragover, or the window navigates to the file instead of opening it', () => {
    mount(App)
    const event = new Event('dragover', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  /**
   * The other announcement this component listens for (PLAN.md D7): not "a
   * document is waiting" but "the one you have moved".
   */
  describe('when the open document changes on disk', () => {
    /** A document open and settled, the way a session actually starts. */
    async function opened(name = 'Title Screen') {
      const project = createProject({ name, type: 'hires' })
      const wrapper = mount(App)
      await flushPromises()
      main.arrive(name, serializeProject(project))
      await flushPromises()
      currentRoute.value = { path: `/edit/${project.id}`, params: { projectId: project.id } }
      push.mockClear()
      return { wrapper, project, store: useProjectsStore() }
    }

    it('takes the file in place when nothing here is unsaved', async () => {
      const { store } = await opened()
      const theirs = createProject({ name: 'From the branch', type: 'hires' })

      main.changeOnDisk(serializeProject(theirs))
      await flushPromises()

      expect(store.current?.id).toBe(theirs.id)
      expect(store.documentConflict).toBeNull()
      // A branch can hold a different document at the same path, and the route
      // is named after the project rather than the file (D9).
      expect(push).toHaveBeenCalledWith(`/edit/${theirs.id}`)
    })

    it('asks first when there is an unsaved edit, and names both sides', async () => {
      const { wrapper, store } = await opened()
      store.current!.name = 'Title Screen edited'
      store.markDirty()

      main.changeOnDisk(serializeProject(createProject({ name: 'From the branch', type: 'hires' })))
      await flushPromises()

      expect(store.documentConflict).toBe('modified')
      expect(push).not.toHaveBeenCalled()
      expect(vi.mocked(HTMLDialogElement.prototype.showModal)).toHaveBeenCalled()
      const text = wrapper.text()
      expect(text).toContain('changed on disk')
      expect(text).toContain('Reloading discards them')
      expect(text).toContain('Reload from Disk')
      expect(text).toContain('Keep My Version')
    })

    it('says a document that is gone is gone, and offers to put it back', async () => {
      const { wrapper, store } = await opened()

      main.deleteOnDisk()
      await flushPromises()

      expect(store.documentConflict).toBe('deleted')
      expect(wrapper.text()).toContain('no longer on disk')
      expect(wrapper.text()).toContain('Save It Again')
    })

    it('asks nothing at all while the file is where it was', async () => {
      await opened()
      // The dialog is mounted like every other one here; what matters is that
      // it never opens over a document nobody has disturbed.
      expect(vi.mocked(HTMLDialogElement.prototype.showModal)).not.toHaveBeenCalled()
    })
  })
})
