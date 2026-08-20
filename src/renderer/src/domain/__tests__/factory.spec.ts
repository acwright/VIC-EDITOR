import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEED,
  blankCharset,
  blankPattern,
  blankScreen,
  createProject,
  defaultSettings,
  seedAvailable,
  seedCharset,
} from '../factory'
import { DEFAULT_FG } from '../palette'
import { romCharset } from '../romCharset'
import { EMPTY_CELL } from '../screenOps'

describe('factory', () => {
  it('blankPattern is one zero byte per pixel row', () => {
    expect(blankPattern(8)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(blankPattern(16)).toHaveLength(16)
  })

  it('blankCharset is distinct blank patterns', () => {
    const charset = blankCharset(256, 8)
    expect(charset).toHaveLength(256)
    expect(charset[0]).toEqual(blankPattern(8))
    expect(charset[0]).not.toBe(charset[1]) // no shared references
  })

  it('blankScreen sizes both arrays to the geometry', () => {
    const settings = { ...defaultSettings(), columns: 4, rows: 3 }
    const screen = blankScreen('S', settings)
    expect(screen.cells).toEqual(Array.from({ length: 12 }, () => EMPTY_CELL))
    expect(screen.colors).toEqual(Array.from({ length: 12 }, () => DEFAULT_FG))
  })

  it('defaults to the machine’s power-on state (PLAN.md §2.3, §2.4)', () => {
    expect(defaultSettings()).toEqual({
      columns: 22,
      rows: 23,
      charHeight: 8,
      charCount: 256,
      video: 'ntsc',
      screenColor: 1, // White
      borderColor: 3, // Cyan
      auxColor: 0,
      reverse: false,
      expansion: 'none',
      charBase: 15, // $1C00 — RAM the charset can be copied to
      screenBase: 0x1e00,
    })
  })

  it('creates a project with one charset and one blue-on-white screen', () => {
    const p = createProject({ seed: 'blank', name: 'Test', type: 'hires' })
    expect(p.version).toBe(1)
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(p.name).toBe('Test')
    expect(p.type).toBe('hires')
    expect(Date.parse(p.createdAt)).not.toBeNaN()
    expect(p.modifiedAt).toBe(p.createdAt)
    expect(p.settings).toEqual(defaultSettings())
    expect(p.charset).toHaveLength(256)
    expect(p.charset[0]).toHaveLength(8)
    expect(p.screens).toHaveLength(1)
    expect(p.screens[0]?.name).toBe('Screen 1')
    expect(p.screens[0]?.cells).toEqual(Array.from({ length: 506 }, () => EMPTY_CELL))
    expect(p.screens[0]?.colors).toEqual(Array.from({ length: 506 }, () => DEFAULT_FG))
  })

  it('applies settings overrides to the charset and screens', () => {
    const p = createProject({
      seed: 'blank',
      name: 'Tall',
      type: 'hires',
      settings: { charHeight: 16, charCount: 64, columns: 16, rows: 16 },
    })
    expect(p.charset).toHaveLength(64)
    expect(p.charset[0]).toHaveLength(16)
    expect(p.screens[0]?.cells).toHaveLength(256)
  })

  it('carries per-character modes only in `mixed` (D2)', () => {
    expect(createProject({ seed: 'blank', name: 'H', type: 'hires' }).charModes).toBeUndefined()
    expect(
      createProject({ seed: 'blank', name: 'M', type: 'multicolor' }).charModes,
    ).toBeUndefined()
    const mixed = createProject({ seed: 'blank', name: 'X', type: 'mixed' })
    expect(mixed.charModes).toEqual(Array.from({ length: 256 }, () => false))
  })

  describe('character set seed (D15, D16a, D16b)', () => {
    it('defaults to the ROM uppercase set, so a new project can be typed into', () => {
      expect(DEFAULT_SEED).toBe('rom-upper')
      const p = createProject({ name: 'Seeded', type: 'hires' })
      expect(p.charset).toEqual(romCharset('upper', 256))
    })

    it('seeds each count from the chosen set', () => {
      expect(seedCharset('rom-upper', 64, 8)).toEqual(romCharset('upper', 64))
      expect(seedCharset('rom-lower', 128, 8)).toEqual(romCharset('lower', 128))
      expect(seedCharset('rom-lower', 256, 8)).toEqual(romCharset('lower', 256))
    })

    it('starts blank when asked to', () => {
      expect(seedCharset('blank', 64, 8)).toEqual(blankCharset(64, 8))
      expect(createProject({ name: 'B', type: 'hires', seed: 'blank' }).charset).toEqual(
        blankCharset(256, 8),
      )
    })

    it('falls back to blank at 16 rows rather than stretching the font (D16b)', () => {
      expect(seedAvailable('rom-upper', 8)).toBe(true)
      expect(seedAvailable('rom-upper', 16)).toBe(false)
      expect(seedAvailable('blank', 16)).toBe(true)

      const tall = createProject({
        name: 'Tall',
        type: 'hires',
        seed: 'rom-upper',
        settings: { charHeight: 16 },
      })
      expect(tall.charset).toEqual(blankCharset(256, 16))
    })

    it('gives each project its own patterns', () => {
      const a = createProject({ name: 'A', type: 'hires' })
      const b = createProject({ name: 'B', type: 'hires' })
      a.charset[1]![0] = 0xff
      expect(b.charset[1]).not.toEqual(a.charset[1])
    })
  })

  it('generates unique ids', () => {
    const a = createProject({ seed: 'blank', name: 'A', type: 'hires' })
    const b = createProject({ seed: 'blank', name: 'B', type: 'hires' })
    expect(a.id).not.toBe(b.id)
  })
})
