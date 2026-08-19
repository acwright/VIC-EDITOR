import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../factory'
import {
  CHAR_BASE_OPTIONS,
  EXPANSIONS,
  MAX_CELLS,
  REGISTERS,
  SCREEN_BASE_GRANULARITY,
  SCREEN_BASE_OPTIONS,
  charBaseAddress,
  charBaseValue,
  colorRamAddress,
  defaultOrigins,
  defaultsForExpansion,
  expansionLabel,
  formatRegisterDump,
  registerBytes,
  registerLabel,
  validateGeometry,
} from '../vic'
import type { ProjectSettings } from '../types'

/** The machine as it powers on: ROM chargen at $8000, matrix at $1E00. */
function powerOn(): ProjectSettings {
  return { ...defaultSettings(), charBase: 0, screenBase: 0x1e00 }
}

describe('memory map', () => {
  it('maps chargen selectors to CPU addresses (PLAN.md §2.4)', () => {
    expect(charBaseAddress(0)).toBe(0x8000) // uppercase ROM
    expect(charBaseAddress(1)).toBe(0x8400) // uppercase reversed
    expect(charBaseAddress(2)).toBe(0x8800)
    expect(charBaseAddress(4)).toBe(0x9000)
    expect(charBaseAddress(8)).toBe(0x0000)
    expect(charBaseAddress(13)).toBe(0x1400)
    expect(charBaseAddress(15)).toBe(0x1c00)
  })

  it('charBaseValue inverts charBaseAddress', () => {
    for (let value = 0; value < 16; value++) {
      expect(charBaseValue(charBaseAddress(value))).toBe(value)
    }
  })

  it('puts color RAM where the matrix A9 bit says (§2.4)', () => {
    expect(colorRamAddress(0x1e00)).toBe(0x9600) // unexpanded
    expect(colorRamAddress(0x1000)).toBe(0x9400) // +8 K and above
  })

  it('knows where each expansion puts BASIC, screen and charset', () => {
    expect(defaultsForExpansion('none')).toEqual({
      basicStart: 0x1001,
      screenBase: 0x1e00,
      charBase: 15,
    })
    expect(defaultsForExpansion('3k').basicStart).toBe(0x0401)
    expect(defaultsForExpansion('8k')).toEqual({
      basicStart: 0x1201,
      screenBase: 0x1000,
      charBase: 13,
    })
    expect(defaultsForExpansion('24k')).toEqual(defaultsForExpansion('8k'))
  })

  it('centers the display differently on NTSC and PAL (§2.6)', () => {
    expect(defaultOrigins('ntsc')).toEqual({ horizontal: 5, vertical: 25 })
    expect(defaultOrigins('pal')).toEqual({ horizontal: 12, vertical: 38 })
  })
})

describe('registerBytes', () => {
  it('reproduces the machine’s power-on register block (§2.5)', () => {
    const bytes = registerBytes(powerOn())
    expect(bytes).toHaveLength(16)
    expect(bytes[0]).toBe(0x05) // $9000 horizontal origin 5, interlace off
    expect(bytes[1]).toBe(0x19) // $9001 vertical origin 25
    expect(bytes[2]).toBe(0x96) // $9002 22 columns, color RAM $9600
    expect(bytes[3]).toBe(0x2e) // $9003 23 rows, 8×8 characters
    expect(bytes[5]).toBe(0xf0) // $9005 matrix $1E00, chargen $8000
    expect(bytes[15]).toBe(0x1b) // $900F white screen, normal video, cyan border
  })

  it('leaves the read-only and unmodeled registers at zero', () => {
    const bytes = registerBytes(powerOn())
    expect(bytes[4]).toBe(0) // raster
    expect(bytes.slice(6, 14)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('follows the editor’s own defaults — a custom charset at $1C00', () => {
    expect(registerBytes(defaultSettings())[5]).toBe(0xff)
  })

  it('sets the 8×16 bit and packs rows above it', () => {
    const bytes = registerBytes({ ...powerOn(), charHeight: 16, rows: 12 })
    expect(bytes[3]).toBe((12 << 1) | 1)
  })

  it('clears $900F bit 3 for reverse video — the bit is set for normal', () => {
    expect(registerBytes({ ...powerOn(), reverse: true })[15]).toBe(0x13)
  })

  it('packs the auxiliary color into the high nybble of $900E', () => {
    expect(registerBytes({ ...powerOn(), auxColor: 10 })[14]).toBe(0xa0)
  })

  it('moves matrix A9 into $9002 bit 7 with the screen base', () => {
    const bytes = registerBytes({ ...powerOn(), screenBase: 0x1000 })
    expect(bytes[2]).toBe(22) // A9 clear → color RAM $9400
    expect((bytes[5] ?? 0) >> 4).toBe(0x0c)
  })

  it('uses PAL origins when the project says PAL', () => {
    const bytes = registerBytes({ ...powerOn(), video: 'pal' })
    expect(bytes[0]).toBe(12)
    expect(bytes[1]).toBe(38)
  })
})

describe('validateGeometry', () => {
  it('accepts the default screen and the exact 512-cell budget (D9)', () => {
    expect(validateGeometry({ columns: 22, rows: 23 })).toEqual({
      ok: true,
      cells: 506,
      inRange: true,
      overBudget: false,
      nonDefault: false,
    })
    expect(validateGeometry({ columns: 16, rows: 32 })).toMatchObject({
      ok: true,
      cells: MAX_CELLS,
      overBudget: false,
    })
  })

  it('rejects one cell past the color RAM', () => {
    expect(validateGeometry({ columns: 27, rows: 19 })).toMatchObject({
      ok: false,
      cells: 513,
      overBudget: true,
    })
  })

  it('rejects geometry the registers or display cannot carry', () => {
    expect(validateGeometry({ columns: 32, rows: 1 }).ok).toBe(false)
    expect(validateGeometry({ columns: 1, rows: 33 }).ok).toBe(false)
    expect(validateGeometry({ columns: 0, rows: 10 }).ok).toBe(false)
    expect(validateGeometry({ columns: 10.5, rows: 10 }).ok).toBe(false)
  })

  it('flags legal geometry larger than the power-on screen', () => {
    expect(validateGeometry({ columns: 24, rows: 20 })).toMatchObject({
      ok: true,
      nonDefault: true,
    })
    expect(validateGeometry({ columns: 20, rows: 20 }).nonDefault).toBe(false)
  })
})

describe('the memory-layout choices the settings dialog offers (Phase 6)', () => {
  it('lists every chargen selector with its address and what backs it (§2.4)', () => {
    expect(CHAR_BASE_OPTIONS).toHaveLength(16)
    CHAR_BASE_OPTIONS.forEach((option, index) => {
      expect(option.value).toBe(index)
      expect(option.address).toBe(charBaseAddress(index))
    })
    // 0–3 are the character ROM, 4–7 land in I/O, 8–15 are RAM
    expect(CHAR_BASE_OPTIONS.map((option) => option.kind)).toEqual([
      ...Array.from({ length: 4 }, () => 'rom'),
      ...Array.from({ length: 4 }, () => 'io'),
      ...Array.from({ length: 8 }, () => 'ram'),
    ])
  })

  it('offers the video matrix only the RAM the CPU has, 512-byte granular (§2.3)', () => {
    expect(SCREEN_BASE_OPTIONS).toHaveLength(16)
    expect(SCREEN_BASE_OPTIONS[0]).toBe(0x0000)
    expect(SCREEN_BASE_OPTIONS[SCREEN_BASE_OPTIONS.length - 1]).toBe(0x1e00)
    expect(SCREEN_BASE_OPTIONS.every((base) => base % SCREEN_BASE_GRANULARITY === 0)).toBe(true)
    // The two conventional screens are reachable
    expect(SCREEN_BASE_OPTIONS).toContain(0x1e00) // unexpanded
    expect(SCREEN_BASE_OPTIONS).toContain(0x1000) // +8 K
  })

  it('names every expansion it models', () => {
    expect(EXPANSIONS).toEqual(['none', '3k', '8k', '16k', '24k'])
    expect(expansionLabel('none')).toBe('Unexpanded (5 K)')
    expect(expansionLabel('8k')).toBe('+8 K')
    expect(expansionLabel('24k')).toBe('+24 K')
  })
})

describe('the register readout (D14)', () => {
  it('explains all sixteen registers, in address order', () => {
    expect(REGISTERS).toHaveLength(16)
    REGISTERS.forEach((register, index) => {
      expect(register.address).toBe(0x9000 + index)
      expect(register.description.length).toBeGreaterThan(0)
    })
    expect(registerLabel(0)).toBe('$9000')
    expect(registerLabel(15)).toBe('$900F')
  })

  it('copies the block as an addressed hex dump', () => {
    expect(formatRegisterDump(registerBytes(defaultSettings()))).toBe(
      [
        '; VIC-20 registers $9000-$900F',
        '$9000: 05 19 96 2E 00 FF 00 00',
        '$9008: 00 00 00 00 00 00 00 1B',
      ].join('\n'),
    )
  })
})
