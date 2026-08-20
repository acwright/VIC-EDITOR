import { describe, expect, it } from 'vitest'
import { SAMPLES } from '../index'
import { multicolorPattern, pattern, screenCode } from '../paint'
import { deserializeProject, serializeProject, validateProject } from '@/domain/serialization'
import { cellCount, isCharMulticolor } from '@/domain/modes'
import { EMPTY_CELL } from '@/domain/screenOps'
import {
  ASM_DIALECT_LIST,
  DEFAULT_BASIC_OPTIONS,
  availableSegments,
  segmentsToAsm,
  segmentsToBasic,
  segmentsToBinary,
  segmentsToPrg,
} from '@/domain/export'

/**
 * Phase 8's bar for a sample: it loads, renders, exports without error, and
 * round-trips through serialization. "Renders" is the one that needs unpacking
 * — a sample that places a character it never drew looks like an empty screen,
 * which is exactly the failure a hand-authored fixture makes silently.
 */
describe('samples', () => {
  it.each(SAMPLES)('$name builds a schema-valid project', (sample) => {
    expect(() => validateProject(sample.build())).not.toThrow()
  })

  it('builds independent projects with unique ids on each call', () => {
    const a = SAMPLES[0]!.build()
    const b = SAMPLES[0]!.build()
    expect(a.id).not.toBe(b.id)
    a.name = 'changed'
    a.charset[1]![0] = 0xff
    expect(b.name).not.toBe('changed')
    expect(b.charset[1]).not.toEqual(a.charset[1])
  })

  it.each(SAMPLES)('$name places content on the screen', (sample) => {
    const project = sample.build()
    expect(project.screens[0]!.cells.some((c) => c !== EMPTY_CELL)).toBe(true)
  })

  it.each(SAMPLES)('$name only references in-bounds character codes', (sample) => {
    const project = sample.build()
    expect(project.screens[0]!.cells).toHaveLength(cellCount(project.settings))
    expect(
      project.screens[0]!.cells.every(
        (c) => Number.isInteger(c) && c >= 0 && c < project.settings.charCount,
      ),
    ).toBe(true)
  })

  it.each(SAMPLES)('$name draws the characters it places', (sample) => {
    const project = sample.build()
    const used = new Set(project.screens[0]!.cells.filter((c) => c !== EMPTY_CELL))
    expect(used.size).toBeGreaterThan(0)
    for (const code of used) {
      expect(
        project.charset[code]!.some((byte) => byte !== 0),
        `char ${code} is blank`,
      ).toBe(true)
    }
  })

  it.each(SAMPLES)('$name round-trips through serialization byte for byte', (sample) => {
    const project = sample.build()
    const json = serializeProject(project)
    expect(deserializeProject(json)).toEqual(project)
    expect(serializeProject(deserializeProject(json))).toBe(json)
  })

  it.each(SAMPLES)('$name exports in every format without error', (sample) => {
    const project = sample.build()
    for (const scope of ['charset', 'screen'] as const) {
      const segments = availableSegments(project, scope, [0])
      expect(segments.length).toBeGreaterThan(0)
      expect(segments.every((segment) => segment.bytes.every((b) => b >= 0 && b <= 255))).toBe(true)

      for (const dialect of ASM_DIALECT_LIST) {
        expect(segmentsToAsm(segments, dialect, project.name).length).toBeGreaterThan(0)
      }
      expect(segmentsToBasic(segments, DEFAULT_BASIC_OPTIONS, project.name).length).toBeGreaterThan(
        0,
      )
      const binary = segmentsToBinary(segments)
      expect(segmentsToPrg(segments)).toHaveLength(binary.length + 2)
    }
  })

  it.each(SAMPLES)('$name names the feature it demonstrates', (sample) => {
    expect(sample.description.length).toBeGreaterThan(30)
    expect(sample.name.length).toBeGreaterThan(0)
  })

  it('covers all three project types and a non-default geometry (PLAN.md Phase 8)', () => {
    const projects = SAMPLES.map((sample) => sample.build())
    expect(new Set(projects.map((p) => p.type))).toEqual(new Set(['hires', 'multicolor', 'mixed']))
    expect(
      projects.some((p) => p.settings.columns !== 22 || p.settings.rows !== 23),
      'no sample uses non-default geometry',
    ).toBe(true)
    expect(new Set(SAMPLES.map((s) => s.id)).size).toBe(SAMPLES.length)
  })

  it('the multicolor sample draws with the border color, which is the quirk it is for', () => {
    const project = SAMPLES.find((s) => s.id === 'night-landscape')!.build()
    const used = new Set(project.screens[0]!.cells)
    // Pixel value 01 in a multicolor cell reads the border register (§2.2)
    const drawsBorder = [...used].some((code) =>
      project.charset[code]!.some((byte) => {
        for (let shift = 0; shift <= 6; shift += 2) if (((byte >> shift) & 3) === 1) return true
        return false
      }),
    )
    expect(drawsBorder).toBe(true)
  })

  it('the mixed sample marks only its artwork tiles multicolor (D2)', () => {
    const project = SAMPLES.find((s) => s.id === 'dungeon')!.build()
    expect(project.type).toBe('mixed')
    const multicolor = project.charModes!.filter(Boolean).length
    expect(multicolor).toBeGreaterThan(0)
    expect(multicolor).toBeLessThan(project.settings.charCount)

    // The text on screen must still be hires, or the ROM glyphs read as mush
    const textCodes = project.screens[0]!.cells.filter((c) => c >= 1 && c <= 26)
    expect(textCodes.length).toBeGreaterThan(0)
    expect(textCodes.every((code) => !isCharMulticolor(project, code))).toBe(true)
  })
})

describe('sample authoring helpers', () => {
  it('folds letters to screen codes, which are not PETSCII', () => {
    expect(screenCode('@')).toBe(0)
    expect(screenCode('A')).toBe(1)
    expect(screenCode('a')).toBe(1)
    expect(screenCode('Z')).toBe(26)
    expect(screenCode(' ')).toBe(32)
    expect(screenCode('0')).toBe(48)
    expect(screenCode('?')).toBe(63)
  })

  it('packs hires rows MSB first', () => {
    expect(pattern(['#.......', '.......#', '########', '........'])).toEqual([0x80, 0x01, 0xff, 0])
  })

  it('packs four multicolor pixels of two bits, most significant first', () => {
    expect(multicolorPattern(['0123'])).toEqual([0b00011011])
    expect(multicolorPattern(['3333', '0000'])).toEqual([0xff, 0x00])
  })
})
