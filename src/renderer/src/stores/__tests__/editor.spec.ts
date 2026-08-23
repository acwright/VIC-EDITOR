import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as charOps from '@/domain/charOps'
import type { CellShape } from '@/domain/modes'
import { DEFAULT_FG } from '@/domain/palette'
import { EMPTY_CELL } from '@/domain/screenOps'
import { defaultSettings, type CreateProjectOptions } from '@/domain/factory'
import { pixelAspect } from '@/domain/vic'
import { openTestProject } from '@/testing/project'
import { useEditorStore } from '../editor'
import { useProjectsStore } from '../projects'

function setup(options: Partial<CreateProjectOptions> = {}) {
  localStorage.clear()
  setActivePinia(createPinia())
  const projects = useProjectsStore()
  const editor = useEditorStore()
  openTestProject({ name: 'Test', seed: 'blank', type: 'hires', ...options })
  editor.reset()
  return { projects, editor }
}

const COLUMNS = defaultSettings().columns

/** The default project's cell shape: 8 × 8, 1 bit per pixel. */
const SHAPE: CellShape = { width: 8, height: 8, bpp: 1 }

describe('editor store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('exposes the selected character pattern', () => {
    const { editor } = setup()
    expect(editor.currentPattern).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('selectChar wraps around 0–255', () => {
    const { editor } = setup()
    editor.selectChar(-1)
    expect(editor.selectedChar).toBe(255)
    editor.selectChar(256)
    expect(editor.selectedChar).toBe(0)
  })

  describe('transforms', () => {
    it('applies a transform as an undoable command', () => {
      const { editor } = setup()
      editor.applyTransform('fill')
      expect(editor.currentPattern).toEqual(charOps.fill(SHAPE))
      expect(editor.canUndo).toBe(true)
      expect(editor.undoLabel).toBe('Fill')

      expect(editor.undo()).toBe('Fill')
      expect(editor.currentPattern).toEqual(charOps.clear(SHAPE))
      expect(editor.redo()).toBe('Fill')
      expect(editor.currentPattern).toEqual(charOps.fill(SHAPE))
    })

    it('marks the project dirty', () => {
      const { projects, editor } = setup()
      expect(projects.saveState).toBe('saved')
      editor.applyTransform('fill')
      expect(projects.saveState).toBe('unsaved')
    })

    it('undo targets the edited character even after the selection moves', () => {
      const { projects, editor } = setup()
      editor.applyTransform('fill')
      editor.selectChar(9)
      editor.undo()
      expect(projects.current?.charset[0]).toEqual(charOps.clear(SHAPE))
      expect(projects.current?.charset[9]).toEqual(charOps.clear(SHAPE))
    })

    it('refuses transforms the cell shape cannot express (D3, §2.2)', () => {
      const { editor } = setup()
      expect(editor.transformEnabled('invert', editor.currentShape)).toBe(true)
      expect(editor.transformEnabled('rotateRight', editor.currentShape)).toBe(true)
      // A multicolor cell has four color slots and half the width: neither
      // inverting nor rotating it is defined.
      const multicolor: CellShape = { width: 4, height: 8, bpp: 2 }
      expect(editor.transformEnabled('invert', multicolor)).toBe(false)
      expect(editor.transformEnabled('rotateLeft', multicolor)).toBe(false)
      expect(editor.transformEnabled('flipH', multicolor)).toBe(true)
    })

    it('says why a transform is unavailable, and nothing when it is', () => {
      const { editor } = setup()
      const multicolor: CellShape = { width: 4, height: 8, bpp: 2 }
      const tall: CellShape = { width: 8, height: 16, bpp: 1 }
      expect(editor.transformReason('invert', editor.currentShape)).toBeNull()
      expect(editor.transformReason('invert', multicolor)).toMatch(/complement/)
      expect(editor.transformReason('rotateRight', multicolor)).toMatch(/double-wide/)
      expect(editor.transformReason('rotateRight', tall)).toMatch(/8 × 16/)
      expect(editor.transformReason('rotateLeft', null)).toMatch(/No character/)
    })
  })

  describe('pixel strokes', () => {
    it('paints pixels and coalesces a stroke into one undo entry', () => {
      const { editor } = setup()
      editor.beginStroke('Draw')
      editor.paintPixel(0, 0, 1)
      editor.paintPixel(1, 0, 1)
      editor.paintPixel(2, 0, 1)
      editor.endStroke()

      expect(editor.currentPattern?.[0]).toBe(0b11100000)
      editor.undo()
      expect(editor.currentPattern?.[0]).toBe(0)
      expect(editor.canUndo).toBe(false)
    })

    it('painting an unchanged pixel is not recorded', () => {
      const { editor } = setup()
      editor.beginStroke('Draw')
      editor.paintPixel(0, 0, 0) // already off
      editor.endStroke()
      expect(editor.canUndo).toBe(false)
    })

    it('erase strokes undo as one entry too', () => {
      const { editor } = setup()
      editor.applyTransform('fill')
      editor.beginStroke('Erase')
      editor.paintPixel(0, 0, 0)
      editor.paintPixel(0, 1, 0)
      editor.endStroke()
      editor.undo()
      expect(editor.currentPattern).toEqual(charOps.fill(SHAPE))
    })
  })

  it('reset clears history and selection', () => {
    const { editor } = setup()
    editor.selectChar(42)
    editor.applyTransform('fill')
    editor.reset()
    expect(editor.selectedChar).toBe(0)
    expect(editor.canUndo).toBe(false)
  })

  describe('setCharPattern', () => {
    it('overwrites the selected character undoably', () => {
      const { editor } = setup()
      editor.setCharPattern([1, 2, 3, 4, 5, 6, 7, 8])
      expect(editor.currentPattern).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
      expect(editor.undo()).toBe('Set Bytes')
      expect(editor.currentPattern).toEqual(charOps.clear(SHAPE))
    })

    it('ignores the wrong byte count and identical bytes', () => {
      const { editor } = setup()
      editor.setCharPattern([1, 2, 3])
      editor.setCharPattern(charOps.clear(SHAPE))
      expect(editor.canUndo).toBe(false)
    })
  })

  describe('colors', () => {
    it('tracks the color brush and the project’s color registers', () => {
      const { projects, editor } = setup()
      expect(editor.slotColors).toEqual({ screen: 1, border: 3, fg: DEFAULT_FG, aux: 0 })

      // The brush is tool state — a character has no color of its own (D7).
      editor.setColor('fg', 7)
      expect(editor.fgColor).toBe(7)
      expect(editor.canUndo).toBe(false)

      editor.setColor('screen', 4)
      expect(projects.current!.settings.screenColor).toBe(4)
      expect(editor.slotColors).toEqual({ screen: 4, border: 3, fg: 7, aux: 0 })
    })

    it('register color changes are undoable', () => {
      const { projects, editor } = setup()
      editor.setColor('border', 2)
      expect(editor.undoLabel).toBe('Set Border Color')

      expect(editor.undo()).toBe('Set Border Color')
      expect(projects.current!.settings.borderColor).toBe(3)
      expect(editor.redo()).toBe('Set Border Color')
      expect(projects.current!.settings.borderColor).toBe(2)
    })

    it('no-ops on the same color or an index the slot cannot hold', () => {
      const { editor } = setup()
      editor.setColor('screen', 1) // already white
      editor.setColor('screen', 16) // outside the palette
      editor.setColor('aux', -1)
      // Border and character color are 3-bit fields: 8–15 are unrepresentable.
      editor.setColor('border', 8)
      editor.setColor('fg', 9)
      expect(editor.fgColor).toBe(DEFAULT_FG)
      expect(editor.canUndo).toBe(false)
    })

    it('marks the project dirty', () => {
      const { projects, editor } = setup()
      editor.setColor('aux', 2)
      expect(projects.saveState).toBe('unsaved')
    })

    it('reset returns the brush to the default color', () => {
      const { editor } = setup()
      editor.setColor('fg', 2)
      editor.reset()
      expect(editor.fgColor).toBe(DEFAULT_FG)
    })
  })

  describe('reverse mode', () => {
    it('flips the register bit undoably and swaps the hires slots (§2.2)', () => {
      const { projects, editor } = setup()
      expect(editor.reverse).toBe(false)
      expect(editor.currentSlots).toEqual(['screen', 'fg'])

      editor.setReverse(true)
      expect(projects.current!.settings.reverse).toBe(true)
      expect(editor.currentSlots).toEqual(['fg', 'screen'])
      expect(editor.activeValue).toBe(0)

      expect(editor.undo()).toBe('Enable Reverse')
      expect(editor.reverse).toBe(false)
      expect(editor.redo()).toBe('Enable Reverse')
      expect(editor.reverse).toBe(true)
    })

    it('leaves a multicolor cell’s four slots in place', () => {
      const { editor } = setup({ type: 'multicolor' })
      editor.setReverse(true)
      expect(editor.currentSlots).toEqual(['screen', 'border', 'fg', 'aux'])
    })

    it('no-ops when already in that mode', () => {
      const { editor } = setup()
      editor.setReverse(false)
      expect(editor.canUndo).toBe(false)
    })
  })

  describe('the color brush and pixel values', () => {
    it('offers a hires cell two slots, screen first', () => {
      const { editor } = setup()
      expect(editor.currentSlots).toEqual(['screen', 'fg'])
      expect(editor.activeSlot).toBe('fg')
      expect(editor.activeValue).toBe(1)
      expect(editor.backgroundValue).toBe(0)
    })

    it('swaps the two values in reverse mode — 1 stops meaning color RAM (§2.2)', () => {
      const { projects, editor } = setup()
      projects.current!.settings.reverse = true
      expect(editor.currentSlots).toEqual(['fg', 'screen'])
      expect(editor.activeValue).toBe(0)
      expect(editor.backgroundValue).toBe(1)
    })

    it('offers a multicolor cell all four slots in pixel-value order', () => {
      const { editor } = setup({ type: 'multicolor' })
      expect(editor.currentSlots).toEqual(['screen', 'border', 'fg', 'aux'])
      editor.setActiveSlot('aux')
      expect(editor.activeValue).toBe(3)
      editor.setActiveSlot('border')
      expect(editor.activeValue).toBe(1)
    })

    it('falls back to the character color when the cell has no such slot', () => {
      const { editor } = setup({ type: 'mixed' })
      editor.setCharMode(0, true)
      editor.setActiveSlot('aux')
      expect(editor.activeSlot).toBe('aux')

      // Character 1 is still hires, and hires cells have no auxiliary color.
      editor.selectChar(1)
      expect(editor.activeSlot).toBe('fg')
      expect(editor.activeValue).toBe(1)

      // The choice is remembered, not discarded, when a multicolor cell returns.
      editor.selectChar(0)
      expect(editor.activeSlot).toBe('aux')
    })

    it('keeps the brush off a slot the current cell does not have', () => {
      const { editor } = setup()
      editor.setActiveSlot('border')
      // The swatches now fill the border register, but a hires cell has no
      // border pixel — the brush stays on the character color (Phase 4).
      expect(editor.targetSlot).toBe('border')
      expect(editor.activeSlot).toBe('fg')
      expect(editor.activeValue).toBe(1)
    })

    it('reset returns the swatch target to the character color', () => {
      const { editor } = setup()
      editor.setActiveSlot('border')
      editor.reset()
      expect(editor.targetSlot).toBe('fg')
    })

    it('fill paints the brush, not the highest pixel value', () => {
      const { editor } = setup({ type: 'multicolor' })
      editor.setActiveSlot('border') // pixel value 01
      editor.applyTransform('fill')
      expect(editor.currentPattern).toEqual(Array.from({ length: 8 }, () => 0b01010101))
    })

    it('reset returns the brush to the character color', () => {
      const { editor } = setup({ type: 'multicolor' })
      editor.setActiveSlot('aux')
      editor.reset()
      expect(editor.activeSlot).toBe('fg')
    })
  })

  describe('per-character mode in `mixed` (D2)', () => {
    it('flips a character between hires and multicolor undoably', () => {
      const { projects, editor } = setup({ type: 'mixed' })
      expect(editor.currentMulticolor).toBe(false)
      expect(editor.currentShape).toEqual({ width: 8, height: 8, bpp: 1 })

      editor.setCharMode(0, true)
      expect(editor.currentMulticolor).toBe(true)
      expect(editor.currentShape).toEqual({ width: 4, height: 8, bpp: 2 })
      expect(projects.current!.charModes![0]).toBe(true)

      expect(editor.undo()).toBe('Set Multicolor')
      expect(editor.currentMulticolor).toBe(false)
      expect(editor.redo()).toBe('Set Multicolor')
      expect(editor.currentMulticolor).toBe(true)
    })

    it('leaves the pattern bytes alone — the same bytes simply read differently', () => {
      const { editor } = setup({ type: 'mixed' })
      const pattern = [0b11001010, 1, 2, 3, 4, 5, 6, 7]
      editor.setCharPattern(pattern)
      editor.setCharMode(0, true)
      expect(editor.currentPattern).toEqual(pattern)
      // Read as 4 two-bit pixels, that first byte is 3, 0, 2, 2.
      expect(
        [0, 1, 2, 3].map((x) => charOps.getPixel(pattern, editor.currentShape!, x, 0)),
      ).toEqual([3, 0, 2, 2])
    })

    it('marks the project dirty, and no-ops on the current mode', () => {
      const { projects, editor } = setup({ type: 'mixed' })
      editor.setCharMode(0, false)
      expect(editor.canUndo).toBe(false)

      editor.setCharMode(0, true)
      expect(projects.saveState).toBe('unsaved')
    })

    it('does nothing outside a `mixed` project — the type owns the rendering (D1)', () => {
      const { projects, editor } = setup({ type: 'hires' })
      editor.setCharMode(0, true)
      expect(editor.canUndo).toBe(false)
      expect(projects.current!.charModes).toBeUndefined()
      expect(editor.currentMulticolor).toBe(false)
    })
  })

  describe('screens', () => {
    it('exposes the selected screen', () => {
      const { editor } = setup()
      expect(editor.currentScreen?.name).toBe('Screen 1')
      expect(editor.screenCount).toBe(1)
    })

    it('paints and erases cells as undoable commands', () => {
      const { editor } = setup()
      editor.selectChar(65)
      editor.beginStroke('Draw')
      editor.paintCell(3, 2, { code: editor.selectedChar })
      editor.paintCell(4, 2, { code: editor.selectedChar })
      editor.endStroke()

      const columns = COLUMNS
      expect(editor.currentScreen?.cells[2 * columns + 3]).toBe(65)
      expect(editor.currentScreen?.cells[2 * columns + 4]).toBe(65)

      editor.undo() // whole stroke is one entry
      expect(editor.currentScreen?.cells[2 * columns + 3]).toBe(EMPTY_CELL)
      expect(editor.currentScreen?.cells[2 * columns + 4]).toBe(EMPTY_CELL)
    })

    it('paints color RAM alongside or instead of the character (D7)', () => {
      const { editor } = setup()
      editor.paintCell(1, 1, { color: 5 })
      expect(editor.currentScreen?.colors[COLUMNS + 1]).toBe(5)
      expect(editor.currentScreen?.cells[COLUMNS + 1]).toBe(EMPTY_CELL)

      editor.paintCell(1, 1, { code: 3, color: 7 })
      expect(editor.currentScreen?.cells[COLUMNS + 1]).toBe(3)
      expect(editor.currentScreen?.colors[COLUMNS + 1]).toBe(7)
    })

    it('painting an unchanged cell is not recorded', () => {
      const { editor } = setup()
      editor.beginStroke('Erase')
      editor.paintCell(0, 0, { code: EMPTY_CELL }) // already empty
      editor.endStroke()
      expect(editor.canUndo).toBe(false)
    })

    it('screen transforms go through the command layer', () => {
      const { editor } = setup()
      editor.screenTransform('Fill Screen', (data) => ({
        cells: data.cells.map(() => 65),
        colors: data.colors.map(() => 2),
      }))
      expect(editor.currentScreen?.cells.every((c) => c === 65)).toBe(true)
      expect(editor.currentScreen?.colors.every((c) => c === 2)).toBe(true)
      expect(editor.undo()).toBe('Fill Screen')
      expect(editor.currentScreen?.cells.every((c) => c === EMPTY_CELL)).toBe(true)
      expect(editor.currentScreen?.colors.every((c) => c === DEFAULT_FG)).toBe(true)
    })

    it('adds, selects, and undoes screens', () => {
      const { editor } = setup()
      editor.addScreen()
      expect(editor.screenCount).toBe(2)
      expect(editor.selectedScreen).toBe(1)
      expect(editor.currentScreen?.name).toBe('Screen 2')

      editor.undo()
      expect(editor.screenCount).toBe(1)
      expect(editor.selectedScreen).toBe(0)
    })

    it('removes a screen and undo restores it with its contents', () => {
      const { editor } = setup()
      editor.addScreen()
      editor.paintCell(0, 0, { code: 65 }) // draw on screen 2
      editor.removeScreen(1)
      expect(editor.screenCount).toBe(1)
      expect(editor.selectedScreen).toBe(0)

      editor.undo()
      expect(editor.screenCount).toBe(2)
      expect(editor.currentScreen?.cells[0]).toBe(65)
    })

    it('refuses to remove the last screen', () => {
      const { editor } = setup()
      editor.removeScreen(0)
      expect(editor.screenCount).toBe(1)
    })

    it('renames a screen undoably', () => {
      const { editor } = setup()
      editor.renameScreen(0, 'Title Screen')
      expect(editor.currentScreen?.name).toBe('Title Screen')
      editor.undo()
      expect(editor.currentScreen?.name).toBe('Screen 1')
    })

    it('undo of cell edits targets the right screen after switching', () => {
      const { editor } = setup()
      editor.beginStroke('Draw')
      editor.paintCell(0, 0, { code: 65 })
      editor.endStroke()
      editor.addScreen() // now on screen 2

      editor.undo() // undoes Add Screen
      editor.undo() // undoes the draw on screen 1
      expect(editor.currentScreen?.cells[0]).toBe(EMPTY_CELL)
    })

    it('reset restores the screen selection', () => {
      const { editor } = setup()
      editor.addScreen()
      editor.reset()
      expect(editor.selectedScreen).toBe(0)
    })
  })

  describe('the screen brush (D7)', () => {
    it('paints the character alone, the color alone, or both', () => {
      const { editor } = setup()
      editor.selectChar(65)
      editor.setColor('fg', 2)

      expect(editor.brushMode).toBe('char')
      expect(editor.brushPaint).toEqual({ code: 65 })

      editor.setBrushMode('color')
      expect(editor.brushPaint).toEqual({ color: 2 })

      editor.setBrushMode('both')
      expect(editor.brushPaint).toEqual({ code: 65, color: 2 })
    })

    it('recolors a cell without disturbing the character under it', () => {
      const { editor } = setup()
      editor.selectChar(65)
      editor.setBrushMode('both')
      editor.paintCell(0, 0, editor.brushPaint)

      editor.setColor('fg', 4)
      editor.setBrushMode('color')
      editor.paintCell(0, 0, editor.brushPaint)

      expect(editor.currentScreen?.cells[0]).toBe(65)
      expect(editor.currentScreen?.colors[0]).toBe(4)
      expect(editor.undoLabel).toBe('Recolor Cell')
    })

    it('undo restores both the character and its color', () => {
      const { editor } = setup()
      editor.selectChar(65)
      editor.setColor('fg', 2)
      editor.setBrushMode('both')
      editor.paintCell(3, 1, editor.brushPaint)
      expect(editor.undoLabel).toBe('Paint Cell')

      editor.undo()
      const index = 1 * COLUMNS + 3
      expect(editor.currentScreen?.cells[index]).toBe(EMPTY_CELL)
      expect(editor.currentScreen?.colors[index]).toBe(DEFAULT_FG)
    })

    it('erases the layers the brush writes, and only those', () => {
      const { editor } = setup()
      editor.selectChar(65)
      editor.setColor('fg', 2)
      editor.setBrushMode('both')
      editor.paintCell(0, 0, editor.brushPaint)

      // Color mode: the right button resets color RAM, the character stays
      editor.setBrushMode('color')
      expect(editor.erasePaint).toEqual({ color: DEFAULT_FG })
      editor.paintCell(0, 0, editor.erasePaint)
      expect(editor.currentScreen?.cells[0]).toBe(65)
      expect(editor.currentScreen?.colors[0]).toBe(DEFAULT_FG)

      editor.setBrushMode('char')
      editor.paintCell(0, 0, editor.erasePaint)
      expect(editor.currentScreen?.cells[0]).toBe(EMPTY_CELL)
      expect(editor.undoLabel).toBe('Erase Cell')
    })

    it('fill and clear follow the brush mode', () => {
      const { editor } = setup()
      editor.selectChar(65)
      editor.setColor('fg', 2)

      editor.setBrushMode('color')
      editor.fillScreen()
      expect(editor.undoLabel).toBe('Fill Colors')
      expect(editor.currentScreen?.colors.every((c) => c === 2)).toBe(true)
      expect(editor.currentScreen?.cells.every((c) => c === EMPTY_CELL)).toBe(true)

      editor.setBrushMode('both')
      editor.fillScreen()
      expect(editor.undoLabel).toBe('Fill Screen')
      expect(editor.currentScreen?.cells.every((c) => c === 65)).toBe(true)

      editor.setBrushMode('color')
      editor.clearScreen()
      expect(editor.undoLabel).toBe('Reset Colors')
      expect(editor.currentScreen?.colors.every((c) => c === DEFAULT_FG)).toBe(true)
      expect(editor.currentScreen?.cells.every((c) => c === 65)).toBe(true)

      editor.setBrushMode('char')
      editor.clearScreen()
      expect(editor.currentScreen?.cells.every((c) => c === EMPTY_CELL)).toBe(true)
    })

    it('reset returns the brush to characters', () => {
      const { editor } = setup()
      editor.setBrushMode('color')
      editor.reset()
      expect(editor.brushMode).toBe('char')
    })
  })

  describe('geometry (D8, D9)', () => {
    it('resizes every screen in the project as one undoable command', () => {
      const { editor, projects } = setup()
      editor.addScreen()
      editor.selectScreen(0)
      editor.paintCell(0, 0, { code: 65, color: 2 })
      editor.selectScreen(1)
      editor.paintCell(0, 0, { code: 66, color: 3 })

      expect(editor.setGeometry({ columns: 10, rows: 10 })).toBe(true)
      expect(projects.current!.settings).toMatchObject({ columns: 10, rows: 10 })
      for (const screen of projects.current!.screens) {
        expect(screen.cells).toHaveLength(100)
        expect(screen.colors).toHaveLength(100)
      }
      // Top-left content survives the crop, on both screens
      expect(projects.current!.screens[0]!.cells[0]).toBe(65)
      expect(projects.current!.screens[1]!.colors[0]).toBe(3)
    })

    it('undo restores the old size and the cropped content', () => {
      const { editor, projects } = setup()
      const far = 21 + 22 * COLUMNS // last column, deep enough to be cropped
      editor.paintCell(21, 22, { code: 90, color: 5 })

      editor.setGeometry({ columns: 10, rows: 10 })
      expect(editor.undoLabel).toBe('Resize Screens')
      expect(editor.undo()).toBe('Resize Screens')

      expect(projects.current!.settings).toMatchObject({ columns: 22, rows: 23 })
      expect(editor.currentScreen?.cells[far]).toBe(90)
      expect(editor.currentScreen?.colors[far]).toBe(5)
    })

    it('reports how many characters a resize would crop', () => {
      const { editor } = setup()
      editor.paintCell(21, 0, { code: 90 })
      editor.paintCell(0, 22, { code: 91 })
      editor.paintCell(0, 0, { code: 92 })

      expect(editor.resizeLoss({ columns: 10, rows: 10 })).toBe(2)
      expect(editor.resizeLoss({ columns: 22, rows: 23 })).toBe(0)
      expect(editor.resizeLoss({ columns: 31, rows: 16 })).toBe(1)
    })

    it('refuses geometry the chip cannot show, and no-ops when unchanged', () => {
      const { editor, projects } = setup()
      expect(editor.setGeometry({ columns: 31, rows: 32 })).toBe(false) // 992 > 512 cells
      expect(editor.setGeometry({ columns: 0, rows: 10 })).toBe(false)
      expect(editor.setGeometry({ columns: 22, rows: 23 })).toBe(false) // unchanged
      expect(projects.current!.settings).toMatchObject({ columns: 22, rows: 23 })
      expect(editor.canUndo).toBe(false)
    })
  })

  describe('project settings (Phase 6)', () => {
    it('exposes the live register block (D14)', () => {
      const { editor } = setup()
      // The power-on machine with the editor's own charset at $1C00
      expect(editor.registers.slice(0, 6)).toEqual([0x05, 0x19, 0x96, 0x2e, 0x00, 0xff])
      expect(editor.registers[15]).toBe(0x1b)

      editor.setColor('border', 5)
      expect(editor.registers[15]).toBe(0x1d)
    })

    it('sets the video standard undoably, moving the origins with it', () => {
      const { editor, projects } = setup()
      expect(editor.setVideo('pal')).toBe(true)
      expect(projects.current!.settings.video).toBe('pal')
      expect(editor.registers.slice(0, 2)).toEqual([12, 38])

      expect(editor.setVideo('pal')).toBe(false) // unchanged
      expect(editor.undo()).toBe('Set Video Standard')
      expect(editor.registers.slice(0, 2)).toEqual([5, 25])
    })

    it('sets the memory bases undoably, and refuses ones the register cannot hold', () => {
      const { editor, projects } = setup()
      expect(editor.setCharBase(13)).toBe(true)
      expect(editor.registers[5]).toBe(0xfd)
      expect(editor.setCharBase(16)).toBe(false)
      expect(editor.setCharBase(-1)).toBe(false)

      expect(editor.setScreenBase(0x1000)).toBe(true)
      expect(projects.current!.settings.screenBase).toBe(0x1000)
      expect(editor.registers[2]).toBe(22) // matrix A9 clear → color RAM $9400
      expect(editor.setScreenBase(0x1100)).toBe(false) // not 512-byte aligned

      expect(editor.undo()).toBe('Set Screen Memory')
      expect(projects.current!.settings.screenBase).toBe(0x1e00)
    })

    it('fits an expansion without moving memory behind the user (Phase 6)', () => {
      const { editor, projects } = setup()
      expect(editor.memoryIsPreset).toBe(true)

      expect(editor.setExpansion('8k')).toBe(true)
      // The bases stay where they were; the +8 K layout is only *offered*
      expect(projects.current!.settings).toMatchObject({
        expansion: '8k',
        screenBase: 0x1e00,
        charBase: 15,
      })
      expect(editor.memoryIsPreset).toBe(false)
      expect(editor.memoryPreset).toMatchObject({ screenBase: 0x1000, charBase: 13 })

      expect(editor.applyMemoryPreset()).toBe(true)
      expect(projects.current!.settings).toMatchObject({ screenBase: 0x1000, charBase: 13 })
      expect(editor.memoryIsPreset).toBe(true)

      expect(editor.undo()).toBe('Apply Memory Preset')
      expect(projects.current!.settings).toMatchObject({ screenBase: 0x1e00, charBase: 15 })
    })

    describe('character height (D3)', () => {
      it('pads every glyph when it grows, and undoes as one command', () => {
        const { editor, projects } = setup()
        editor.applyTransform('fill')

        expect(editor.setCharHeight(16)).toBe(true)
        expect(projects.current!.settings.charHeight).toBe(16)
        expect(editor.currentShape).toEqual({ width: 8, height: 16, bpp: 1 })
        expect(editor.currentPattern).toEqual([...Array(8).fill(0xff), ...Array(8).fill(0)])
        expect(projects.current!.charset.every((p) => p.length === 16)).toBe(true)

        expect(editor.undo()).toBe('Set Character Height')
        expect(projects.current!.settings.charHeight).toBe(8)
        expect(editor.currentPattern).toEqual(Array(8).fill(0xff))
      })

      it('drops the rows a shrink cannot keep, and says how many glyphs lose them', () => {
        const { editor, projects } = setup({ settings: { charHeight: 16 } })
        editor.applyTransform('fill')
        editor.selectChar(1)
        editor.paintPixel(0, 3, 1) // above the fold — survives

        expect(editor.charHeightLoss(8)).toBe(1)
        expect(editor.charHeightLoss(16)).toBe(0)

        expect(editor.setCharHeight(8)).toBe(true)
        expect(projects.current!.charset[0]).toEqual(Array(8).fill(0xff))
        expect(projects.current!.charset[1]![3]).toBe(0x80)

        editor.undo()
        expect(projects.current!.charset[0]).toEqual(Array(16).fill(0xff))
      })

      it('no-ops when the height is already what was asked for', () => {
        const { editor } = setup()
        expect(editor.setCharHeight(8)).toBe(false)
        expect(editor.canUndo).toBe(false)
      })
    })

    describe('character count (D4)', () => {
      it('pads the set when it grows, keeping the glyphs already drawn', () => {
        const { editor, projects } = setup({ settings: { charCount: 64 } })
        editor.selectChar(63)
        editor.applyTransform('fill')

        expect(editor.setCharCount(128)).toBe(true)
        expect(projects.current!.charset).toHaveLength(128)
        expect(projects.current!.charset[63]).toEqual(Array(8).fill(0xff))
        expect(projects.current!.charset[127]).toEqual(Array(8).fill(0))
      })

      it('discards the glyphs above the new last code, and counts them first', () => {
        const { editor, projects } = setup()
        editor.selectChar(200)
        editor.applyTransform('fill')
        editor.selectChar(60)
        editor.applyTransform('fill')

        expect(editor.charCountLoss(128)).toBe(1)
        expect(editor.charCountLoss(64)).toBe(1)
        expect(editor.charCountLoss(256)).toBe(0)

        editor.selectChar(200)
        expect(editor.setCharCount(64)).toBe(true)
        expect(projects.current!.charset).toHaveLength(64)
        expect(projects.current!.settings.charCount).toBe(64)
        // The selection cannot point past the set any more
        expect(editor.selectedChar).toBe(63)
        expect(projects.current!.charset[60]).toEqual(Array(8).fill(0xff))

        expect(editor.undo()).toBe('Set Character Count')
        expect(projects.current!.charset).toHaveLength(256)
        expect(projects.current!.charset[200]).toEqual(Array(8).fill(0xff))
      })

      it('resizes the per-character mode flags alongside the set (D2)', () => {
        const { editor, projects } = setup({ type: 'mixed' })
        editor.setCharMode(3, true)

        editor.setCharCount(64)
        expect(projects.current!.charModes).toHaveLength(64)
        expect(projects.current!.charModes![3]).toBe(true)

        editor.setCharCount(256)
        expect(projects.current!.charModes).toHaveLength(256)
        expect(projects.current!.charModes![3]).toBe(true)
        expect(projects.current!.charModes![255]).toBe(false)
      })

      it('leaves screens alone — a screen code is a full byte whatever the set holds', () => {
        const { editor, projects } = setup()
        editor.paintCell(0, 0, { code: 200 })

        editor.setCharCount(64)
        expect(projects.current!.screens[0]!.cells[0]).toBe(200)
      })
    })
  })

  describe('screen view state', () => {
    it('zoomScreen clamps to 1–8 and marks manual zoom', () => {
      const { editor } = setup()
      expect(editor.screenZoomedManually).toBe(false)
      editor.zoomScreen(10)
      expect(editor.screenScale).toBe(8)
      expect(editor.screenZoomedManually).toBe(true)
      editor.zoomScreen(-20)
      expect(editor.screenScale).toBe(1)
    })

    it('fitScreenScale keeps the fraction and clamps without marking manual', () => {
      // Flooring here is what left the screen at 1× in a viewport with room for
      // 1.47×, wasting a third of the width and two thirds of the height.
      const { editor } = setup()
      editor.fitScreenScale(4.7)
      expect(editor.screenScale).toBe(4.7)
      expect(editor.screenZoomedManually).toBe(false)
      editor.fitScreenScale(1.4712)
      expect(editor.screenScale).toBe(1.47)
      editor.fitScreenScale(0.2)
      expect(editor.screenScale).toBe(1)
      editor.fitScreenScale(99)
      expect(editor.screenScale).toBe(8)
    })

    it('zoomScreen steps to whole scales from a fitted fraction', () => {
      const { editor } = setup()
      editor.fitScreenScale(1.47)
      editor.zoomScreen(1)
      expect(editor.screenScale).toBe(2)
      expect(editor.screenZoomedManually).toBe(true)

      editor.fitScreenScale(1.47)
      editor.zoomScreen(-1)
      expect(editor.screenScale).toBe(1)

      editor.fitScreenScale(3.5)
      editor.zoomScreen(-1)
      expect(editor.screenScale).toBe(3)
    })

    it('toggleGrid flips the overlay (default on)', () => {
      const { editor } = setup()
      expect(editor.showGrid).toBe(true)
      editor.toggleGrid()
      expect(editor.showGrid).toBe(false)
    })

    it('opens stretched to this project’s pixel shape, and squares off on toggle', () => {
      const { editor, projects } = setup()
      // The preview shows what the machine shows unless asked otherwise
      expect(editor.aspectCorrected).toBe(true)
      expect(editor.screenAspect).toBeCloseTo(pixelAspect('ntsc'), 5)

      // A PAL project's pixels are wider still, and the stretch follows the setting
      editor.setVideo('pal')
      expect(editor.screenAspect).toBeCloseTo(pixelAspect('pal'), 5)
      expect(projects.current!.settings.video).toBe('pal')

      editor.toggleAspect()
      expect(editor.aspectCorrected).toBe(false)
      expect(editor.screenAspect).toBe(1)

      editor.toggleAspect()
      expect(editor.screenAspect).toBeCloseTo(pixelAspect('pal'), 5)
    })

    it('refitScreen hands the scale back to auto-fit', () => {
      // Manual zoom was a one-way door: nothing but another project cleared it,
      // so a fitted 1.4× could not be returned to once you pressed ±.
      const { editor } = setup()
      editor.zoomScreen(1)
      expect(editor.screenZoomedManually).toBe(true)
      editor.refitScreen()
      expect(editor.screenZoomedManually).toBe(false)
    })

    it('reset clears the manual-zoom flag so the next project auto-fits', () => {
      const { editor } = setup()
      editor.zoomScreen(1)
      editor.reset()
      expect(editor.screenZoomedManually).toBe(false)
    })
  })
})
