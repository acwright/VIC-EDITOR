import { describe, expect, it } from 'vitest'
import { CHARS_PER_BLOCK, ROM_CHARSET_LABELS, ROM_CHAR_HEIGHT, romCharset } from '../romCharset'

/**
 * `romCharset.ts` is generated from `rom/chargen.bin`, and the generator
 * refuses to emit unless the dump passes every check in `rom/README.md`. These
 * tests re-assert the two that a wrong-machine dump would still fail — the `@`
 * and `A` glyph fixtures — against the file that actually ships, so a
 * hand-edited or stale generated module is caught by the suite rather than by
 * someone noticing the font looks off (PLAN.md D16, D16c).
 */

// Screen code 0 and 1 in the VIC-20 901460-03 ROM (rom/README.md § Verification).
const AT_SIGN = [0x1c, 0x22, 0x4a, 0x56, 0x4c, 0x20, 0x1e, 0x00]
const LETTER_A = [0x18, 0x24, 0x42, 0x7e, 0x42, 0x42, 0x42, 0x00]

/** The C64's `A`, which every structural check would happily accept. */
const C64_LETTER_A = [0x18, 0x3c, 0x66, 0x7e, 0x66, 0x66, 0x66, 0x00]

describe('romCharset', () => {
  it('is the VIC-20 font, not the C64 one', () => {
    const upper = romCharset('upper', 256)
    expect(upper[0]).toEqual(AT_SIGN)
    expect(upper[1]).toEqual(LETTER_A)
    expect(upper[1]).not.toEqual(C64_LETTER_A)
  })

  it('is 8 rows per character, whatever the count', () => {
    for (const pattern of romCharset('upper', 256)) {
      expect(pattern).toHaveLength(ROM_CHAR_HEIGHT)
      expect(pattern.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)).toBe(true)
    }
  })

  it('gives 64 and 128 from the head of the chosen block (D16a)', () => {
    const full = romCharset('upper', 128)
    expect(full).toHaveLength(CHARS_PER_BLOCK)
    expect(romCharset('upper', 64)).toEqual(full.slice(0, 64))
    expect(romCharset('upper', 256).slice(0, 128)).toEqual(full)
  })

  it('follows a 256-character set with its reversed block, as the VIC does (D16a)', () => {
    const upper = romCharset('upper', 256)
    expect(upper).toHaveLength(256)
    for (let code = 0; code < 128; code++) {
      const normal = upper[code]!
      const reversed = upper[code + 128]!
      expect(reversed).toEqual(normal.map((byte) => ~byte & 0xff))
    }
  })

  it('offers two different sets', () => {
    const upper = romCharset('upper', 128)
    const lower = romCharset('lower', 128)
    expect(lower).not.toEqual(upper)
    // Both sets share the digits and punctuation at codes 32–63
    expect(lower.slice(32, 64)).toEqual(upper.slice(32, 64))
    expect(Object.keys(ROM_CHARSET_LABELS)).toEqual(['upper', 'lower'])
  })

  it('returns fresh arrays, so editing one project cannot alter the next', () => {
    const first = romCharset('upper', 64)
    first[1]![0] = 0xff
    expect(romCharset('upper', 64)[1]).toEqual(LETTER_A)
  })
})
