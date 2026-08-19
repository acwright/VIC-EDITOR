/**
 * Screen operations — pure functions over a screen's `{ cells, colors }` pair:
 * row-major character codes alongside the color RAM values beside them
 * (PLAN.md D7). Every function returns new arrays; inputs are never mutated.
 *
 * The pair moves together. A transform that moved characters but left their
 * colors behind would smear the screen, so every mapping below is applied to
 * both arrays with the same index map.
 *
 * The grid width is passed as `columns`; height is derived from length.
 *
 * Intended usage: `import * as screenOps from './screenOps'`.
 */

import { DEFAULT_FG } from './palette'

/** The cell and color arrays of one screen — a `Screen` without its name. */
export interface ScreenData {
  cells: number[]
  colors: number[]
}

/** What a paint stroke writes: character, color, or both (D7). */
export interface CellPaint {
  code?: number
  color?: number
}

export interface Geometry {
  columns: number
  rows: number
}

/**
 * The character code an empty cell holds. Screen code 32 is the space, and a
 * VIC clears its screen to spaces — code 0 is `@`, which only looked empty
 * while every charset in the app was blank. Now that new projects seed from the
 * ROM font (D15), an "empty" screen full of code 0 would be a wall of `@`, and
 * a screen *export* full of $00 would poke one onto real hardware.
 */
export const EMPTY_CELL = 32

export function cellIndex(columns: number, x: number, y: number): number {
  return y * columns + x
}

/** The character code and color RAM value at (x, y). */
export function getCell(
  data: ScreenData,
  columns: number,
  x: number,
  y: number,
): { code: number; color: number } {
  const i = cellIndex(columns, x, y)
  return { code: data.cells[i] ?? EMPTY_CELL, color: data.colors[i] ?? DEFAULT_FG }
}

/** Write character and/or color at (x, y); omitted fields are left alone. */
export function setCell(
  data: ScreenData,
  columns: number,
  x: number,
  y: number,
  paint: CellPaint,
): ScreenData {
  const i = cellIndex(columns, x, y)
  const next = { cells: data.cells.slice(), colors: data.colors.slice() }
  if (paint.code !== undefined) next.cells[i] = paint.code
  if (paint.color !== undefined) next.colors[i] = paint.color
  return next
}

/** Blank the character at (x, y), leaving its color RAM value in place. */
export function clearCell(data: ScreenData, columns: number, x: number, y: number): ScreenData {
  return setCell(data, columns, x, y, { code: EMPTY_CELL })
}

/** Paint every cell with `paint`; omitted fields are left alone. */
export function fill(data: ScreenData, paint: CellPaint): ScreenData {
  const { code, color } = paint
  return {
    cells: code === undefined ? data.cells.slice() : data.cells.map(() => code),
    colors: color === undefined ? data.colors.slice() : data.colors.map(() => color),
  }
}

/** Blank every character, leaving color RAM alone. */
export function clear(data: ScreenData): ScreenData {
  return fill(data, { code: EMPTY_CELL })
}

/**
 * Rebuild both arrays from an index map: for each destination index, the source
 * index its contents come from, or null to leave the cell blank.
 */
function remap(data: ScreenData, source: (index: number) => number | null): ScreenData {
  const map = data.cells.map((_, i) => source(i))
  return {
    cells: map.map((src) => (src === null ? EMPTY_CELL : (data.cells[src] ?? EMPTY_CELL))),
    colors: map.map((src) => (src === null ? DEFAULT_FG : (data.colors[src] ?? DEFAULT_FG))),
  }
}

export function shiftLeft(data: ScreenData, columns: number): ScreenData {
  return remap(data, (i) => (i % columns === columns - 1 ? i - (columns - 1) : i + 1))
}

export function shiftRight(data: ScreenData, columns: number): ScreenData {
  return remap(data, (i) => (i % columns === 0 ? i + (columns - 1) : i - 1))
}

export function shiftUp(data: ScreenData, columns: number): ScreenData {
  return remap(data, (i) => (i + columns) % data.cells.length)
}

export function shiftDown(data: ScreenData, columns: number): ScreenData {
  return remap(data, (i) => (i - columns + data.cells.length) % data.cells.length)
}

/** Mirror left↔right. */
export function flipH(data: ScreenData, columns: number): ScreenData {
  return remap(data, (i) => {
    const x = i % columns
    return i - x + (columns - 1 - x)
  })
}

/** Mirror top↔bottom. */
export function flipV(data: ScreenData, columns: number): ScreenData {
  const rows = data.cells.length / columns
  return remap(data, (i) => cellIndex(columns, i % columns, rows - 1 - Math.floor(i / columns)))
}

/**
 * Rotate the screen *content* 90° about the grid center, within the same
 * bounds: a non-square grid cannot rotate in place, so cells whose rotated
 * position falls outside the grid are dropped and vacated cells are cleared.
 *
 * The rotation is expressed as an integer offset pair rather than a center,
 * because the center sits on a half-cell whenever a dimension is even. When the
 * two dimensions differ in parity — the VIC's default 22 × 23 among them — the
 * half-cells do not cancel, and rotating about the true center would land every
 * source coordinate on a half index (reading as `undefined`, blanking the
 * screen). Rounding the offsets once instead keeps the map integer and exactly
 * invertible, so rotateLeft still undoes rotateRight; it is a no-op when the
 * parities match.
 */
function rotateContent(data: ScreenData, columns: number, clockwise: boolean): ScreenData {
  const rows = data.cells.length / columns
  const cx = (columns - 1) / 2
  const cy = (rows - 1) / 2
  const ox = Math.round(cx - cy)
  const oy = Math.round(cx + cy)
  return remap(data, (i) => {
    const x = i % columns
    const y = Math.floor(i / columns)
    // Inverse rotation: where must the source cell be for it to land here?
    const sx = clockwise ? ox + y : oy - y
    const sy = clockwise ? oy - x : x - ox
    if (sx < 0 || sx >= columns || sy < 0 || sy >= rows) return null
    return cellIndex(columns, sx, sy)
  })
}

export function rotateRight(data: ScreenData, columns: number): ScreenData {
  return rotateContent(data, columns, true)
}

export function rotateLeft(data: ScreenData, columns: number): ScreenData {
  return rotateContent(data, columns, false)
}

/**
 * Re-fit a screen to a new geometry, anchored at the top-left: content outside
 * the new bounds is cropped and new cells are blank (PLAN.md D8). Destructive
 * by nature — callers confirm before applying it.
 */
export function resize(data: ScreenData, from: Geometry, to: Geometry): ScreenData {
  const length = to.columns * to.rows
  const cells: number[] = Array.from({ length }, () => EMPTY_CELL)
  const colors: number[] = Array.from({ length }, () => DEFAULT_FG)
  const columns = Math.min(from.columns, to.columns)
  const rows = Math.min(from.rows, to.rows)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const src = cellIndex(from.columns, x, y)
      const dest = cellIndex(to.columns, x, y)
      cells[dest] = data.cells[src] ?? EMPTY_CELL
      colors[dest] = data.colors[src] ?? DEFAULT_FG
    }
  }
  return { cells, colors }
}

/**
 * How many cells holding a character would be dropped by a resize — what the
 * confirmation dialog quotes before a geometry change (D8). Color RAM alone is
 * not counted as content: every cell has a color, so cropping a blank cell
 * loses nothing a user drew.
 */
export function croppedCells(data: ScreenData, from: Geometry, to: Geometry): number {
  let lost = 0
  for (let y = 0; y < from.rows; y++) {
    for (let x = 0; x < from.columns; x++) {
      if (x < to.columns && y < to.rows) continue
      if ((data.cells[cellIndex(from.columns, x, y)] ?? EMPTY_CELL) !== EMPTY_CELL) lost++
    }
  }
  return lost
}
