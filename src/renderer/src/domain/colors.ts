/**
 * Color resolution — what each pixel value in a cell actually draws.
 *
 * A hires cell reads 2 colors, a multicolor cell 4, and only one of them (the
 * cell's own color RAM value) is local: the rest are project-wide registers,
 * including the border, which does double duty as multicolor pixel value `01`
 * (PLAN.md §2.2, D6, D7). Reverse mode swaps the two hires colors and leaves
 * multicolor cells alone.
 *
 * {@link cellSlots} is the single source of that ordering: the pixel editor
 * paints a *slot* and needs the pixel value that carries it, which under reverse
 * mode is not the value you would guess.
 */

import type { ColorIndex, Project, Screen } from './types'
import { isCharMulticolor } from './modes'
import { DEFAULT_FG, HIRES_SLOTS, MULTICOLOR_SLOTS, paletteHex, type ColorSlot } from './palette'

/** Drawn when a color index is somehow out of range — never on valid data. */
const FALLBACK_HEX = '#000000'

/** sRGB hex for a palette index; black for anything out of range. */
export function colorHex(index: number): string {
  return paletteHex(index) ?? FALLBACK_HEX
}

/**
 * The color slot each pixel value selects, in value order. Multicolor cells
 * always read screen / border / color RAM / auxiliary; hires cells read screen
 * then color RAM, swapped when reverse mode is on ($900F bit 3).
 */
export function cellSlots(project: Project, multicolor: boolean): ColorSlot[] {
  if (multicolor) return [...MULTICOLOR_SLOTS]
  const slots = [...HIRES_SLOTS]
  return project.settings.reverse ? slots.reverse() : slots
}

/** The palette index a slot currently holds; `fg` is the cell's color RAM. */
export function slotColorIndex(project: Project, slot: ColorSlot, fg: ColorIndex): ColorIndex {
  const { screenColor, borderColor, auxColor } = project.settings
  if (slot === 'screen') return screenColor
  if (slot === 'border') return borderColor
  if (slot === 'aux') return auxColor
  return fg
}

/**
 * Palette indices a cell's pixel values map to, in value order: `[0, 1]` for a
 * hires cell, `[00, 01, 10, 11]` for a multicolor one. `fg` is the cell's
 * color RAM value.
 */
export function cellColorIndexes(
  project: Project,
  fg: ColorIndex,
  multicolor: boolean,
): ColorIndex[] {
  return cellSlots(project, multicolor).map((slot) => slotColorIndex(project, slot, fg))
}

/** The 2 or 4 hex colors a cell's pixel values draw, in value order. */
export function cellColorHexes(project: Project, fg: ColorIndex, multicolor: boolean): string[] {
  return cellColorIndexes(project, fg, multicolor).map(colorHex)
}

/** Colors for cell `index` of `screen`, reading its character and color RAM. */
export function resolveCellColors(
  project: Project,
  screen: Screen | null | undefined,
  index: number,
): string[] {
  const code = screen?.cells[index] ?? 0
  const fg = screen?.colors[index] ?? DEFAULT_FG
  return cellColorHexes(project, fg, isCharMulticolor(project, code))
}
