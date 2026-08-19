import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { CreateProjectOptions } from '@/domain/factory'
import { CELL_SCREEN_WIDTH } from '@/domain/modes'
import type { PointerCell } from '@/domain/screenStatus'
import { DEFAULT_FG } from '@/domain/palette'
import { EMPTY_CELL } from '@/domain/screenOps'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'
import ScreenCanvas from '../ScreenCanvas.vue'

/**
 * Phase 5's central interaction: a stroke writes the character, the color RAM
 * value, or both, and the right button erases whichever of those the brush
 * covers (PLAN.md D7).
 *
 * jsdom gives elements a zero-sized rect and has no pointer capture, so both
 * are stubbed — the arithmetic under test is pointer position → cell, which
 * needs a real rect to mean anything.
 */
const CELL_HEIGHT = 8

/** jsdom has no PointerEvent; a MouseEvent carries everything the canvas reads. */
function pointer(el: HTMLElement, type: string, init: MouseEventInit, pointerType = 'mouse') {
  const event = new MouseEvent(type, { bubbles: true, ...init })
  Object.assign(event, { pointerId: 1, pointerType })
  el.dispatchEvent(event)
}

/** The cell the canvas last reported under the pointer, for the status bar. */
function lastHover(wrapper: ReturnType<typeof setup>['wrapper']) {
  const events = wrapper.emitted('hover') as [PointerCell | null][] | undefined
  return events?.[events.length - 1]?.[0] ?? null
}

function setup(options: Partial<CreateProjectOptions> = {}) {
  localStorage.clear()
  setActivePinia(createPinia())
  const projects = useProjectsStore()
  const editor = useEditorStore()
  const project = projects.create({ name: 'Test', seed: 'blank', type: 'hires', ...options })!
  projects.open(project.id)
  editor.reset()

  const wrapper = mount(ScreenCanvas, { props: { scale: 1, showGrid: false } })
  const canvas = wrapper.find('canvas')
  const { columns, rows } = projects.current!.settings
  canvas.element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: columns * CELL_SCREEN_WIDTH,
      height: rows * CELL_HEIGHT,
    }) as DOMRect
  canvas.element.setPointerCapture = vi.fn<(id: number) => void>()

  /** Press at the center of cell (x, y) with `button`. */
  const press = (x: number, y: number, button = 0, pointerType = 'mouse') =>
    pointer(
      canvas.element,
      'pointerdown',
      {
        button,
        clientX: x * CELL_SCREEN_WIDTH + 4,
        clientY: y * CELL_HEIGHT + 4,
      },
      pointerType,
    )

  /** Drag to the center of cell (x, y) — the stroke must already be down. */
  const drag = (x: number, y: number, pointerType = 'mouse') =>
    pointer(
      canvas.element,
      'pointermove',
      {
        clientX: x * CELL_SCREEN_WIDTH + 4,
        clientY: y * CELL_HEIGHT + 4,
      },
      pointerType,
    )

  /** A key press on the canvas, as one arrives while it holds focus. */
  const key = (value: string) => {
    const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
    canvas.element.dispatchEvent(event)
    return event
  }

  const release = () => window.dispatchEvent(new Event('pointerup'))

  const cell = (x: number, y: number) => {
    const index = y * columns + x
    return {
      code: editor.currentScreen!.cells[index],
      color: editor.currentScreen!.colors[index],
    }
  }

  return { wrapper, canvas, projects, editor, press, drag, release, cell, key }
}

describe('ScreenCanvas painting', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('paints the selected character in Character mode', () => {
    const { editor, press, release, cell } = setup()
    editor.selectChar(65)
    editor.setColor('fg', 2)

    press(3, 2)
    release()

    // The color brush is not part of this mode's stroke
    expect(cell(3, 2)).toEqual({ code: 65, color: DEFAULT_FG })
  })

  it('recolors without disturbing the character in Color mode', () => {
    const { editor, press, release, cell } = setup()
    editor.selectChar(65)
    editor.setBrushMode('both')
    editor.setColor('fg', 2)
    press(1, 1)
    release()

    editor.setBrushMode('color')
    editor.setColor('fg', 5)
    press(1, 1)
    release()

    expect(cell(1, 1)).toEqual({ code: 65, color: 5 })
  })

  it('paints character and color together in Both mode', () => {
    const { editor, press, release, cell } = setup()
    editor.selectChar(66)
    editor.setBrushMode('both')
    editor.setColor('fg', 4)

    press(0, 0)
    release()

    expect(cell(0, 0)).toEqual({ code: 66, color: 4 })
  })

  it('right-drag erases the layers the brush writes', () => {
    const { editor, press, drag, release, cell } = setup()
    editor.selectChar(65)
    editor.setBrushMode('both')
    editor.setColor('fg', 2)
    press(0, 0)
    drag(1, 0)
    release()

    // Color mode: the right button resets color RAM only
    editor.setBrushMode('color')
    press(0, 0, 2)
    release()
    expect(cell(0, 0)).toEqual({ code: 65, color: DEFAULT_FG })

    editor.setBrushMode('char')
    press(1, 0, 2)
    release()
    expect(cell(1, 0)).toEqual({ code: EMPTY_CELL, color: 2 })
  })

  it('undoes a whole drag as one entry', () => {
    const { editor, press, drag, release, cell } = setup()
    editor.selectChar(65)

    press(0, 0)
    drag(1, 0)
    drag(2, 0)
    release()
    expect(cell(2, 0).code).toBe(65)

    editor.undo()
    expect([cell(0, 0).code, cell(1, 0).code, cell(2, 0).code]).toEqual([
      EMPTY_CELL,
      EMPTY_CELL,
      EMPTY_CELL,
    ])
    expect(editor.canUndo).toBe(false)
  })

  it('reports the hovered cell and ignores presses outside the grid', () => {
    const { wrapper, press, cell } = setup()
    press(2, 3)
    expect(lastHover(wrapper)).toEqual({ x: 2, y: 3 })

    press(40, 40) // past the right and bottom edges
    expect(lastHover(wrapper)).toBeNull()
    expect(cell(21, 22).code).toBe(EMPTY_CELL)
  })
})

/**
 * Phase 11: the canvas is a control, not a picture. It takes focus and paints
 * under a cursor, and the keys it consumes never reach the window-level map —
 * otherwise an arrow would both move the cursor and shift a character.
 */
describe('ScreenCanvas keyboard cursor', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('lands the cursor at the origin, then moves it with the arrows', () => {
    const { wrapper, key } = setup()
    key('ArrowRight') // the first press lands rather than moves
    expect(lastHover(wrapper)).toEqual({ x: 0, y: 0 })
    key('ArrowRight')
    key('ArrowDown')
    expect(lastHover(wrapper)).toEqual({ x: 1, y: 1 })
  })

  it('paints the cursor cell with the brush, and erases it', () => {
    const { editor, key, cell } = setup()
    editor.selectChar(65)
    editor.setBrushMode('both')
    editor.setColor('fg', 4)

    key('ArrowDown') // land at (0, 0)
    key('ArrowRight')
    key('Enter')
    expect(cell(1, 0)).toEqual({ code: 65, color: 4 })

    key('Delete')
    expect(cell(1, 0)).toEqual({ code: EMPTY_CELL, color: DEFAULT_FG })
  })

  it('makes each key press its own undo entry', () => {
    const { editor, key, cell } = setup()
    editor.selectChar(65)
    key('ArrowRight')
    key('Enter')
    key('ArrowRight')
    key('Enter')

    editor.undo()
    expect(cell(1, 0).code).toBe(EMPTY_CELL)
    expect(cell(0, 0).code).toBe(65)
  })

  it('stops at the edges rather than wrapping, and Home/End walk the row', () => {
    const { wrapper, key, projects } = setup()
    const { columns } = projects.current!.settings
    key('ArrowLeft')
    key('ArrowLeft') // already at column 0
    expect(lastHover(wrapper)).toEqual({ x: 0, y: 0 })
    key('End')
    expect(lastHover(wrapper)).toEqual({ x: columns - 1, y: 0 })
    key('ArrowRight')
    expect(lastHover(wrapper)).toEqual({ x: columns - 1, y: 0 })
    key('Home')
    expect(lastHover(wrapper)).toEqual({ x: 0, y: 0 })
  })

  it('keeps the keys it uses away from the editor’s shortcut map', () => {
    const { key } = setup()
    expect(key('ArrowRight').defaultPrevented).toBe(true)
    // Esc only belongs to the canvas while there is a cursor to dismiss;
    // otherwise it still means "back to the project list"
    expect(key('Escape').defaultPrevented).toBe(true)
    expect(key('Escape').defaultPrevented).toBe(false)
    expect(key('q').defaultPrevented).toBe(false)
  })

  it('announces the cursor cell for a screen reader', async () => {
    const { wrapper, editor, key } = setup()
    editor.selectChar(65)
    key('ArrowRight')
    key('Enter')
    await wrapper.vm.$nextTick()

    const live = wrapper.get('[aria-live="polite"]')
    expect(live.text()).toContain('X 0  Y 0')
    expect(live.text()).toContain('char $41 (65)')
  })
})

describe('ScreenCanvas touch', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('paints a drag from a finger, and clears the readout when it lifts', () => {
    const { wrapper, editor, press, drag, release, cell } = setup()
    editor.selectChar(65)

    press(0, 0, 0, 'touch')
    drag(1, 0, 'touch')
    release()

    expect([cell(0, 0).code, cell(1, 0).code]).toEqual([65, 65])
    // A finger leaves no pointer behind, so the status line goes idle
    expect(lastHover(wrapper)).toBeNull()
  })
})
