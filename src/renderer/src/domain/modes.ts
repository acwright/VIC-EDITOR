/**
 * Per-type metadata and the geometry helpers that read it.
 *
 * Unlike the TMS9918's fixed modes, VIC geometry is register-programmable:
 * columns, rows and character height are project settings (PLAN.md §2.3, D3,
 * D8), so a mode describes only how a cell's *bits* are read — 1 bit per pixel
 * across 8 pixels, or 2 bits per pixel across 4 double-wide ones. In `mixed`
 * that choice belongs to the character rather than the project (D2), which is
 * why `bpp` and `pixelWidth` are null there and the helpers below take the
 * character's flag.
 */

import type { CharCount, CharHeight, Project, ProjectSettings, ProjectType } from './types'

export interface ModeInfo {
  type: ProjectType
  label: string
  /** Bits per pixel, or null in `mixed` where each character decides. */
  bpp: 1 | 2 | null
  /** Pixel columns in a cell, or null in `mixed`. */
  pixelWidth: 8 | 4 | null
  /** True when characters carry their own multicolor flag (D2). */
  perCharMode: boolean
}

export const MODES: Record<ProjectType, ModeInfo> = {
  hires: { type: 'hires', label: 'Hires', bpp: 1, pixelWidth: 8, perCharMode: false },
  multicolor: {
    type: 'multicolor',
    label: 'Multicolor',
    bpp: 2,
    pixelWidth: 4,
    perCharMode: false,
  },
  mixed: { type: 'mixed', label: 'Mixed', bpp: null, pixelWidth: null, perCharMode: true },
}

/**
 * Every project type, in presentation order. Derive type lists from this rather
 * than hand-writing them — a stale copy in `repository.ts` once silently hid
 * saved projects of a type it had never heard of.
 */
export const PROJECT_TYPES = Object.keys(MODES) as ProjectType[]

/** True when `value` names a project type. */
export function isProjectType(value: unknown): value is ProjectType {
  return typeof value === 'string' && PROJECT_TYPES.includes(value as ProjectType)
}

/** Selectable character heights (D3) and set sizes (D4). */
export const CHAR_HEIGHTS: readonly CharHeight[] = [8, 16]
export const CHAR_COUNTS: readonly CharCount[] = [64, 128, 256]

/** The machine's power-on character height, and the byte-box default. */
export const DEFAULT_CHAR_HEIGHT: CharHeight = 8

/** The shape of one character's pixel grid. */
export interface CellShape {
  /** Pixel columns: 8 hires, 4 multicolor. */
  width: number
  /** Pixel rows — the project's char height. */
  height: number
  bpp: 1 | 2
}

/** True when a character renders as multicolor: color RAM bit 3 (D2). */
export function isCharMulticolor(project: Project, code: number): boolean {
  if (project.type === 'multicolor') return true
  if (project.type === 'hires') return false
  return project.charModes?.[code] ?? false
}

/** Bits per pixel for a cell of `type` holding a character with `multicolor`. */
export function cellBitDepth(type: ProjectType, multicolor = false): 1 | 2 {
  return MODES[type].bpp ?? (multicolor ? 2 : 1)
}

/**
 * Pixel columns in a cell — 8 hires, 4 multicolor. A multicolor cell still
 * occupies 8 screen pixels; each of its 4 is drawn double-wide (D10).
 */
export function cellPixelWidth(type: ProjectType, multicolor = false): number {
  return cellBitDepth(type, multicolor) === 2 ? 4 : 8
}

/** Pattern bytes per character — one per pixel row. */
export function patternBytes(charHeight: CharHeight): number {
  return charHeight
}

/** Cells on a screen: columns × rows (bounded by `validateGeometry`). */
export function cellCount(settings: ProjectSettings): number {
  return settings.columns * settings.rows
}

/** Screen pixels a cell occupies — always 8 wide, `charHeight` tall. */
export const CELL_SCREEN_WIDTH = 8

/** The pixel-grid shape of one character in `project`. */
export function cellShape(project: Project, code: number): CellShape {
  const multicolor = isCharMulticolor(project, code)
  return {
    width: cellPixelWidth(project.type, multicolor),
    height: project.settings.charHeight,
    bpp: cellBitDepth(project.type, multicolor),
  }
}
