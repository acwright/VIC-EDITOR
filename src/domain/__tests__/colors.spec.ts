import { describe, expect, it } from 'vitest'
import {
  cellColorHexes,
  cellColorIndexes,
  cellSlots,
  colorHex,
  resolveCellColors,
  slotColorIndex,
} from '../colors'
import { createProject } from '../factory'
import { DEFAULT_FG, slotRangeNote } from '../palette'

describe('colors', () => {
  describe('colorHex', () => {
    it('maps palette indices to hex', () => {
      expect(colorHex(0)).toBe('#000000')
      expect(colorHex(1)).toBe('#FFFFFF')
      expect(colorHex(15)).toBe('#FFFFC0')
    })

    it('falls back to black for out-of-range indices — nothing is transparent', () => {
      expect(colorHex(16)).toBe('#000000')
      expect(colorHex(-1)).toBe('#000000')
    })
  })

  describe('cellSlots', () => {
    it('orders a hires cell screen then color RAM', () => {
      const project = createProject({ seed: 'blank', name: 'P', type: 'hires' })
      expect(cellSlots(project, false)).toEqual(['screen', 'fg'])
    })

    it('swaps them under reverse mode, so the brush paints value 0', () => {
      const project = createProject({ seed: 'blank', name: 'P', type: 'hires' })
      project.settings.reverse = true
      expect(cellSlots(project, false)).toEqual(['fg', 'screen'])
    })

    it('gives a multicolor cell all four, reverse or not', () => {
      const project = createProject({ seed: 'blank', name: 'P', type: 'multicolor' })
      expect(cellSlots(project, true)).toEqual(['screen', 'border', 'fg', 'aux'])
      project.settings.reverse = true
      expect(cellSlots(project, true)).toEqual(['screen', 'border', 'fg', 'aux'])
    })

    it('returns a fresh array — callers reverse it in place', () => {
      const project = createProject({ seed: 'blank', name: 'P', type: 'hires' })
      cellSlots(project, false).reverse()
      expect(cellSlots(project, false)).toEqual(['screen', 'fg'])
    })
  })

  describe('slotColorIndex', () => {
    it('reads the registers for three slots and the cell for the fourth (D6, D7)', () => {
      const project = createProject({ seed: 'blank', name: 'P', type: 'multicolor' })
      project.settings.screenColor = 1
      project.settings.borderColor = 3
      project.settings.auxColor = 14
      expect(slotColorIndex(project, 'screen', 5)).toBe(1)
      expect(slotColorIndex(project, 'border', 5)).toBe(3)
      expect(slotColorIndex(project, 'aux', 5)).toBe(14)
      expect(slotColorIndex(project, 'fg', 5)).toBe(5)
    })
  })

  describe('cellColorIndexes', () => {
    it('gives a hires cell the screen color then the cell color', () => {
      const project = createProject({ seed: 'blank', name: 'P', type: 'hires' })
      project.settings.screenColor = 1
      expect(cellColorIndexes(project, 6, false)).toEqual([1, 6])
    })

    it('swaps the two in reverse mode, hires only (§2.2)', () => {
      const project = createProject({ seed: 'blank', name: 'P', type: 'hires' })
      project.settings.reverse = true
      expect(cellColorIndexes(project, 6, false)).toEqual([6, 1])
      // 01 is still the border; multicolor cells ignore the reverse bit.
      expect(cellColorIndexes(project, 6, true)).toEqual([1, 3, 6, 0])
    })

    it('reads the border color as multicolor pixel value 01 — the VIC quirk', () => {
      const project = createProject({ seed: 'blank', name: 'P', type: 'multicolor' })
      project.settings.borderColor = 2
      project.settings.auxColor = 14
      expect(cellColorIndexes(project, 7, true)).toEqual([1, 2, 7, 14])
    })
  })

  it('cellColorHexes renders those indices', () => {
    const project = createProject({ seed: 'blank', name: 'P', type: 'hires' })
    expect(cellColorHexes(project, 0, false)).toEqual(['#FFFFFF', '#000000'])
  })

  describe('resolveCellColors', () => {
    it('reads the cell’s own color RAM value', () => {
      const project = createProject({ seed: 'blank', name: 'P', type: 'hires' })
      const screen = project.screens[0]!
      screen.colors[3] = 2 // Red
      expect(resolveCellColors(project, screen, 3)).toEqual(['#FFFFFF', '#782922'])
    })

    it('follows the character’s mode in `mixed` (D2)', () => {
      const project = createProject({ seed: 'blank', name: 'P', type: 'mixed' })
      const screen = project.screens[0]!
      screen.cells[0] = 5
      project.charModes![5] = true
      expect(resolveCellColors(project, screen, 0)).toHaveLength(4)
      expect(resolveCellColors(project, screen, 1)).toHaveLength(2)
    })

    it('falls back to the default color without a screen', () => {
      const project = createProject({ seed: 'blank', name: 'P', type: 'hires' })
      expect(resolveCellColors(project, null, 0)).toEqual(
        cellColorHexes(project, DEFAULT_FG, false),
      )
    })
  })

  describe('slotRangeNote', () => {
    it('explains the 3-bit fields and stays silent about the 4-bit ones (D5)', () => {
      expect(slotRangeNote('fg')).toContain('0–7')
      expect(slotRangeNote('border')).toContain('0–7')
      expect(slotRangeNote('border')).toContain('$900F')
      expect(slotRangeNote('screen')).toBeNull()
      expect(slotRangeNote('aux')).toBeNull()
    })
  })
})
