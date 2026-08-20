/**
 * Authoring helpers for the bundled samples.
 *
 * Samples are hand-drawn data, and hand-drawn data is only readable if the
 * drawing verbs are: a painter writes a character code and its color RAM value
 * together, because on the VIC those are two arrays that must agree cell for
 * cell (PLAN.md D7). Everything here clips silently at the screen edge, so a
 * sample can be laid out in absolute coordinates without every call guarding
 * the geometry it was written against.
 *
 * Not shipped as editor functionality — `screenOps` is the store's vocabulary.
 * This is the sample author's.
 */

import type { CharPattern, ColorIndex, Project, Screen } from '@/domain/types'

/** Screen code of the space character; also the ROM's blank glyph. */
export const SPACE = 32

/**
 * PETSCII graphics by screen code, in the ROM uppercase set. Screen codes, not
 * PETSCII codes — the two differ, and it is the screen code that indexes the
 * character generator (rom/README.md).
 */
export const G = {
  hLine: 64,
  vLine: 66,
  topLeft: 112,
  topRight: 110,
  bottomLeft: 109,
  bottomRight: 125,
  spade: 65,
  heart: 83,
  club: 88,
  diamond: 90,
  disc: 81,
  circle: 87,
  cross: 91,
  dither: 102,
  leftHalf: 97,
  /** Reversed space — a solid cell. Needs a 256-character set (D16a). */
  solid: 160,
} as const

/**
 * Screen code for a character of sample text. ASCII `$20`–`$3F` — space,
 * punctuation, digits — is already screen code; `$40`–`$5F` (`@` through `_`)
 * shifts down by `$40`, which is what makes `@` code 0 and `A` code 1. Lowercase
 * folds onto the capitals, since the samples are set in the uppercase ROM font.
 */
export function screenCode(char: string): number {
  const ascii = char.charCodeAt(0)
  if (ascii >= 0x20 && ascii <= 0x3f) return ascii
  if (ascii >= 0x40 && ascii <= 0x5f) return ascii - 0x40
  if (ascii >= 0x60 && ascii <= 0x7a) return ascii - 0x60
  return SPACE
}

/** A hires pattern from `#`/`.` rows — 8 pixels wide, MSB leftmost. */
export function pattern(rows: string[]): CharPattern {
  return rows.map((row) => {
    let byte = 0
    for (let x = 0; x < 8; x++) if (row[x] === '#') byte |= 0x80 >> x
    return byte
  })
}

/**
 * A multicolor pattern from rows of four `0`–`3` digits. Each digit is one
 * double-wide pixel and names a color *slot*, not a color: `0` screen, `1`
 * border, `2` the cell's color RAM, `3` auxiliary (PLAN.md §2.2).
 */
export function multicolorPattern(rows: string[]): CharPattern {
  return rows.map((row) => {
    let byte = 0
    for (let x = 0; x < 4; x++) byte |= ((Number(row[x] ?? '0') & 3) << (6 - x * 2)) >>> 0
    return byte
  })
}

export interface Painter {
  /** One cell: character code, and color RAM when given. */
  poke(x: number, y: number, code: number, color?: ColorIndex): void
  /** A run of character codes rightwards from `x`. */
  row(x: number, y: number, codes: readonly number[], color?: ColorIndex): void
  /** Text, folded to screen codes. */
  text(x: number, y: number, text: string, color?: ColorIndex): void
  /** Text centerd on the screen's width. */
  center(y: number, text: string, color?: ColorIndex): void
  /** A solid rectangle of one character code. */
  fill(x: number, y: number, w: number, h: number, code: number, color?: ColorIndex): void
  /** Color RAM only, leaving the characters under it alone (D7). */
  recolor(x: number, y: number, w: number, h: number, color: ColorIndex): void
  /** A single-line box drawn with the ROM's line graphics. */
  frame(x: number, y: number, w: number, h: number, color?: ColorIndex): void
}

/** A painter over one of `project`'s screens, clipped to the project geometry. */
export function painter(project: Project, screenIndex = 0): Painter {
  const { columns, rows } = project.settings
  const screen = project.screens[screenIndex] as Screen

  function poke(x: number, y: number, code: number, color?: ColorIndex): void {
    if (x < 0 || y < 0 || x >= columns || y >= rows) return
    const index = y * columns + x
    screen.cells[index] = code
    if (color !== undefined) screen.colors[index] = color
  }

  function recolor(x: number, y: number, w: number, h: number, color: ColorIndex): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const cx = x + dx
        const cy = y + dy
        if (cx < 0 || cy < 0 || cx >= columns || cy >= rows) continue
        screen.colors[cy * columns + cx] = color
      }
    }
  }

  return {
    poke,
    recolor,

    row(x, y, codes, color) {
      codes.forEach((code, i) => poke(x + i, y, code, color))
    },

    text(x, y, text, color) {
      for (let i = 0; i < text.length; i++) poke(x + i, y, screenCode(text[i]!), color)
    },

    center(y, text, color) {
      const x = Math.floor((columns - text.length) / 2)
      for (let i = 0; i < text.length; i++) poke(x + i, y, screenCode(text[i]!), color)
    },

    fill(x, y, w, h, code, color) {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) poke(x + dx, y + dy, code, color)
      }
    },

    frame(x, y, w, h, color) {
      const right = x + w - 1
      const bottom = y + h - 1
      for (let dx = 1; dx < w - 1; dx++) {
        poke(x + dx, y, G.hLine, color)
        poke(x + dx, bottom, G.hLine, color)
      }
      for (let dy = 1; dy < h - 1; dy++) {
        poke(x, y + dy, G.vLine, color)
        poke(right, y + dy, G.vLine, color)
      }
      poke(x, y, G.topLeft, color)
      poke(right, y, G.topRight, color)
      poke(x, bottom, G.bottomLeft, color)
      poke(right, bottom, G.bottomRight, color)
    },
  }
}
