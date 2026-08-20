import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { CellShape } from '@/domain/modes'
import PixelEditor from '../PixelEditor.vue'

const HIRES_8: CellShape = { width: 8, height: 8, bpp: 1 }
const HIRES_16: CellShape = { width: 8, height: 16, bpp: 1 }
const MULTI_8: CellShape = { width: 4, height: 8, bpp: 2 }

/**
 * Mount with the grid rect stubbed to a fixed 80 × 80 box, whatever the shape —
 * so an 8-wide grid has 10px pixels and a 4-wide one 20px, which is the 2×
 * scaling the component exists to produce (PLAN.md D10).
 */
function mountEditor(
  options: {
    shape?: CellShape
    values?: number[]
    activeValue?: number
    backgroundValue?: number
  } = {},
) {
  const shape = options.shape ?? HIRES_8
  const values = options.values ?? Array.from({ length: shape.width * shape.height }, () => 0)
  const wrapper = mount(PixelEditor, {
    props: {
      values,
      shape,
      palette: ['#FFFFFF', '#000000', '#782922', '#87D6DD'],
      activeValue: options.activeValue ?? 1,
      backgroundValue: options.backgroundValue ?? 0,
    },
  })
  const grid = wrapper.get('[aria-label^="Pixel editor"]').element as HTMLElement
  vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({
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
  grid.setPointerCapture = vi.fn<(id: number) => void>() // jsdom has no pointer capture
  return { wrapper, grid }
}

/** Dispatch a pointer event (jsdom lacks PointerEvent; MouseEvent carries what we read). */
function pointer(el: HTMLElement, type: string, init: MouseEventInit, pointerType = 'mouse') {
  const event = new MouseEvent(type, { bubbles: true, ...init })
  Object.assign(event, { pointerId: 1, pointerType })
  el.dispatchEvent(event)
}

/** A key press on the grid, as one arrives while it holds focus. */
function key(el: HTMLElement, value: string) {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
  el.dispatchEvent(event)
  return event
}

describe('PixelEditor', () => {
  it('paints the cell under a pointerdown via coordinate math', () => {
    const { wrapper, grid } = mountEditor()
    // (25, 35) → cell (2, 3)
    pointer(grid, 'pointerdown', { button: 0, clientX: 25, clientY: 35 })

    expect(wrapper.emitted('strokeStart')).toHaveLength(1)
    expect(wrapper.emitted('paint')?.[0]).toEqual([2, 3, 1])
  })

  it('paints across cells on a drag (touch-style, no per-cell pointerenter)', () => {
    const { wrapper, grid } = mountEditor()
    pointer(grid, 'pointerdown', { button: 0, clientX: 5, clientY: 5 }) // (0,0)
    pointer(grid, 'pointermove', { clientX: 15, clientY: 5 }) // (1,0)
    pointer(grid, 'pointermove', { clientX: 25, clientY: 5 }) // (2,0)

    expect(wrapper.emitted('paint')).toEqual([
      [0, 0, 1],
      [1, 0, 1],
      [2, 0, 1],
    ])
  })

  it('does not re-emit while the pointer stays within one cell', () => {
    const { wrapper, grid } = mountEditor()
    pointer(grid, 'pointerdown', { button: 0, clientX: 5, clientY: 5 })
    pointer(grid, 'pointermove', { clientX: 8, clientY: 8 }) // still (0,0)
    expect(wrapper.emitted('paint')).toHaveLength(1)
  })

  it('right-button drags paint the background value', () => {
    const values = Array.from({ length: 64 }, () => 1)
    const { wrapper, grid } = mountEditor({ values })
    pointer(grid, 'pointerdown', { button: 2, clientX: 5, clientY: 5 })
    pointer(grid, 'pointermove', { clientX: 15, clientY: 5 })
    expect(wrapper.emitted('paint')).toEqual([
      [0, 0, 0],
      [1, 0, 0],
    ])
  })

  it('toggles back to the background when the pixel already holds the active value', () => {
    const values = Array.from({ length: 64 }, () => 0)
    values[3 * 8 + 2] = 1 // cell (2, 3) already painted
    const { wrapper, grid } = mountEditor({ values })
    pointer(grid, 'pointerdown', { button: 0, clientX: 25, clientY: 35 })
    expect(wrapper.emitted('paint')?.[0]).toEqual([2, 3, 0])
  })

  it('ends the stroke on pointerup', () => {
    const { wrapper, grid } = mountEditor()
    pointer(grid, 'pointerdown', { button: 0, clientX: 5, clientY: 5 })
    window.dispatchEvent(new Event('pointerup'))
    expect(wrapper.emitted('strokeEnd')).toHaveLength(1)
  })

  describe('tall hires cells (8 × 16)', () => {
    it('renders 128 cells in 8 columns and 16 rows, at the cell’s own proportions', () => {
      const { wrapper } = mountEditor({ shape: HIRES_16 })
      const grid = wrapper.get('[aria-label^="Pixel editor"]')
      expect(grid.element.children).toHaveLength(128)
      const style = (grid.element as HTMLElement).style
      expect(style.gridTemplateColumns).toBe('repeat(8, minmax(0, 1fr))')
      expect(style.gridTemplateRows).toBe('repeat(16, minmax(0, 1fr))')
      expect(style.aspectRatio).toBe('8 / 16')
    })

    it('maps pointer coordinates down 16 rows', () => {
      const { wrapper, grid } = mountEditor({ shape: HIRES_16 })
      // 80px / 16 = 5px rows, so (25, 37) → cell (2, 7)
      pointer(grid, 'pointerdown', { button: 0, clientX: 25, clientY: 37 })
      expect(wrapper.emitted('paint')?.[0]).toEqual([2, 7, 1])
    })

    it('reads the pixel value with 8-wide row stride', () => {
      const values = Array.from({ length: 128 }, () => 0)
      values[7 * 8 + 2] = 1 // cell (2, 7)
      const { wrapper, grid } = mountEditor({ shape: HIRES_16, values })
      pointer(grid, 'pointerdown', { button: 0, clientX: 25, clientY: 37 })
      expect(wrapper.emitted('paint')?.[0]).toEqual([2, 7, 0])
    })
  })

  describe('multicolor cells (4 × 8)', () => {
    it('renders 32 double-wide cells across the same 8-pixel box', () => {
      const { wrapper } = mountEditor({ shape: MULTI_8 })
      const grid = wrapper.get('[aria-label^="Pixel editor"]')
      expect(grid.element.children).toHaveLength(32)
      const style = (grid.element as HTMLElement).style
      expect(style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))')
      expect(style.aspectRatio).toBe('8 / 8')
    })

    it('maps a pointer across 4 columns, so each pixel is twice as wide', () => {
      const { wrapper, grid } = mountEditor({ shape: MULTI_8 })
      // 80px / 4 = 20px columns: x = 25 and x = 35 are the same pixel
      pointer(grid, 'pointerdown', { button: 0, clientX: 25, clientY: 5 })
      pointer(grid, 'pointermove', { clientX: 35, clientY: 5 })
      expect(wrapper.emitted('paint')).toEqual([[1, 0, 1]])
    })

    it('paints the active pixel value, not a boolean', () => {
      const { wrapper, grid } = mountEditor({ shape: MULTI_8, activeValue: 3 })
      pointer(grid, 'pointerdown', { button: 0, clientX: 5, clientY: 5 })
      expect(wrapper.emitted('paint')?.[0]).toEqual([0, 0, 3])
    })

    it('paints over a pixel holding a different value rather than toggling it off', () => {
      const values = Array.from({ length: 32 }, () => 0)
      values[0] = 1 // border color
      const { wrapper, grid } = mountEditor({ shape: MULTI_8, values, activeValue: 2 })
      pointer(grid, 'pointerdown', { button: 0, clientX: 5, clientY: 5 })
      expect(wrapper.emitted('paint')?.[0]).toEqual([0, 0, 2])
    })

    it('honors a non-zero background value (reverse mode hires, or an odd slot order)', () => {
      const { wrapper, grid } = mountEditor({ activeValue: 0, backgroundValue: 1 })
      pointer(grid, 'pointerdown', { button: 2, clientX: 5, clientY: 5 })
      expect(wrapper.emitted('paint')?.[0]).toEqual([0, 0, 1])
    })

    it('colors each cell from the palette entry for its value', () => {
      const values = Array.from({ length: 32 }, (_, i) => i % 4)
      const { wrapper } = mountEditor({ shape: MULTI_8, values })
      const cells = wrapper.get('[aria-label^="Pixel editor"]').element.children
      expect((cells[0] as HTMLElement).style.backgroundColor).toBe('rgb(255, 255, 255)')
      expect((cells[3] as HTMLElement).style.backgroundColor).toBe('rgb(135, 214, 221)')
    })
  })
})

/**
 * Phase 11: the grid draws from the keyboard as well as the pointer. The cursor
 * carries the click's toggle with it, so the two ways of drawing produce the
 * same bytes.
 */
describe('PixelEditor keyboard cursor', () => {
  it('lands at the origin, moves with the arrows, and paints on Enter', () => {
    const { wrapper, grid } = mountEditor()
    key(grid, 'ArrowRight') // the first press lands rather than moves
    key(grid, 'ArrowRight')
    key(grid, 'ArrowDown')
    key(grid, 'Enter')

    expect(wrapper.emitted('paint')?.[0]).toEqual([1, 1, 1])
    // One press, one undo entry
    expect(wrapper.emitted('strokeStart')).toHaveLength(1)
    expect(wrapper.emitted('strokeEnd')).toHaveLength(1)
  })

  it('toggles a pixel that already holds the active value, as a click does', () => {
    const values = Array.from({ length: 64 }, () => 0)
    values[0] = 1
    const { wrapper, grid } = mountEditor({ values })
    key(grid, 'ArrowRight') // lands on (0, 0)
    key(grid, ' ')
    expect(wrapper.emitted('paint')?.[0]).toEqual([0, 0, 0])
  })

  it('clears a pixel to the background on Backspace', () => {
    const { wrapper, grid } = mountEditor({ activeValue: 3, backgroundValue: 0 })
    key(grid, 'ArrowRight')
    key(grid, 'Backspace')
    expect(wrapper.emitted('paint')?.[0]).toEqual([0, 0, 0])
  })

  it('stops at the edges of the cell, whatever its shape', () => {
    const { wrapper, grid } = mountEditor({ shape: MULTI_8 })
    key(grid, 'End') // lands at (0, 0), the first press
    key(grid, 'End') // 4-wide cell: the last column is 3
    key(grid, 'ArrowRight')
    key(grid, 'Enter')
    expect(wrapper.emitted('paint')?.[0]).toEqual([3, 0, 1])
  })

  it('marks the cursor cell and announces it', async () => {
    const { wrapper, grid } = mountEditor()
    key(grid, 'ArrowRight')
    key(grid, 'ArrowRight')
    await wrapper.vm.$nextTick()

    const cells = wrapper.get('[aria-label^="Pixel editor"]').element.children
    expect(cells[1]?.children).toHaveLength(1) // the marker ring
    expect(cells[0]?.children).toHaveLength(0)
    expect(wrapper.get('[aria-live="polite"]').text()).toBe('X 1, Y 0 — pixel value 0')
  })

  it('keeps its keys away from the editor’s shortcut map', () => {
    const { grid } = mountEditor()
    expect(key(grid, 'ArrowRight').defaultPrevented).toBe(true)
    expect(key(grid, 'f').defaultPrevented).toBe(false) // still the Fill shortcut
  })

  it('drops the cursor when the cell changes shape', async () => {
    const { wrapper, grid } = mountEditor()
    key(grid, 'ArrowRight')
    await wrapper.setProps({
      shape: MULTI_8,
      values: Array.from({ length: 32 }, () => 0),
    })
    expect(wrapper.get('[aria-live="polite"]').text()).toBe('')
  })
})

describe('PixelEditor touch', () => {
  it('paints a drag from a finger', () => {
    const { wrapper, grid } = mountEditor()
    pointer(grid, 'pointerdown', { button: 0, clientX: 5, clientY: 5 }, 'touch')
    pointer(grid, 'pointermove', { clientX: 15, clientY: 5 }, 'touch')
    window.dispatchEvent(new Event('pointerup'))

    expect(wrapper.emitted('paint')).toEqual([
      [0, 0, 1],
      [1, 0, 1],
    ])
    expect(wrapper.emitted('strokeEnd')).toHaveLength(1)
  })
})
