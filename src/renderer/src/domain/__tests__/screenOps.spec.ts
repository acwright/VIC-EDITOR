import { describe, expect, it } from 'vitest'
import * as screenOps from '../screenOps'
import { EMPTY_CELL } from '../screenOps'
import type { ScreenData } from '../screenOps'
import { DEFAULT_FG } from '../palette'
import { defaultSettings } from '../factory'

const { columns: COLUMNS, rows: ROWS } = defaultSettings() // 22 × 23

// 3×2 grid for hand-checkable shifts/flips. Colors differ from codes so a
// transform that dropped or mismatched them is visible:
//   1 2 3   /   1 2 3
//   4 5 6   /   4 5 6
const GRID: ScreenData = { cells: [1, 2, 3, 4, 5, 6], colors: [1, 2, 3, 4, 5, 6] }
const COLS = 3

/** Blank screen at the project's geometry, with one marked cell. */
function marked(x: number, y: number, code = 7, color = 5): ScreenData {
  const length = COLUMNS * ROWS
  const data: ScreenData = {
    cells: Array.from({ length }, () => EMPTY_CELL),
    colors: Array.from({ length }, () => DEFAULT_FG),
  }
  data.cells[y * COLUMNS + x] = code
  data.colors[y * COLUMNS + x] = color
  return data
}

describe('screenOps', () => {
  describe('cells', () => {
    it('setCell / getCell round-trip character and color', () => {
      const next = screenOps.setCell(GRID, COLS, 2, 1, { code: 9, color: 7 })
      expect(screenOps.getCell(next, COLS, 2, 1)).toEqual({ code: 9, color: 7 })
      expect(next.cells).toEqual([1, 2, 3, 4, 5, 9])
      expect(next.colors).toEqual([1, 2, 3, 4, 5, 7])
      expect(GRID.cells).toEqual([1, 2, 3, 4, 5, 6]) // input untouched
    })

    it('paints character or color alone', () => {
      expect(screenOps.setCell(GRID, COLS, 0, 0, { code: 9 }).colors).toEqual(GRID.colors)
      expect(screenOps.setCell(GRID, COLS, 0, 0, { color: 7 }).cells).toEqual(GRID.cells)
    })

    it('clearCell blanks the character but keeps its color', () => {
      const next = screenOps.clearCell(GRID, COLS, 0, 0)
      expect(next.cells).toEqual([EMPTY_CELL, 2, 3, 4, 5, 6])
      expect(next.colors).toEqual([1, 2, 3, 4, 5, 6])
    })

    it('fill and clear', () => {
      expect(screenOps.fill(GRID, { code: 8 }).cells).toEqual([8, 8, 8, 8, 8, 8])
      expect(screenOps.fill(GRID, { color: 2 }).colors).toEqual([2, 2, 2, 2, 2, 2])
      // A cleared VIC screen is spaces, not code 0 — code 0 is `@`
      expect(screenOps.clear(GRID).cells).toEqual(Array.from({ length: 6 }, () => EMPTY_CELL))
      expect(screenOps.clear(GRID).colors).toEqual(GRID.colors)
    })
  })

  describe('shifts (wrapping)', () => {
    it('shiftLeft wraps the first column to the last', () => {
      const next = screenOps.shiftLeft(GRID, COLS)
      expect(next.cells).toEqual([2, 3, 1, 5, 6, 4])
      expect(next.colors).toEqual([2, 3, 1, 5, 6, 4])
    })

    it('shiftRight wraps the last column to the first', () => {
      expect(screenOps.shiftRight(GRID, COLS).cells).toEqual([3, 1, 2, 6, 4, 5])
    })

    it('shiftUp wraps the top row to the bottom', () => {
      expect(screenOps.shiftUp(GRID, COLS).cells).toEqual([4, 5, 6, 1, 2, 3])
    })

    it('shiftDown wraps the bottom row to the top', () => {
      expect(screenOps.shiftDown(GRID, COLS).cells).toEqual([4, 5, 6, 1, 2, 3])
    })

    it('opposite shifts cancel on a real screen', () => {
      const data = marked(10, 5)
      expect(screenOps.shiftRight(screenOps.shiftLeft(data, COLUMNS), COLUMNS)).toEqual(data)
      expect(screenOps.shiftDown(screenOps.shiftUp(data, COLUMNS), COLUMNS)).toEqual(data)
    })
  })

  describe('flips', () => {
    it('flipH mirrors left-right', () => {
      const next = screenOps.flipH(GRID, COLS)
      expect(next.cells).toEqual([3, 2, 1, 6, 5, 4])
      expect(next.colors).toEqual([3, 2, 1, 6, 5, 4])
    })

    it('flipV mirrors top-bottom', () => {
      expect(screenOps.flipV(GRID, COLS).cells).toEqual([4, 5, 6, 1, 2, 3])
    })

    it('double flip is identity', () => {
      expect(screenOps.flipH(screenOps.flipH(GRID, COLS), COLS)).toEqual(GRID)
      expect(screenOps.flipV(screenOps.flipV(GRID, COLS), COLS)).toEqual(GRID)
    })
  })

  describe('content rotation', () => {
    it('rotateRight moves content clockwise about the grid center', () => {
      // (6, 11) rotates CW to (11, 6) — color travels with the character.
      expect(screenOps.rotateRight(marked(6, 11), COLUMNS)).toEqual(marked(11, 6))
    })

    it('rotateLeft moves content counter-clockwise about the grid center', () => {
      expect(screenOps.rotateLeft(marked(11, 6), COLUMNS)).toEqual(marked(6, 11))
    })

    it('drops content whose rotated position falls outside the grid', () => {
      // Row 0 rotates CW to column 22, one past the right edge of a 22-column grid.
      const blank = marked(5, 0)
      blank.cells[5] = EMPTY_CELL
      blank.colors[5] = DEFAULT_FG
      expect(screenOps.rotateRight(marked(5, 0), COLUMNS)).toEqual(blank)
    })

    it('round-trips content that stays in bounds', () => {
      const data = marked(9, 10, 42, 2)
      expect(screenOps.rotateLeft(screenOps.rotateRight(data, COLUMNS), COLUMNS)).toEqual(data)
    })

    it('rotates about the true center on an even, square grid', () => {
      // 4×4: (1, 0) rotates CW about (1.5, 1.5) to (3, 1).
      const data: ScreenData = {
        cells: [EMPTY_CELL, 5, ...Array.from({ length: 14 }, () => EMPTY_CELL)],
        colors: Array.from({ length: 16 }, () => DEFAULT_FG),
      }
      const rotated = screenOps.rotateRight(data, 4)
      expect(screenOps.getCell(rotated, 4, 3, 1).code).toBe(5)
      expect(rotated.cells.filter((c) => c !== EMPTY_CELL)).toHaveLength(1)
    })
  })

  describe('resize', () => {
    const from = { columns: 3, rows: 2 }

    it('crops from the top-left when the grid shrinks', () => {
      const next = screenOps.resize(GRID, from, { columns: 2, rows: 1 })
      expect(next.cells).toEqual([1, 2])
      expect(next.colors).toEqual([1, 2])
    })

    it('pads with blank cells at the default color when the grid grows', () => {
      const next = screenOps.resize(GRID, from, { columns: 4, rows: 3 })
      const E = EMPTY_CELL
      expect(next.cells).toEqual([1, 2, 3, E, 4, 5, 6, E, E, E, E, E])
      expect(next.colors).toEqual([
        1,
        2,
        3,
        DEFAULT_FG,
        4,
        5,
        6,
        DEFAULT_FG,
        DEFAULT_FG,
        DEFAULT_FG,
        DEFAULT_FG,
        DEFAULT_FG,
      ])
    })

    it('is a copy when the geometry is unchanged', () => {
      const next = screenOps.resize(GRID, from, from)
      expect(next).toEqual(GRID)
      expect(next.cells).not.toBe(GRID.cells)
    })

    it('counts the characters a crop would drop', () => {
      // 1 2 3 / 4 5 6 → shrinking to 2 × 2 drops codes 3 and 6
      expect(screenOps.croppedCells(GRID, from, { columns: 2, rows: 2 })).toBe(2)
      expect(screenOps.croppedCells(GRID, from, { columns: 3, rows: 1 })).toBe(3)
      expect(screenOps.croppedCells(GRID, from, { columns: 4, rows: 4 })).toBe(0)
    })

    it('does not count blank cells as content lost', () => {
      const blanks: ScreenData = {
        cells: [1, ...Array.from({ length: 5 }, () => EMPTY_CELL)],
        colors: [1, 2, 3, 4, 5, 6],
      }
      // Every cropped cell is blank, so nothing a user drew is at risk
      expect(screenOps.croppedCells(blanks, from, { columns: 1, rows: 1 })).toBe(0)
    })
  })
})
