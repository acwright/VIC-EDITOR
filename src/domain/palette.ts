/**
 * The VIC-20 palette — 16 colors, none of them transparent (PLAN.md §2.1, D5).
 *
 * Two register fields are only three bits wide, so character color (color
 * RAM) and border color can name just the first eight entries; screen and
 * auxiliary color are four-bit fields and reach all sixteen. Everything that
 * offers a color choice asks this module which slot it is filling rather than
 * hard-coding a range.
 *
 * Hex values are VICE's default `vic20` palette — a rendering choice, not
 * hardware truth, kept in one table so it can be swapped wholesale.
 */

/** Palette index 0–15. */
export type ColorIndex = number

export interface PaletteEntry {
  index: number
  name: string
  hex: string
}

export const PALETTE: readonly PaletteEntry[] = [
  { index: 0, name: 'Black', hex: '#000000' },
  { index: 1, name: 'White', hex: '#FFFFFF' },
  { index: 2, name: 'Red', hex: '#782922' },
  { index: 3, name: 'Cyan', hex: '#87D6DD' },
  { index: 4, name: 'Purple', hex: '#AA5FB6' },
  { index: 5, name: 'Green', hex: '#55A049' },
  { index: 6, name: 'Blue', hex: '#40318D' },
  { index: 7, name: 'Yellow', hex: '#BFCE72' },
  { index: 8, name: 'Orange', hex: '#AA7449' },
  { index: 9, name: 'Light Orange', hex: '#EAB489' },
  { index: 10, name: 'Light Red', hex: '#B86962' },
  { index: 11, name: 'Light Cyan', hex: '#C7FFFF' },
  { index: 12, name: 'Light Purple', hex: '#EA9FF6' },
  { index: 13, name: 'Light Green', hex: '#94E089' },
  { index: 14, name: 'Light Blue', hex: '#8080FF' },
  { index: 15, name: 'Light Yellow', hex: '#FFFFC0' },
]

export const PALETTE_SIZE = PALETTE.length

/** Highest index a 3-bit color field (character color, border) can hold. */
export const FG_MAX = 7

/** Color RAM's power-on value — blue characters on the white screen. */
export const DEFAULT_FG = 6

/**
 * The four colors a cell can draw with. `fg` is the cell's own color RAM
 * value; the other three are project-wide registers (PLAN.md D6).
 */
export type ColorSlot = 'screen' | 'border' | 'fg' | 'aux'

/** Valid index range per slot — the width of the register field behind it. */
export const SLOT_MAX: Record<ColorSlot, number> = {
  screen: PALETTE_SIZE - 1, // $900F bits 4–7
  border: FG_MAX, // $900F bits 0–2
  fg: FG_MAX, // color RAM bits 0–2
  aux: PALETTE_SIZE - 1, // $900E bits 4–7
}

export const SLOT_LABELS: Record<ColorSlot, string> = {
  screen: 'Screen',
  border: 'Border',
  fg: 'Character',
  aux: 'Auxiliary',
}

/** Pixel-value order of a multicolor cell's slots (PLAN.md §2.2). */
export const MULTICOLOR_SLOTS: readonly ColorSlot[] = ['screen', 'border', 'fg', 'aux']

/** Pixel-value order of a hires cell's slots. */
export const HIRES_SLOTS: readonly ColorSlot[] = ['screen', 'fg']

/** True for any palette index, 0–15. */
export function isValidColorIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < PALETTE_SIZE
}

/** True for an index a 3-bit field can hold, 0–7 (color RAM, border). */
export function isValidFgIndex(value: unknown): value is number {
  return isValidColorIndex(value) && value <= FG_MAX
}

/** True when `value` is in range for the field behind `slot`. */
export function isValidSlotIndex(slot: ColorSlot, value: unknown): value is number {
  return isValidColorIndex(value) && value <= SLOT_MAX[slot]
}

/**
 * Why a slot cannot hold colors 8–15, phrased for a tooltip; null for the two
 * slots that can. The picker grays those swatches rather than hiding them, so
 * it owes the user a reason — the register field behind the slot is three bits
 * wide, which is hardware, not a choice the editor made (PLAN.md D5).
 */
export function slotRangeNote(slot: ColorSlot): string | null {
  if (SLOT_MAX[slot] === PALETTE_SIZE - 1) return null
  return slot === 'fg'
    ? 'Color RAM is 3 bits wide — a character reaches colors 0–7 only'
    : 'The border field ($900F bits 0–2) is 3 bits wide — colors 0–7 only'
}

/** sRGB hex for a palette index; null when the index is out of range. */
export function paletteHex(index: number): string | null {
  return PALETTE[index]?.hex ?? null
}
