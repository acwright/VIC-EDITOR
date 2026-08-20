import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import EditorView from '../EditorView.vue'
import HelpDialog from '@/components/HelpDialog.vue'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'
import { StorageQuotaError } from '@/persistence/repository'

const push = vi.fn<(to: string) => void>()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

/**
 * Phase 11's keyboard map, driven through the window listener the view
 * installs. The point of these is the wiring: `utils/shortcuts.ts` decides
 * which key means what, and `shortcuts.spec.ts` checks that; here we check
 * that the meaning reaches the store.
 */
function setup(type: 'hires' | 'multicolor' | 'mixed' = 'hires') {
  localStorage.clear()
  setActivePinia(createPinia())
  const projects = useProjectsStore()
  const editor = useEditorStore()
  const project = projects.create({ name: 'Test', seed: 'blank', type })!
  const wrapper = mount(EditorView, { props: { projectId: project.id } })
  return { wrapper, projects, editor }
}

/** A key press on the document, as a real one would arrive. */
function press(key: string, modifiers: Partial<KeyboardEventInit> = {}) {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...modifiers }))
}

beforeEach(() => {
  push.mockClear()
  // jsdom has neither: the screen panel measures with one, dialogs use the other
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  HTMLDialogElement.prototype.showModal = vi.fn<() => void>()
  HTMLDialogElement.prototype.close = vi.fn<() => void>()
})

describe('EditorView shortcuts', () => {
  it('walks the character set with the brackets', () => {
    const { editor } = setup()
    press(']')
    press(']')
    expect(editor.selectedChar).toBe(2)
    press('[')
    expect(editor.selectedChar).toBe(1)
  })

  it('picks the brush mode from the digit row', () => {
    const { editor } = setup()
    press('2')
    expect(editor.brushMode).toBe('color')
    press('3')
    expect(editor.brushMode).toBe('both')
    press('1')
    expect(editor.brushMode).toBe('char')
  })

  it('targets a color slot from the digit row (Phase 11)', () => {
    const { editor } = setup('multicolor')
    press('5')
    expect(editor.targetSlot).toBe('border')
    press('7')
    expect(editor.targetSlot).toBe('aux')
    press('6')
    expect(editor.targetSlot).toBe('fg')
  })

  it('transforms the character, and undoes it as one entry', () => {
    const { editor } = setup()
    press('f') // fill
    expect(editor.currentPattern?.every((byte) => byte === 0xff)).toBe(true)
    press('z', { ctrlKey: true })
    expect(editor.currentPattern?.every((byte) => byte === 0)).toBe(true)
    press('z', { ctrlKey: true, shiftKey: true })
    expect(editor.currentPattern?.every((byte) => byte === 0xff)).toBe(true)
  })

  it('leaves the map alone while a text field has focus', () => {
    const { editor } = setup()
    const input = document.createElement('input')
    document.body.append(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
    expect(editor.currentPattern?.every((byte) => byte === 0)).toBe(true)
    input.remove()
  })

  it('zooms and toggles the grid and the aspect correction', () => {
    const { editor } = setup()
    const before = editor.screenScale
    press('+')
    expect(editor.screenScale).toBe(before + 1)
    press('-')
    expect(editor.screenScale).toBe(before)
    const grid = editor.showGrid
    press('g')
    expect(editor.showGrid).toBe(!grid)
    press('a')
    expect(editor.aspectCorrected).toBe(false)
  })

  it('opens the help dialog on ?, listing the whole map', async () => {
    const { wrapper } = setup()
    const help = wrapper.getComponent(HelpDialog)
    expect(help.props('modelValue')).toBe(false)

    press('?', { shiftKey: true })
    await flushPromises()
    expect(help.props('modelValue')).toBe(true)

    // Every section of the map is in it, including the keys the canvases own
    const text = help.text()
    expect(text).toContain('Target the auxiliary color')
    expect(text).toContain('Canvas cursor')
    expect(text).toContain('Paint the cursor cell')
  })

  it('opens the same dialog from the header, for pointers with no keyboard', async () => {
    const { wrapper } = setup()
    await wrapper.get('button[aria-label="Keyboard Shortcuts"]').trigger('click')
    expect(wrapper.getComponent(HelpDialog).props('modelValue')).toBe(true)
  })

  it('goes back to the project list on Escape', () => {
    setup()
    press('Escape')
    expect(push).toHaveBeenCalledWith('/')
  })
})

describe('EditorView error states', () => {
  it('shows a failed save rather than sitting on "Unsaved"', async () => {
    const { wrapper, projects, editor } = setup()
    // Fill the store: every write from here on throws, as a real quota does
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    editor.applyTransform('fill')
    projects.saveCurrent()
    await flushPromises()

    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toContain(new StorageQuotaError().message)
    expect(wrapper.text()).toContain('Unsaved')

    // Dismissing clears the banner but not the unsaved state
    setItem.mockRestore()
    await alert.get('button[aria-label="Dismiss"]').trigger('click')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

/**
 * Phase 11 re-verifies the collapse the app inherited: below `lg` the two
 * columns are two tabs, and only the selected one is in the flow. The classes
 * are the mechanism, so they are what the test reads.
 */
describe('EditorView responsive layout', () => {
  /** The two panel wrappers, in document order: character column, screen column. */
  function columns(wrapper: ReturnType<typeof setup>['wrapper']) {
    return {
      character: wrapper.get('aside'),
      screen: wrapper.get('aside + div'),
    }
  }

  it('shows one column at a time on a phone, both at lg', async () => {
    const { wrapper } = setup()
    const { character, screen } = columns(wrapper)

    // Character first, and each column is laid out side by side from lg up
    expect(character.classes()).toContain('flex')
    expect(character.classes()).toContain('lg:flex')
    expect(screen.classes()).toContain('hidden')
    expect(screen.classes()).toContain('lg:flex')

    const tabs = wrapper.findAll('[role="tablist"] [role="tab"]')
    expect(tabs.map((tab) => tab.text())).toEqual(['Character', 'Screen'])
    expect(tabs[0]!.attributes('aria-selected')).toBe('true')
    await tabs[1]!.trigger('click')

    expect(columns(wrapper).character.classes()).toContain('hidden')
    expect(columns(wrapper).screen.classes()).toContain('flex')
  })
})
