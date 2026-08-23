import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { CreateProjectOptions } from '@/domain/factory'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'
import CharsetPicker from '../CharsetPicker.vue'
import { loadPreferences } from '@/persistence/preferences'
import { CHARSET_VIEWS } from '@/utils/charsetView'
import { openTestProject } from '@/testing/project'

/**
 * jsdom has no 2D context, so the canvas records nothing — what these check is
 * the layer around it: how many grids a char count produces, how tall each one
 * is, and the badges marking multicolor characters (PLAN.md D2, D4).
 */
const context = {
  fillStyle: '',
  fillRect: vi.fn<(x: number, y: number, w: number, h: number) => void>(),
} as unknown as CanvasRenderingContext2D

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
})

function mountPicker(
  options: Partial<CreateProjectOptions> = {},
  { clearStorage = true }: { clearStorage?: boolean } = {},
) {
  if (clearStorage) localStorage.clear()
  setActivePinia(createPinia())
  const projects = useProjectsStore()
  const editor = useEditorStore()
  openTestProject({ name: 'Test', seed: 'blank', type: 'hires', ...options })
  editor.reset()

  const wrapper = mount(CharsetPicker, { global: { stubs: { ExportDialog: true } } })
  return { wrapper, projects, editor }
}

const canvases = (wrapper: ReturnType<typeof mountPicker>['wrapper']) =>
  wrapper.findAll('canvas').map((c) => c.element as HTMLCanvasElement)

describe('CharsetPicker', () => {
  it('splits 256 characters into the two halves the VIC itself uses', () => {
    const { wrapper } = mountPicker()
    const grids = canvases(wrapper)
    expect(grids).toHaveLength(2)
    expect(grids[0]!.getAttribute('aria-label')).toContain('Characters 0–127')
    expect(grids[1]!.getAttribute('aria-label')).toContain('Characters 128–255')
    expect(grids[0]!.height).toBe(16 * 8) // 16 rows of 8-pixel characters
  })

  it('shows one short grid for a 64-character set, not 192 empty slots (D4)', () => {
    const { wrapper } = mountPicker({ settings: { charCount: 64 } })
    const grids = canvases(wrapper)
    expect(grids).toHaveLength(1)
    expect(grids[0]!.getAttribute('aria-label')).toContain('Characters 0–63')
    expect(grids[0]!.height).toBe(8 * 8) // 8 rows
  })

  it('doubles each grid’s height for tall characters (D3)', () => {
    const { wrapper } = mountPicker({ settings: { charCount: 128, charHeight: 16 } })
    const grids = canvases(wrapper)
    expect(grids).toHaveLength(1)
    expect(grids[0]!.height).toBe(16 * 16)
  })

  it('badges the multicolor characters of a `mixed` project (D2)', async () => {
    const { wrapper, editor } = mountPicker({ type: 'mixed', settings: { charCount: 64 } })
    expect(wrapper.findAll('[title$="is multicolor"]')).toHaveLength(0)

    editor.setCharMode(9, true)
    await wrapper.vm.$nextTick()
    const badges = wrapper.findAll('[title$="is multicolor"]')
    expect(badges).toHaveLength(1)
    expect(badges[0]!.attributes('title')).toBe('Character 9 is multicolor')
    // Ninth of eight columns: row 1, column 1.
    expect(badges[0]!.attributes('style')).toContain('left: 12.5%')
  })

  it('leaves single-mode projects unbadged — the type decides there (D1)', () => {
    const { wrapper } = mountPicker({ type: 'multicolor' })
    expect(wrapper.findAll('[title$="is multicolor"]')).toHaveLength(0)
  })
})

/**
 * Phase 11: the picker is a canvas, so there are no buttons to tab through —
 * each grid takes focus as one control and the arrows walk it.
 */
describe('CharsetPicker keyboard selection', () => {
  /** A key press on one of the grids, as one arrives while it holds focus. */
  function key(canvas: HTMLCanvasElement, value: string) {
    const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
    canvas.dispatchEvent(event)
    return event
  }

  it('moves by one across the row and by eight down it', () => {
    const { wrapper, editor } = mountPicker()
    const grid = canvases(wrapper)[0]!
    key(grid, 'ArrowRight')
    key(grid, 'ArrowDown')
    expect(editor.selectedChar).toBe(9)
    key(grid, 'ArrowUp')
    key(grid, 'ArrowLeft')
    expect(editor.selectedChar).toBe(0)
  })

  it('stays inside its own block — the other half has its own focus stop', () => {
    const { wrapper, editor } = mountPicker()
    const [first, second] = canvases(wrapper)
    key(first!, 'End')
    expect(editor.selectedChar).toBe(127)
    key(first!, 'ArrowRight')
    expect(editor.selectedChar).toBe(127)

    // Arriving in the second grid with the selection elsewhere claims its start
    key(second!, 'ArrowRight')
    expect(editor.selectedChar).toBe(128)
    key(second!, 'End')
    expect(editor.selectedChar).toBe(255)
  })

  it('stops short of the empty slots in a 64-character project (D4)', () => {
    const { wrapper, editor } = mountPicker({ settings: { charCount: 64 } })
    const grid = canvases(wrapper)[0]!
    key(grid, 'End')
    expect(editor.selectedChar).toBe(63)
  })

  it('keeps the arrows away from the editor’s shortcut map', () => {
    const { wrapper } = mountPicker()
    const grid = canvases(wrapper)[0]!
    expect(key(grid, 'ArrowRight').defaultPrevented).toBe(true)
    expect(key(grid, 'f').defaultPrevented).toBe(false)
  })
})

/**
 * Phase 11 follow-up: the blocks view scales the whole set to the space it is
 * given, which reads well with height to spare and collapses to a sliver
 * without it. The layout is a choice, and the choice outlives the session.
 */
describe('CharsetPicker layouts', () => {
  const layoutButtons = (wrapper: ReturnType<typeof mountPicker>['wrapper']) =>
    wrapper.findAll('[aria-label="Character set layout"] button')

  /** Click the layout whose tooltip starts with `label`. */
  async function choose(wrapper: ReturnType<typeof mountPicker>['wrapper'], label: string) {
    const button = layoutButtons(wrapper).find((b) =>
      b.attributes('aria-label')?.startsWith(label),
    )!
    await button.trigger('click')
    return button
  }

  it('offers the three layouts, blocks selected by default', () => {
    const { wrapper } = mountPicker()
    const buttons = layoutButtons(wrapper)
    expect(buttons).toHaveLength(CHARSET_VIEWS.length)
    expect(buttons[0]!.attributes('aria-checked')).toBe('true')
    expect(canvases(wrapper)).toHaveLength(2) // the two 128-glyph halves
  })

  it('draws the whole set as one width-fitted grid in the grid view', async () => {
    const { wrapper } = mountPicker()
    await choose(wrapper, 'Grid')

    const grids = canvases(wrapper)
    expect(grids).toHaveLength(1)
    expect(grids[0]!.getAttribute('aria-label')).toContain('Characters 0–255')
    // 256 glyphs, eight a row, at 8 pixel rows each
    expect(grids[0]!.height).toBe(32 * 8)
    expect(grids[0]!.className).toContain('w-full')
  })

  it('lists every character with its code in the list view', async () => {
    const { wrapper } = mountPicker({ settings: { charCount: 64 } })
    await choose(wrapper, 'List')

    const rows = wrapper.findAll('[role="option"]')
    expect(rows).toHaveLength(64)
    expect(rows[0]!.text()).toContain('#0 · $00')
    expect(rows[42]!.text()).toContain('#42 · $2A')
    expect(rows[0]!.attributes('aria-selected')).toBe('true')
  })

  it('remembers the layout across mounts', async () => {
    const { wrapper } = mountPicker()
    await choose(wrapper, 'List')
    expect(loadPreferences().charsetView).toBe('list')

    // A fresh picker over the same browser storage opens where it left off
    const again = mountPicker({}, { clearStorage: false })
    expect(again.wrapper.findAll('[role="option"]').length).toBeGreaterThan(0)
  })
})
