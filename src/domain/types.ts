/**
 * Domain types for VIC-20 project files.
 * Mirrors the JSON schema in PLAN.md §4 — keep the two in sync.
 */

import type { ColorIndex } from './palette'

export type { ColorIndex } from './palette'

/**
 * How a project's cells render (PLAN.md D1). `hires` and `multicolor` lock
 * every cell to one form; `mixed` lets each character choose, which is what
 * real VIC screens do.
 */
export type ProjectType = 'hires' | 'multicolor' | 'mixed'

/** Pixel rows per character — one register bit, project-wide (D3). */
export type CharHeight = 8 | 16

/** Characters in the set (D4). The chargen base is 1 KB granular. */
export type CharCount = 64 | 128 | 256

export type VideoStandard = 'ntsc' | 'pal'

/** Memory expansion fitted, which decides where screen and charset live. */
export type Expansion = 'none' | '3k' | '8k' | '16k' | '24k'

/**
 * Pattern bytes for one character, `charHeight` of them. In a hires cell each
 * byte is 8 pixels, MSB leftmost; in a multicolor cell it is 4 double-wide
 * pixels of 2 bits each, again most significant first (PLAN.md §2.2).
 */
export type CharPattern = number[]

/** One character set — `charCount` patterns. */
export type Charset = CharPattern[]

export interface ProjectSettings {
  /** Screen geometry in cells (D8, D9). */
  columns: number
  rows: number
  charHeight: CharHeight
  charCount: CharCount
  video: VideoStandard

  /** Global colors (D6). */
  screenColor: ColorIndex // 0–15  → $900F bits 4–7
  borderColor: ColorIndex // 0–7   → $900F bits 0–2
  auxColor: ColorIndex // 0–15  → $900E bits 4–7
  /** True displays inverted hires cells — $900F bit 3 *clear* (PLAN.md §2.2). */
  reverse: boolean

  /** Memory layout — drives the loader and the register block. */
  expansion: Expansion
  /** $9005 bits 0–3, 0–15; `charBaseAddress` turns it into a CPU address. */
  charBase: number
  /** Video matrix address; derived from the expansion but overridable. */
  screenBase: number
}

export interface Screen {
  name: string
  /** Character codes, row-major, length = columns × rows. */
  cells: number[]
  /** Color RAM values 0–7, row-major, same length (D7). */
  colors: number[]
}

export interface Project {
  version: 1
  /** UUID; doubles as the localStorage key suffix. */
  id: string
  name: string
  type: ProjectType
  createdAt: string
  modifiedAt: string
  settings: ProjectSettings
  /** One charset. Each pattern is `settings.charHeight` bytes. */
  charset: Charset
  /** `mixed` only: per-character multicolor flag (D2). Length = charCount. */
  charModes?: boolean[]
  screens: Screen[]
}

/** A project whose every cell is 1 bit per pixel, 8 pixels wide. */
export interface HiresProject extends Project {
  type: 'hires'
}

/** A project whose every cell is 2 bits per pixel, 4 double-wide pixels. */
export interface MulticolorProject extends Project {
  type: 'multicolor'
}

/** A project where each character carries its own multicolor flag (D2). */
export interface MixedProject extends Project {
  type: 'mixed'
  charModes: boolean[]
}

export function isHiresProject(project: Project): project is HiresProject {
  return project.type === 'hires'
}

export function isMulticolorProject(project: Project): project is MulticolorProject {
  return project.type === 'multicolor'
}

export function isMixedProject(project: Project): project is MixedProject {
  return project.type === 'mixed' && Array.isArray(project.charModes)
}
