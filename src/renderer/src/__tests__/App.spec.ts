import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'
import { createProject } from '@/domain/factory'
import { serializeProject } from '@/domain/serialization'
import { fakeDocumentBridge, type FakeDocumentBridge } from '@/testing/documentBridge'
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
})
