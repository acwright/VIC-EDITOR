/**
 * Project factory — builds a valid project at the machine's power-on state: a
 * 22 × 23 screen of 8 × 8 characters, blue on white with a cyan border, normal
 * video, NTSC, unexpanded (PLAN.md §2.3, §2.4).
 *
 * Its charset seeds from the VIC-20 ROM font rather than starting blank, so a
 * new project can be typed into immediately (D15). `blank` is the opt-out, and
 * the only option a 16-tall project has: the ROM is an 8×8 font and there is no
 * defensible way to stretch it (D16b).
 */

import type { Charset, Project, ProjectSettings, ProjectType, Screen } from './types'
import { cellCount } from './modes'
import { DEFAULT_FG } from './palette'
import { EMPTY_CELL } from './screenOps'
import { romCharset, type CharsetSeed } from './romCharset'
import { defaultsForExpansion } from './vic'

const DEFAULT_SCREEN_COLOR = 1 // White
const DEFAULT_BORDER_COLOR = 3 // Cyan

/** The machine's power-on configuration, unexpanded. */
export function defaultSettings(): ProjectSettings {
  const memory = defaultsForExpansion('none')
  return {
    columns: 22,
    rows: 23,
    charHeight: 8,
    charCount: 256,
    video: 'ntsc',
    screenColor: DEFAULT_SCREEN_COLOR,
    borderColor: DEFAULT_BORDER_COLOR,
    auxColor: 0,
    reverse: false,
    expansion: 'none',
    charBase: memory.charBase,
    screenBase: memory.screenBase,
  }
}

export interface CreateProjectOptions {
  name: string
  type: ProjectType
  /** Overrides applied over {@link defaultSettings}. */
  settings?: Partial<ProjectSettings>
  /** Starting character set; defaults to the ROM uppercase font (D15). */
  seed?: CharsetSeed
}

/** The seed a new project uses when the form does not say otherwise. */
export const DEFAULT_SEED: CharsetSeed = 'rom-upper'

export function blankPattern(charHeight: number): number[] {
  return Array.from({ length: charHeight }, () => 0)
}

export function blankCharset(charCount: number, charHeight: number): Charset {
  return Array.from({ length: charCount }, () => blankPattern(charHeight))
}

/** True when `seed` can be honored — the ROM font is 8 rows tall (D16b). */
export function seedAvailable(seed: CharsetSeed, charHeight: number): boolean {
  return seed === 'blank' || charHeight === 8
}

/**
 * The charset a new project starts with. A ROM seed asked for at 16 rows falls
 * back to blank rather than to a stretched or half-empty font (D16b); the
 * dialog offering the choice disables it there, so this is the backstop.
 */
export function seedCharset(seed: CharsetSeed, charCount: number, charHeight: number): Charset {
  if (!seedAvailable(seed, charHeight)) return blankCharset(charCount, charHeight)
  if (seed === 'rom-upper') return romCharset('upper', charCount)
  if (seed === 'rom-lower') return romCharset('lower', charCount)
  return blankCharset(charCount, charHeight)
}

/**
 * An empty screen sized to `settings`: spaces at the default color RAM value.
 * Spaces rather than code 0, because a ROM-seeded charset draws `@` there
 * (see {@link EMPTY_CELL}).
 */
export function blankScreen(name: string, settings: ProjectSettings): Screen {
  const length = cellCount(settings)
  return {
    name,
    cells: Array.from({ length }, () => EMPTY_CELL),
    colors: Array.from({ length }, () => DEFAULT_FG),
  }
}

export function createProject(options: CreateProjectOptions): Project {
  const { name, type } = options
  const settings = { ...defaultSettings(), ...options.settings }
  const now = new Date().toISOString()

  const project: Project = {
    version: 1,
    id: crypto.randomUUID(),
    name,
    type,
    createdAt: now,
    modifiedAt: now,
    settings,
    charset: seedCharset(options.seed ?? DEFAULT_SEED, settings.charCount, settings.charHeight),
    screens: [blankScreen('Screen 1', settings)],
  }

  // Only `mixed` carries per-character modes; the other types are uniform (D2).
  if (type === 'mixed') {
    project.charModes = Array.from({ length: settings.charCount }, () => false)
  }

  return project
}
