import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { CreateProjectOptions } from '@/domain/factory'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'
import { openTestProject } from '@/testing/project'
import CharacterPanel from '../CharacterPanel.vue'

/**
 * The panel wired to a real store and project — this is where Phase 3's promise
 * is actually checked: that a character of any shape draws through the pixel
 * grid into the right pattern bytes, and back out of them (PLAN.md Phase 3).
 */
function mountPanel(options: Partial<CreateProjectOptions> = {}) {
  localStorage.clear()
  setActivePinia(createPinia())
  const projects = useProjectsStore()
  const editor = useEditorStore()
  openTestProject({ name: 'Test', seed: 'blank', type: 'hires', ...options })
  editor.reset()

  const wrapper = mount(CharacterPanel, { attachTo: document.body })
  return { wrapper, projects, editor }
}

/** The pixel grid, its rect stubbed to a fixed 80 × 80 box. */
function grid(wrapper: ReturnType<typeof mountPanel>['wrapper']) {
  const el = wrapper.get('[aria-label^="Pixel editor"]').element as HTMLElement
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 80,
    height: 80,
    right: 80,
    bottom: 80,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  el.setPointerCapture = vi.fn<(id: number) => void>()
  return el
}

function draw(el: HTMLElement, clientX: number, clientY: number, button = 0) {
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button, clientX, clientY }))
  window.dispatchEvent(new Event('pointerup'))
}

function bytesBox(wrapper: ReturnType<typeof mountPanel>['wrapper']) {
  return wrapper.get('input[aria-label^="Pattern bytes"]')
}

describe('CharacterPanel', () => {
  describe('4 × 8 multicolor characters', () => {
    it('draws four double-wide pixels into one byte, and shows those bytes', async () => {
      const { wrapper, projects, editor } = mountPanel({ type: 'multicolor' })
      const el = grid(wrapper)
      expect(el.children).toHaveLength(32)

      // The brush is the character color, pixel value 10 (PLAN.md §2.2).
      expect(editor.activeValue).toBe(2)
      // 80px / 4 = 20px columns, so x = 25 is pixel 1 of row 0.
      draw(el, 25, 5)
      expect(projects.current!.charset[0]![0]).toBe(0b00100000)

      // …and the auxiliary color is 11, in the leftmost pixel.
      editor.setActiveSlot('aux')
      await wrapper.vm.$nextTick()
      draw(el, 5, 5)
      expect(projects.current!.charset[0]![0]).toBe(0b11100000)

      await wrapper.vm.$nextTick()
      expect((bytesBox(wrapper).element as HTMLInputElement).value).toBe(
        '$E0, $00, $00, $00, $00, $00, $00, $00',
      )
    })

    it('round-trips those bytes back into the same pixels', async () => {
      const { wrapper, projects, editor } = mountPanel({ type: 'multicolor' })
      const input = bytesBox(wrapper)
      await input.setValue('$1B, 0, 0, 0, 0, 0, 0, 0')
      await input.trigger('blur')

      expect(projects.current!.charset[0]![0]).toBe(0x1b)
      // $1B is 00 01 10 11 — one pixel of each color, left to right.
      const el = grid(wrapper)
      const backgrounds = Array.from(el.children)
        .slice(0, 4)
        .map((cell) => (cell as HTMLElement).style.backgroundColor)
      expect(new Set(backgrounds).size).toBe(4)
      expect(editor.currentShape).toEqual({ width: 4, height: 8, bpp: 2 })
    })

    it('right-click paints the screen color back over a pixel', () => {
      const { wrapper, projects } = mountPanel({ type: 'multicolor' })
      const el = grid(wrapper)
      draw(el, 5, 5)
      expect(projects.current!.charset[0]![0]).toBe(0b10000000)
      draw(el, 5, 5, 2)
      expect(projects.current!.charset[0]![0]).toBe(0)
    })

    it('hides invert and disables the rotations, saying why', () => {
      const { wrapper, editor } = mountPanel({ type: 'multicolor' })
      // A multicolor cell has no complement, so invert is not offered at all —
      // and the key stays inert rather than writing a no-op undo entry.
      expect(wrapper.find('button[aria-label^="Invert"]').exists()).toBe(false)
      editor.applyTransform('invert')
      expect(editor.canUndo).toBe(false)
      // The rotations keep their place in the grid frame, greyed with a reason
      expect(wrapper.get('button[aria-label^="Rotate Right"]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('button[aria-label^="Rotate Right"]').attributes('aria-label')).toContain(
        'Hires only',
      )
      // Flips still move whole pixels, so they stay available.
      expect(
        wrapper.get('button[aria-label="Flip Horizontal"]').attributes('disabled'),
      ).toBeUndefined()
    })
  })

  describe('8 × 16 hires characters', () => {
    it('draws into the sixteenth row and keeps sixteen bytes', async () => {
      const { wrapper, projects, editor } = mountPanel({ settings: { charHeight: 16 } })
      const el = grid(wrapper)
      expect(el.children).toHaveLength(128)
      expect(editor.currentPattern).toHaveLength(16)

      // 80px / 16 = 5px rows, so (25, 77) is pixel (2, 15).
      draw(el, 25, 77)
      expect(projects.current!.charset[0]![15]).toBe(0b00100000)

      await wrapper.vm.$nextTick()
      const shown = (bytesBox(wrapper).element as HTMLInputElement).value
      expect(shown.split(', ')).toHaveLength(16)
      expect(shown.endsWith('$20')).toBe(true)
    })

    it('round-trips sixteen pasted bytes', async () => {
      const { wrapper, projects } = mountPanel({ settings: { charHeight: 16 } })
      const input = bytesBox(wrapper)
      const bytes = Array.from({ length: 16 }, (_, i) => i * 16)
      await input.setValue(bytes.join(', '))
      await input.trigger('blur')
      expect(projects.current!.charset[0]).toEqual(bytes)

      // Eight bytes is the wrong count for a tall character — rejected, not padded.
      await input.setValue('1, 2, 3, 4, 5, 6, 7, 8')
      await input.trigger('blur')
      expect(projects.current!.charset[0]).toEqual(bytes)
    })

    it('rotation is unavailable on a non-square cell, and says so', () => {
      const { wrapper } = mountPanel({ settings: { charHeight: 16 } })
      const rotate = wrapper.get('button[aria-label^="Rotate Left"]')
      expect(rotate.attributes('disabled')).toBeDefined()
      expect(rotate.attributes('aria-label')).toContain('8 × 16')
      // Invert is fine: a hires cell has exactly two values to swap.
      expect(wrapper.get('button[aria-label="Invert"]').attributes('disabled')).toBeUndefined()
    })
  })

  describe('mixed projects', () => {
    it('offers a per-character mode toggle that leaves the bytes alone (D2)', async () => {
      const { wrapper, projects, editor } = mountPanel({ type: 'mixed' })
      const input = bytesBox(wrapper)
      await input.setValue('$CA, 1, 2, 3, 4, 5, 6, 7')
      await input.trigger('blur')

      expect(grid(wrapper).children).toHaveLength(64) // 8 × 8 hires
      await wrapper.get('button[aria-label="Render as Multicolor"]').trigger('click')

      expect(projects.current!.charset[0]).toEqual([0xca, 1, 2, 3, 4, 5, 6, 7])
      expect(editor.currentShape).toEqual({ width: 4, height: 8, bpp: 2 })
      expect(grid(wrapper).children).toHaveLength(32)
    })

    it('hides the toggle in single-mode projects, where the type decides (D1)', () => {
      const { wrapper } = mountPanel({ type: 'hires' })
      expect(wrapper.find('button[aria-label="Render as Multicolor"]').exists()).toBe(false)
    })
  })
})
