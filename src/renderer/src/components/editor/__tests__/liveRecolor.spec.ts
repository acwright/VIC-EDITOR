import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { CreateProjectOptions } from '@/domain/factory'
import { colorHex } from '@/domain/colors'
import { EMPTY_CELL } from '@/domain/screenOps'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'
import CharacterPanel from '../CharacterPanel.vue'
import CharsetGrid from '../CharsetGrid.vue'
import PixelEditor from '../PixelEditor.vue'
import ScreenCanvas from '../ScreenCanvas.vue'

/**
 * Phase 4's headline claim: changing a global color repaints every surface at
 * once, because the border is a *drawing* color for multicolor cells and not
 * just chrome (PLAN.md Phase 4).
 *
 * jsdom has no 2D context, so these mount a recording one and read back the
 * fills — the colors that would have reached the canvas.
 */
const CYAN = colorHex(3) // the default border
const GREEN = colorHex(5)

/** Every pixel of the character is value `01` — the border color. */
const ALL_BORDER = 0b01010101

let fills: string[] = []

function recordingContext(): CanvasRenderingContext2D {
  let fillStyle = ''
  return {
    get fillStyle() {
      return fillStyle
    },
    set fillStyle(value: string) {
      fillStyle = value
    },
    fillRect: () => void fills.push(fillStyle),
  } as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  fills = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recordingContext())
})

/**
 * A multicolor project whose character 0 is solid border color — and the space
 * too, since a blank screen is full of spaces (`EMPTY_CELL`) and the screen
 * canvas has to have something to draw.
 */
function setup(options: Partial<CreateProjectOptions> = {}) {
  localStorage.clear()
  setActivePinia(createPinia())
  const projects = useProjectsStore()
  const editor = useEditorStore()
  const project = projects.create({ name: 'Test', seed: 'blank', type: 'multicolor', ...options })!
  projects.open(project.id)
  editor.reset()
  const solid = () => Array.from({ length: 8 }, () => ALL_BORDER)
  projects.current!.charset[0] = solid()
  projects.current!.charset[EMPTY_CELL] = solid()
  return { projects, editor }
}

describe('live re-render of the global colors', () => {
  it('recolors the charset picker when the border changes', async () => {
    const { editor } = setup()
    mount(CharsetGrid, { props: { startCode: 0, count: 8 } })
    await nextTick()
    expect(fills).toContain(CYAN)

    fills = []
    editor.setColor('border', 5)
    await nextTick()
    expect(fills).toContain(GREEN)
    expect(fills).not.toContain(CYAN)
  })

  it('recolors the screen canvas when the border changes', async () => {
    const { editor } = setup()
    mount(ScreenCanvas, { props: { scale: 1, showGrid: false } })
    await nextTick()
    expect(fills).toContain(CYAN)

    fills = []
    editor.setColor('border', 5)
    await nextTick()
    expect(fills).toContain(GREEN)
    expect(fills).not.toContain(CYAN)
  })

  it('recolors the pixel editor when the border changes', async () => {
    const { editor } = setup()
    const wrapper = mount(CharacterPanel)
    const palette = () => wrapper.getComponent(PixelEditor).props('palette')
    expect(palette()[1]).toBe(CYAN)

    editor.setColor('border', 5)
    await nextTick()
    expect(palette()[1]).toBe(GREEN)
  })

  it('repaints hires cells when reverse mode flips their two colors (§2.2)', async () => {
    const { projects, editor } = setup({ type: 'hires' })
    // One solid character: every pixel reads color RAM in normal mode…
    projects.current!.charset[0] = Array.from({ length: 8 }, () => 0xff)
    const fg = colorHex(editor.fgColor)
    const screen = colorHex(1)
    mount(CharsetGrid, { props: { startCode: 0, count: 1 } })
    await nextTick()
    expect(fills).toContain(fg)

    // …and the screen color once reverse swaps which value means which.
    fills = []
    editor.setReverse(true)
    await nextTick()
    expect(fills.filter((hex) => hex === fg)).toHaveLength(0)
    expect(fills).toContain(screen)
  })

  it('recolors multicolor cells when the auxiliary color changes', async () => {
    const { projects, editor } = setup()
    projects.current!.charset[0] = Array.from({ length: 8 }, () => 0b11111111)
    mount(CharsetGrid, { props: { startCode: 0, count: 8 } })
    await nextTick()

    fills = []
    editor.setColor('aux', 7)
    await nextTick()
    expect(fills).toContain(colorHex(7))
  })
})
