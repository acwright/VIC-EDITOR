/**
 * Character operations — pure functions over a character's pattern bytes.
 * Every function returns a new array; inputs are never mutated.
 *
 * Each operation takes the cell's {@link CellShape} — width, height and bit
 * depth — because a VIC character is 8 or 16 rows tall and each row is either
 * 8 one-bit pixels or 4 two-bit ones (PLAN.md §2.2, D3). Within a row the most
 * significant bits are the leftmost pixel either way, and `width × bpp` is
 * always 8, which is why the bit shuffling below never has to know which it is.
 *
 * Intended usage: `import * as charOps from './charOps'`.
 */

import type { CellShape } from './modes'
import type { CharPattern } from './types'

const ROW_MASK = 0xff

/** Highest pixel value the cell's bit depth can hold: 1 hires, 3 multicolor. */
export function maxPixelValue(shape: CellShape): number {
  return (1 << shape.bpp) - 1
}

/** Bit offset of pixel `x` within its row byte. */
function shiftFor(shape: CellShape, x: number): number {
  return 8 - shape.bpp * (x + 1)
}

/** `shape.height` rows, padding a short pattern with blanks. */
function rowsOf(pattern: CharPattern, shape: CellShape): number[] {
  return Array.from({ length: shape.height }, (_, y) => (pattern[y] ?? 0) & ROW_MASK)
}

/** Pixel value at (x, y): 0–1 in a hires cell, 0–3 in a multicolor one. */
export function getPixel(pattern: CharPattern, shape: CellShape, x: number, y: number): number {
  return ((pattern[y] ?? 0) >> shiftFor(shape, x)) & maxPixelValue(shape)
}

export function setPixel(
  pattern: CharPattern,
  shape: CellShape,
  x: number,
  y: number,
  value: number,
): CharPattern {
  const next = rowsOf(pattern, shape)
  const shift = shiftFor(shape, x)
  const mask = maxPixelValue(shape) << shift
  next[y] = (((next[y] ?? 0) & ~mask) | ((value << shift) & mask)) & ROW_MASK
  return next
}

/** Every pixel set to `value` (the highest value by default). */
export function fill(shape: CellShape, value: number = maxPixelValue(shape)): CharPattern {
  let row = 0
  for (let x = 0; x < shape.width; x++) row |= (value & maxPixelValue(shape)) << shiftFor(shape, x)
  return Array.from({ length: shape.height }, () => row & ROW_MASK)
}

export function clear(shape: CellShape): CharPattern {
  return Array.from({ length: shape.height }, () => 0)
}

/** True when no pixel of the pattern is set — a glyph nothing would miss. */
export function isBlank(pattern: CharPattern): boolean {
  return pattern.every((row) => (row & ROW_MASK) === 0)
}

/**
 * The same pattern at a new character height (D3). Character height is one
 * register bit and it applies to every glyph at once, so growing pads the
 * bottom with blank rows and shrinking drops them — which is destructive, and
 * why {@link drawnBelow} exists to warn first.
 */
export function setHeight(pattern: CharPattern, height: number): CharPattern {
  return Array.from({ length: height }, (_, y) => (pattern[y] ?? 0) & ROW_MASK)
}

/** True when the pattern has pixels at or below row `height` — rows a shrink would discard. */
export function drawnBelow(pattern: CharPattern, height: number): boolean {
  return !isBlank(pattern.slice(height))
}

/**
 * True where {@link invert} is meaningful. A hires cell has exactly two pixel
 * values to swap; a multicolor cell has four unrelated color slots, so there
 * is no defensible complement — the transform is disabled there rather than
 * given an arbitrary meaning (PLAN.md Phase 2).
 */
export function canInvert(shape: CellShape): boolean {
  return shape.bpp === 1
}

/** Swap set and clear pixels. Returns the pattern unchanged for 2bpp cells. */
export function invert(pattern: CharPattern, shape: CellShape): CharPattern {
  const rows = rowsOf(pattern, shape)
  if (!canInvert(shape)) return rows
  return rows.map((row) => ~row & ROW_MASK)
}

/** Rotate pixels one column left (a full row wraps around). */
export function shiftLeft(pattern: CharPattern, shape: CellShape): CharPattern {
  const { bpp } = shape
  return rowsOf(pattern, shape).map((row) => ((row << bpp) | (row >> (8 - bpp))) & ROW_MASK)
}

export function shiftRight(pattern: CharPattern, shape: CellShape): CharPattern {
  const { bpp } = shape
  return rowsOf(pattern, shape).map((row) => ((row >> bpp) | (row << (8 - bpp))) & ROW_MASK)
}

export function shiftUp(pattern: CharPattern, shape: CellShape): CharPattern {
  const rows = rowsOf(pattern, shape)
  return [...rows.slice(1), rows[0] ?? 0]
}

export function shiftDown(pattern: CharPattern, shape: CellShape): CharPattern {
  const rows = rowsOf(pattern, shape)
  return [rows[rows.length - 1] ?? 0, ...rows.slice(0, -1)]
}

/** Mirror left↔right, moving whole pixels (2 bits at a time when multicolor). */
export function flipH(pattern: CharPattern, shape: CellShape): CharPattern {
  const rows = rowsOf(pattern, shape)
  return rows.map((row, y) => {
    let out = 0
    for (let x = 0; x < shape.width; x++) {
      const value = getPixel(rows, shape, x, y)
      out |= value << shiftFor(shape, shape.width - 1 - x)
    }
    return out & ROW_MASK
  })
}

/** Mirror top↔bottom (reverses row order). */
export function flipV(pattern: CharPattern, shape: CellShape): CharPattern {
  return rowsOf(pattern, shape).reverse()
}

/**
 * True where the rotations are defined: a square grid of square pixels. An
 * 8 × 16 character and every multicolor cell (4 double-wide pixels) would need
 * to change shape to rotate, which the pattern bytes cannot express.
 */
export function canRotate(shape: CellShape): boolean {
  return shape.bpp === 1 && shape.width === shape.height
}

function rotate(pattern: CharPattern, shape: CellShape, clockwise: boolean): CharPattern {
  const rows = rowsOf(pattern, shape)
  if (!canRotate(shape)) return rows
  const size = shape.width
  let out = clear(shape)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Inverse map: which source pixel lands at (x, y)?
      const sx = clockwise ? y : size - 1 - y
      const sy = clockwise ? size - 1 - x : x
      out = setPixel(out, shape, x, y, getPixel(rows, shape, sx, sy))
    }
  }
  return out
}

/** Rotate 90° clockwise: dest(x, y) ← src(y, size − 1 − x). */
export function rotateRight(pattern: CharPattern, shape: CellShape): CharPattern {
  return rotate(pattern, shape, true)
}

/** Rotate 90° counter-clockwise: dest(x, y) ← src(size − 1 − y, x). */
export function rotateLeft(pattern: CharPattern, shape: CellShape): CharPattern {
  return rotate(pattern, shape, false)
}
