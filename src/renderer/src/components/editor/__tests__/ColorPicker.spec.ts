import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { CreateProjectOptions } from '@/domain/factory'
import { PALETTE } from '@/domain/palette'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'
import { openTestProject } from '@/testing/project'
import ColorPicker from '../ColorPicker.vue'

/**
 * The picker is where the VIC's color constraints are supposed to become
 * unbreakable: sixteen swatches always visible, half of them refused for the
 * two 3-bit fields, and the screen and border registers reachable even from a
 * cell that doesn't draw with them (PLAN.md Phase 4, D5, D6).
 */
function mountPicker(options: Partial<CreateProjectOptions> = {}) {
  localStorage.clear()
  setActivePinia(createPinia())
  const projects = useProjectsStore()
  const editor = useEditorStore()
  openTestProject({ name: 'Test', seed: 'blank', type: 'hires', ...options })
  editor.reset()

  const wrapper = mount(ColorPicker)
  return { wrapper, projects, editor }
}

type Wrapper = ReturnType<typeof mountPicker>['wrapper']

/** The slot rail, in the order it renders. */
const chips = (wrapper: Wrapper) => wrapper.findAll('[aria-label="Color slot"] button')

const chipLabels = (wrapper: Wrapper) =>
  chips(wrapper).map((chip) => chip.get('.font-display').text())

/** The 16 palette swatches. */
const swatches = (wrapper: Wrapper) => wrapper.findAll('[aria-label="Palette"] button')

/**
 * The `?` beside the slot rail. The reason half the palette is refused is a
 * hint rather than a standing line — it is read once, and the line it used to
 * occupy is a line off the character set below (D5).
 */
const rangeHint = (wrapper: Wrapper) =>
  wrapper.findAll('button').find((b) => b.attributes('aria-label')?.startsWith('Color RAM'))

/** jsdom's MouseEvent has a read-only `button`, so dispatch rather than trigger. */
async function press(wrapper: Wrapper, index: number, button = 0) {
  swatches(wrapper)[index]!.element.dispatchEvent(
    new MouseEvent('pointerdown', { bubbles: true, button }),
  )
  await wrapper.vm.$nextTick()
}

describe('ColorPicker', () => {
  it('always shows all sixteen colors, graying the ones a 3-bit field refuses (D5)', () => {
    const { wrapper } = mountPicker()
    const cells = swatches(wrapper)
    expect(cells).toHaveLength(PALETTE.length)

    // The character color is color RAM: 3 bits, so 8–15 are unrepresentable.
    expect(cells.slice(0, 8).every((s) => s.attributes('disabled') === undefined)).toBe(true)
    expect(cells.slice(8).every((s) => s.attributes('disabled') !== undefined)).toBe(true)
    expect(cells[15]!.attributes('aria-label')).toContain('3 bits wide')
    // A refused swatch promises neither click
    expect(cells[15]!.attributes('aria-label')).not.toContain('left-click')
    expect(cells[0]!.attributes('aria-label')).toContain('right-click screen')
    expect(rangeHint(wrapper)?.attributes('aria-label')).toContain(
      'a character reaches colors 0–7 only',
    )
  })

  it('opens all sixteen up for the 4-bit registers', async () => {
    const { wrapper, editor } = mountPicker()
    editor.setActiveSlot('screen')
    await wrapper.vm.$nextTick()
    expect(swatches(wrapper).every((s) => s.attributes('disabled') === undefined)).toBe(true)
    expect(rangeHint(wrapper)).toBeUndefined()
  })

  it('lists a hires cell’s two slots, then mirrors the border register in', () => {
    const { wrapper } = mountPicker()
    expect(chipLabels(wrapper)).toEqual(['Screen', 'Character', 'Border'])
  })

  it('lists a multicolor cell’s four slots in pixel-value order, none mirrored', () => {
    const { wrapper } = mountPicker({ type: 'multicolor' })
    expect(chipLabels(wrapper)).toEqual(['Screen', 'Border', 'Character', 'Auxiliary'])
    // The bit pattern each slot draws, which is the point of the ordering
    expect(chips(wrapper).map((chip) => chip.attributes('aria-label'))).toEqual([
      expect.stringContaining('pixel value 00'),
      expect.stringContaining('pixel value 01'),
      expect.stringContaining('pixel value 10'),
      expect.stringContaining('pixel value 11'),
    ])
  })

  it('targets a mirrored register without pointing the brush at it', async () => {
    const { wrapper, projects, editor } = mountPicker()
    await chips(wrapper)[2]!.trigger('click') // Border

    expect(editor.targetSlot).toBe('border')
    expect(editor.activeSlot).toBe('fg') // a hires cell has no border pixel
    expect(editor.activeValue).toBe(1)

    await press(wrapper, 5)
    expect(projects.current!.settings.borderColor).toBe(5)
    expect(editor.undoLabel).toBe('Set Border Color')
  })

  it('refuses colors 8–15 for the border even if a swatch is clicked', async () => {
    const { wrapper, projects, editor } = mountPicker()
    await chips(wrapper)[2]!.trigger('click')
    await press(wrapper, 12)
    expect(projects.current!.settings.borderColor).toBe(3) // unchanged default
    expect(editor.canUndo).toBe(false)
  })

  it('paints the brush color on left click and the screen color on right', async () => {
    const { wrapper, projects, editor } = mountPicker()
    await press(wrapper, 2)
    expect(editor.fgColor).toBe(2)

    await press(wrapper, 9, 2)
    expect(projects.current!.settings.screenColor).toBe(9)
    expect(editor.fgColor).toBe(2) // right-click never retargets the swatches
    expect(editor.targetSlot).toBe('fg')
  })

  it('badges every swatch a rail slot currently holds', async () => {
    const { wrapper, editor } = mountPicker()
    // Defaults: screen white (1), character blue (6), border cyan (3)
    expect(swatches(wrapper)[1]!.text()).toBe('S')
    expect(swatches(wrapper)[6]!.text()).toBe('C')
    expect(swatches(wrapper)[3]!.text()).toBe('B')

    editor.setColor('fg', 1)
    await wrapper.vm.$nextTick()
    expect(swatches(wrapper)[1]!.text()).toBe('SC')
  })

  /**
   * Phase 11's accessibility bar: a swatch is a color and nothing else on
   * screen, so its name has to carry what it is — not just its hex.
   */
  it('names every swatch, so color is never the only cue', () => {
    const { wrapper } = mountPicker()
    const names = swatches(wrapper).map((s) => s.attributes('aria-label') ?? '')
    expect(names).toHaveLength(PALETTE.length)
    for (const [index, entry] of PALETTE.entries()) {
      expect(names[index]).toContain(entry.name)
    }
  })
})
