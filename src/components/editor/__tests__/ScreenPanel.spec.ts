import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'
import ScreenPanel from '../ScreenPanel.vue'

/**
 * The brush-mode control and the two actions that follow it (PLAN.md D7):
 * filling in Color mode is a recolor pass, not a wipe of the drawing.
 */
beforeEach(() => {
  // jsdom has neither of these; the panel measures with one and dialogs use the other
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  HTMLDialogElement.prototype.showModal = vi.fn<() => void>()
  HTMLDialogElement.prototype.close = vi.fn<() => void>()
  localStorage.clear()
})

function mountPanel() {
  setActivePinia(createPinia())
  const projects = useProjectsStore()
  const editor = useEditorStore()
  const project = projects.create({ name: 'Test', seed: 'blank', type: 'hires' })!
  projects.open(project.id)
  editor.reset()
  const wrapper = mount(ScreenPanel, { attachTo: document.body })
  return { wrapper, projects, editor }
}

type Wrapper = ReturnType<typeof mountPanel>['wrapper']

const brushButtons = (wrapper: Wrapper) => wrapper.findAll('[aria-label="Brush mode"] button')
const button = (wrapper: Wrapper, label: string) =>
  wrapper.findAll('button').find((b) => b.attributes('aria-label') === label)

describe('ScreenPanel', () => {
  it('offers the three brush modes, Character selected', () => {
    const { wrapper } = mountPanel()
    const buttons = brushButtons(wrapper)
    expect(buttons.map((b) => b.text())).toEqual(['Character', 'Color', 'Both'])
    expect(buttons[0]!.attributes('aria-checked')).toBe('true')
  })

  it('selects a brush mode', async () => {
    const { wrapper, editor } = mountPanel()
    await brushButtons(wrapper)[1]!.trigger('click')
    expect(editor.brushMode).toBe('color')
    expect(brushButtons(wrapper)[1]!.attributes('aria-checked')).toBe('true')
  })

  it('fill and clear act on the layers the brush writes', async () => {
    const { wrapper, editor } = mountPanel()
    editor.selectChar(65)
    editor.setColor('fg', 2)

    await button(wrapper, 'Fill Screen with Selected Character')!.trigger('click')
    expect(editor.currentScreen!.cells.every((code) => code === 65)).toBe(true)

    await brushButtons(wrapper)[1]!.trigger('click') // Color
    await button(wrapper, 'Fill Screen with Selected Color')!.trigger('click')
    expect(editor.currentScreen!.colors.every((color) => color === 2)).toBe(true)
    expect(editor.currentScreen!.cells.every((code) => code === 65)).toBe(true)

    await button(wrapper, 'Reset Every Cell to the Default Color')!.trigger('click')
    expect(editor.currentScreen!.cells.every((code) => code === 65)).toBe(true)
    expect(editor.undoLabel).toBe('Reset Colors')
  })
})

/**
 * Phase 11's states: a control that is grayed out says why, and a project that
 * arrives without a screen offers one rather than showing an empty box.
 */
describe('ScreenPanel disabled and empty states', () => {
  /** The accessible name carries the reason while the button is disabled. */
  const named = (wrapper: Wrapper, prefix: string) =>
    wrapper.findAll('button').find((b) => b.attributes('aria-label')?.startsWith(prefix))!

  it('says why a disabled control is disabled', async () => {
    const { wrapper, editor } = mountPanel()
    editor.zoomScreen(-8) // down to 1×, where zooming out stops
    await wrapper.vm.$nextTick()
    expect(named(wrapper, 'Zoom Out').attributes('aria-label')).toBe(
      'Zoom Out — already at 1×, the smallest scale',
    )
    expect(named(wrapper, 'Undo').attributes('aria-label')).toBe('Undo — nothing to undo yet')
    expect(named(wrapper, 'Previous Screen').attributes('aria-label')).toBe(
      'Previous Screen — this is the first screen',
    )
    expect(named(wrapper, 'Delete Screen').attributes('aria-label')).toBe(
      'Delete Screen — a project keeps at least one screen',
    )
  })

  it('drops the reason once the control works again', async () => {
    const { wrapper, editor } = mountPanel()
    editor.addScreen()
    await wrapper.vm.$nextTick()
    expect(named(wrapper, 'Delete Screen').attributes('aria-label')).toBe('Delete Screen')
    expect(named(wrapper, 'Previous Screen').attributes('aria-label')).toBe('Previous Screen')
  })

  it('offers a screen when the project has none', async () => {
    const { wrapper, projects, editor } = mountPanel()
    projects.current!.screens = []
    await wrapper.vm.$nextTick()

    expect(wrapper.find('canvas').exists()).toBe(false)
    expect(wrapper.text()).toContain('No screens')

    await button(wrapper, 'Add Screen')!.trigger('click')
    expect(editor.screenCount).toBe(1)
    expect(wrapper.find('canvas').exists()).toBe(true)
  })
})
