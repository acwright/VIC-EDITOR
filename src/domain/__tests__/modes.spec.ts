import { describe, expect, it } from 'vitest'
import {
  CHAR_COUNTS,
  CHAR_HEIGHTS,
  MODES,
  PROJECT_TYPES,
  cellBitDepth,
  cellCount,
  cellPixelWidth,
  cellShape,
  isCharMulticolor,
  isProjectType,
  patternBytes,
} from '../modes'
import { createProject, defaultSettings } from '../factory'

describe('modes', () => {
  it('describes how each type reads a cell (PLAN.md §2.2)', () => {
    expect(MODES.hires).toMatchObject({ bpp: 1, pixelWidth: 8, perCharMode: false })
    expect(MODES.multicolor).toMatchObject({ bpp: 2, pixelWidth: 4, perCharMode: false })
    // In `mixed` the character carries the flag, so the type cannot say (D2).
    expect(MODES.mixed).toMatchObject({ bpp: null, pixelWidth: null, perCharMode: true })
  })

  it('offers both char heights and all three set sizes (D3, D4)', () => {
    expect(CHAR_HEIGHTS).toEqual([8, 16])
    expect(CHAR_COUNTS).toEqual([64, 128, 256])
  })

  describe('PROJECT_TYPES', () => {
    it('lists every type in MODES', () => {
      expect(PROJECT_TYPES).toEqual(['hires', 'multicolor', 'mixed'])
    })

    it('recognizes every type and rejects everything else', () => {
      for (const type of PROJECT_TYPES) expect(isProjectType(type)).toBe(true)
      expect(isProjectType('graphics1')).toBe(false)
      expect(isProjectType('')).toBe(false)
      expect(isProjectType(undefined)).toBe(false)
      expect(isProjectType(7)).toBe(false)
      // Prototype members must not pass as types.
      expect(isProjectType('toString')).toBe(false)
      expect(isProjectType('constructor')).toBe(false)
    })
  })

  describe('geometry helpers', () => {
    it('cellCount multiplies the programmable geometry', () => {
      expect(cellCount(defaultSettings())).toBe(506) // the power-on 22 × 23
      expect(cellCount({ ...defaultSettings(), columns: 16, rows: 16 })).toBe(256)
    })

    it('patternBytes is one byte per pixel row', () => {
      expect(patternBytes(8)).toBe(8)
      expect(patternBytes(16)).toBe(16)
    })

    it('a multicolor cell is 4 pixels of 2 bits, hires 8 pixels of 1', () => {
      expect(cellBitDepth('hires')).toBe(1)
      expect(cellPixelWidth('hires')).toBe(8)
      expect(cellBitDepth('multicolor')).toBe(2)
      expect(cellPixelWidth('multicolor')).toBe(4)
      expect(cellPixelWidth('mixed', true)).toBe(4)
      expect(cellPixelWidth('mixed', false)).toBe(8)
    })
  })

  describe('isCharMulticolor', () => {
    it('is fixed by the type outside `mixed`', () => {
      expect(isCharMulticolor(createProject({ seed: 'blank', name: 'H', type: 'hires' }), 0)).toBe(
        false,
      )
      expect(
        isCharMulticolor(createProject({ seed: 'blank', name: 'M', type: 'multicolor' }), 0),
      ).toBe(true)
    })

    it('follows the per-character flag in `mixed` (D2)', () => {
      const project = createProject({ seed: 'blank', name: 'X', type: 'mixed' })
      expect(project.charModes).toHaveLength(256)
      project.charModes![5] = true
      expect(isCharMulticolor(project, 5)).toBe(true)
      expect(isCharMulticolor(project, 6)).toBe(false)
    })
  })

  describe('cellShape', () => {
    it('takes width and depth from the character, height from the project', () => {
      const project = createProject({
        seed: 'blank',
        name: 'X',
        type: 'mixed',
        settings: { charHeight: 16 },
      })
      project.charModes![1] = true
      expect(cellShape(project, 0)).toEqual({ width: 8, height: 16, bpp: 1 })
      expect(cellShape(project, 1)).toEqual({ width: 4, height: 16, bpp: 2 })
    })
  })
})
