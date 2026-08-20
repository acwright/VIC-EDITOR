import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { CreateProjectOptions } from '@/domain/factory'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'
import CharsetList from '../CharsetList.vue'

/**
 * The list view: the index of the set, for the questions a picture of it can't
 * answer — what is at $2A, which way a `mixed` project renders it, and which
 * slots are still free.
 *
 * jsdom draws nothing, so what these check is the row around the canvas and the
 * listbox behaviour: one tab stop, arrows for the rest.
 */
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  localStorage.clear()
})

function mountList(options: Partial<CreateProjectOptions> = {}) {
  setActivePinia(createPinia())
  const projects = useProjectsStore()
  const editor = useEditorStore()
  const project = projects.create({
    name: 'Test',
    seed: 'blank',
    type: 'hires',
    settings: { charCount: 64 },
    ...options,
  })!
  projects.open(project.id)
  editor.reset()
  const wrapper = mount(CharsetList)
  return { wrapper, projects, editor }
}

type Wrapper = ReturnType<typeof mountList>['wrapper']

const rows = (wrapper: Wrapper) => wrapper.findAll('[role="option"]')

/** A key press on the listbox, as one arrives while it holds focus. */
function key(wrapper: Wrapper, value: string) {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
  wrapper.get('[role="listbox"]').element.dispatchEvent(event)
  return event
}

describe('CharsetList', () => {
  it('shows one row per character, with the code in both bases', () => {
    const { wrapper } = mountList()
    expect(rows(wrapper)).toHaveLength(64)
    expect(rows(wrapper)[10]!.text()).toContain('#10 · $0A')
  })

  it('selects the clicked character', async () => {
    const { wrapper, editor } = mountList()
    await rows(wrapper)[7]!.trigger('click')
    expect(editor.selectedChar).toBe(7)
    expect(rows(wrapper)[7]!.attributes('aria-selected')).toBe('true')
  })

  it('keeps one tab stop, on the selected row', async () => {
    const { wrapper, editor } = mountList()
    expect(rows(wrapper).filter((r) => r.attributes('tabindex') === '0')).toHaveLength(1)

    editor.selectChar(5)
    await wrapper.vm.$nextTick()
    expect(rows(wrapper)[5]!.attributes('tabindex')).toBe('0')
    expect(rows(wrapper)[0]!.attributes('tabindex')).toBe('-1')
  })

  it('walks the set with the arrows, a page at a time with PageUp/Down', () => {
    const { wrapper, editor } = mountList()
    key(wrapper, 'ArrowDown')
    key(wrapper, 'ArrowDown')
    expect(editor.selectedChar).toBe(2)
    key(wrapper, 'ArrowUp')
    expect(editor.selectedChar).toBe(1)
    key(wrapper, 'PageDown')
    expect(editor.selectedChar).toBe(9)
    key(wrapper, 'End')
    expect(editor.selectedChar).toBe(63)
    key(wrapper, 'ArrowDown') // the end is the end
    expect(editor.selectedChar).toBe(63)
    key(wrapper, 'Home')
    expect(editor.selectedChar).toBe(0)
  })

  it('keeps its keys away from the editor’s shortcut map', () => {
    const { wrapper } = mountList()
    expect(key(wrapper, 'ArrowDown').defaultPrevented).toBe(true)
    expect(key(wrapper, 'f').defaultPrevented).toBe(false) // still the Fill shortcut
  })

  it('marks the blank slots, which is how a free code is found', async () => {
    const { wrapper, editor } = mountList()
    expect(rows(wrapper)[0]!.text()).toContain('Blank')

    editor.applyTransform('fill') // character 0 now draws something
    await wrapper.vm.$nextTick()
    expect(rows(wrapper)[0]!.text()).not.toContain('Blank')
    expect(rows(wrapper)[1]!.text()).toContain('Blank')
  })

  it('says which way a `mixed` project renders each character (D2)', async () => {
    const { wrapper, editor } = mountList({ type: 'mixed' })
    expect(wrapper.text()).not.toContain('Multicolor')

    editor.setCharMode(3, true)
    await wrapper.vm.$nextTick()
    expect(rows(wrapper)[3]!.text()).toContain('Multicolor')
    expect(rows(wrapper)[3]!.attributes('aria-label')).toContain('multicolor')
    expect(rows(wrapper)[2]!.text()).not.toContain('Multicolor')
  })

  it('leaves single-mode projects unbadged — the type decides there (D1)', async () => {
    const { wrapper } = mountList({ type: 'multicolor' })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('Multicolor')
  })
})
