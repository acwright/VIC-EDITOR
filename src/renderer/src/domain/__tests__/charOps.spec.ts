import { describe, expect, it } from 'vitest'
import * as charOps from '../charOps'
import type { CellShape } from '../modes'

/** The three shapes a VIC character can have (PLAN.md §2.2, D3). */
const HIRES: CellShape = { width: 8, height: 8, bpp: 1 }
const TALL: CellShape = { width: 8, height: 16, bpp: 1 }
const MULTI: CellShape = { width: 4, height: 8, bpp: 2 }

/** Pattern with a single pixel of `value` at (x, y). */
function single(shape: CellShape, x: number, y: number, value = 1): number[] {
  return charOps.setPixel(charOps.clear(shape), shape, x, y, value)
}

describe('charOps', () => {
  describe('getPixel / setPixel', () => {
    it('sets and reads a hires pixel', () => {
      const p = charOps.setPixel(charOps.clear(HIRES), HIRES, 1, 2, 1)
      expect(p[2]).toBe(0x40)
      expect(charOps.getPixel(p, HIRES, 1, 2)).toBe(1)
      expect(charOps.getPixel(p, HIRES, 2, 1)).toBe(0)
    })

    it('sets and reads a 2-bit multicolor pixel', () => {
      const p = charOps.setPixel(charOps.clear(MULTI), MULTI, 0, 0, 3)
      expect(p[0]).toBe(0xc0) // leftmost pixel is the top two bits
      expect(charOps.getPixel(p, MULTI, 0, 0)).toBe(3)
      const q = charOps.setPixel(p, MULTI, 3, 0, 2)
      expect(q[0]).toBe(0xc2)
      expect(charOps.getPixel(q, MULTI, 3, 0)).toBe(2)
    })

    it('overwrites rather than merges an existing pixel value', () => {
      const p = charOps.setPixel(charOps.fill(MULTI), MULTI, 1, 0, 1)
      expect(charOps.getPixel(p, MULTI, 1, 0)).toBe(1)
      expect(charOps.getPixel(p, MULTI, 0, 0)).toBe(3)
    })

    it('clears a pixel', () => {
      const p = charOps.setPixel(charOps.fill(HIRES), HIRES, 0, 0, 0)
      expect(p[0]).toBe(0x7f)
    })

    it('does not mutate its input', () => {
      const before = charOps.clear(HIRES)
      charOps.setPixel(before, HIRES, 3, 3, 1)
      expect(before).toEqual(charOps.clear(HIRES))
    })

    it('MSB is the leftmost pixel', () => {
      expect(charOps.getPixel([0x80, 0, 0, 0, 0, 0, 0, 0], HIRES, 0, 0)).toBe(1)
      expect(charOps.getPixel([0x01, 0, 0, 0, 0, 0, 0, 0], HIRES, 7, 0)).toBe(1)
    })

    it('reaches every row of a 16-tall character', () => {
      const p = single(TALL, 2, 15)
      expect(p).toHaveLength(16)
      expect(charOps.getPixel(p, TALL, 2, 15)).toBe(1)
    })
  })

  describe('fill / clear / invert', () => {
    it('fill sets every pixel to the highest value', () => {
      expect(charOps.fill(HIRES)).toEqual(Array.from({ length: 8 }, () => 0xff))
      expect(charOps.fill(MULTI)[0]).toBe(0xff) // 4 pixels of value 3
    })

    it('fill accepts a pixel value', () => {
      expect(charOps.fill(MULTI, 1)[0]).toBe(0x55)
      expect(charOps.fill(MULTI, 2)[0]).toBe(0xaa)
    })

    it('clear is as many zero bytes as the character is tall', () => {
      expect(charOps.clear(HIRES)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
      expect(charOps.clear(TALL)).toHaveLength(16)
    })

    it('invert flips every bit of a hires character', () => {
      expect(charOps.invert(charOps.clear(HIRES), HIRES)).toEqual(charOps.fill(HIRES))
      expect(charOps.invert([0xf0, 0x0f, 0xaa, 0x55, 0, 0xff, 0x01, 0x80], HIRES)).toEqual([
        0x0f, 0xf0, 0x55, 0xaa, 0xff, 0, 0xfe, 0x7f,
      ])
    })

    it('double invert is identity', () => {
      const p = [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]
      expect(charOps.invert(charOps.invert(p, HIRES), HIRES)).toEqual(p)
    })

    it('leaves multicolor characters alone — four color slots have no complement', () => {
      expect(charOps.canInvert(MULTI)).toBe(false)
      const p = [0x1b, 0, 0, 0, 0, 0, 0, 0]
      expect(charOps.invert(p, MULTI)).toEqual(p)
    })
  })

  describe('shifts (wrapping)', () => {
    it('shiftLeft moves pixels left and wraps column 0 to the last', () => {
      expect(charOps.shiftLeft(single(HIRES, 1, 2), HIRES)).toEqual(single(HIRES, 0, 2))
      expect(charOps.shiftLeft(single(HIRES, 0, 2), HIRES)).toEqual(single(HIRES, 7, 2))
    })

    it('shiftRight moves pixels right and wraps the last column to 0', () => {
      expect(charOps.shiftRight(single(HIRES, 1, 2), HIRES)).toEqual(single(HIRES, 2, 2))
      expect(charOps.shiftRight(single(HIRES, 7, 2), HIRES)).toEqual(single(HIRES, 0, 2))
    })

    it('shifts multicolor by whole 2-bit pixels', () => {
      expect(charOps.shiftLeft(single(MULTI, 1, 2, 3), MULTI)).toEqual(single(MULTI, 0, 2, 3))
      expect(charOps.shiftLeft(single(MULTI, 0, 2, 2), MULTI)).toEqual(single(MULTI, 3, 2, 2))
      expect(charOps.shiftRight(single(MULTI, 3, 2, 1), MULTI)).toEqual(single(MULTI, 0, 2, 1))
    })

    it('shiftUp moves rows up and wraps the top row to the bottom', () => {
      expect(charOps.shiftUp(single(HIRES, 1, 2), HIRES)).toEqual(single(HIRES, 1, 1))
      expect(charOps.shiftUp(single(HIRES, 1, 0), HIRES)).toEqual(single(HIRES, 1, 7))
      expect(charOps.shiftUp(single(TALL, 1, 0), TALL)).toEqual(single(TALL, 1, 15))
    })

    it('shiftDown moves rows down and wraps the bottom row to the top', () => {
      expect(charOps.shiftDown(single(HIRES, 1, 2), HIRES)).toEqual(single(HIRES, 1, 3))
      expect(charOps.shiftDown(single(HIRES, 1, 7), HIRES)).toEqual(single(HIRES, 1, 0))
      expect(charOps.shiftDown(single(TALL, 1, 15), TALL)).toEqual(single(TALL, 1, 0))
    })

    it('opposite shifts cancel', () => {
      const p = [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]
      expect(charOps.shiftRight(charOps.shiftLeft(p, HIRES), HIRES)).toEqual(p)
      expect(charOps.shiftDown(charOps.shiftUp(p, HIRES), HIRES)).toEqual(p)
      expect(charOps.shiftRight(charOps.shiftLeft(p, MULTI), MULTI)).toEqual(p)
    })
  })

  describe('flips', () => {
    it('flipH mirrors left-right', () => {
      expect(charOps.flipH(single(HIRES, 1, 2), HIRES)).toEqual(single(HIRES, 6, 2))
      expect(charOps.flipH([0xf0, 0, 0, 0, 0, 0, 0, 0], HIRES)).toEqual([0x0f, 0, 0, 0, 0, 0, 0, 0])
    })

    it('flipH keeps multicolor pixel values intact while reversing their order', () => {
      // Pixel values 1, 2, 3, 0 → 0, 3, 2, 1.
      expect(charOps.flipH([0b01101100, 0, 0, 0, 0, 0, 0, 0], MULTI)).toEqual([
        0b00111001, 0, 0, 0, 0, 0, 0, 0,
      ])
    })

    it('flipV mirrors top-bottom, over the whole char height', () => {
      expect(charOps.flipV(single(HIRES, 1, 2), HIRES)).toEqual(single(HIRES, 1, 5))
      expect(charOps.flipV(single(TALL, 1, 2), TALL)).toEqual(single(TALL, 1, 13))
    })

    it('double flip is identity', () => {
      const p = [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]
      expect(charOps.flipH(charOps.flipH(p, HIRES), HIRES)).toEqual(p)
      expect(charOps.flipV(charOps.flipV(p, HIRES), HIRES)).toEqual(p)
      expect(charOps.flipH(charOps.flipH(p, MULTI), MULTI)).toEqual(p)
    })
  })

  describe('rotations', () => {
    it('rotateRight moves (x, y) to (7 − y, x)', () => {
      expect(charOps.rotateRight(single(HIRES, 1, 2), HIRES)).toEqual(single(HIRES, 5, 1))
      expect(charOps.rotateRight(single(HIRES, 0, 0), HIRES)).toEqual(single(HIRES, 7, 0))
    })

    it('rotateLeft moves (x, y) to (y, 7 − x)', () => {
      expect(charOps.rotateLeft(single(HIRES, 1, 2), HIRES)).toEqual(single(HIRES, 2, 6))
      expect(charOps.rotateLeft(single(HIRES, 0, 0), HIRES)).toEqual(single(HIRES, 0, 7))
    })

    it('rotateLeft undoes rotateRight', () => {
      const p = [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]
      expect(charOps.rotateLeft(charOps.rotateRight(p, HIRES), HIRES)).toEqual(p)
    })

    it('four rotations are identity', () => {
      const p = [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]
      let q = p
      for (let i = 0; i < 4; i++) q = charOps.rotateRight(q, HIRES)
      expect(q).toEqual(p)
    })

    it('is defined only for square hires cells', () => {
      expect(charOps.canRotate(HIRES)).toBe(true)
      expect(charOps.canRotate(TALL)).toBe(false)
      expect(charOps.canRotate(MULTI)).toBe(false)
      // Forbidden shapes come back untouched rather than mangled.
      const tall = single(TALL, 1, 9)
      expect(charOps.rotateRight(tall, TALL)).toEqual(tall)
      const multi = single(MULTI, 1, 2, 3)
      expect(charOps.rotateLeft(multi, MULTI)).toEqual(multi)
    })
  })
  describe('character height (D3)', () => {
    it('pads a short pattern and truncates a tall one', () => {
      const tall = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
      expect(charOps.setHeight(tall, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
      expect(charOps.setHeight([1, 2], 4)).toEqual([1, 2, 0, 0])
      expect(charOps.setHeight(tall, 16)).toEqual(tall)
    })

    it('reports whether a shrink would discard drawn rows', () => {
      const bottomOnly = charOps.setPixel(charOps.clear(TALL), TALL, 0, 12, 1)
      expect(charOps.drawnBelow(bottomOnly, 8)).toBe(true)
      expect(charOps.drawnBelow(bottomOnly, 16)).toBe(false)
      expect(charOps.drawnBelow(single(TALL, 0, 3), 8)).toBe(false)
    })

    it('knows a blank glyph from a drawn one', () => {
      expect(charOps.isBlank(charOps.clear(HIRES))).toBe(true)
      expect(charOps.isBlank(single(HIRES, 4, 4))).toBe(false)
    })
  })
})
