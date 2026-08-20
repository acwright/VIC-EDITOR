/**
 * Project (de)serialization — to/from the JSON schema in PLAN.md §4, with
 * structural validation of uploaded files. `deserializeProject` and
 * `validateProject` throw `ProjectValidationError` with a human-readable
 * message identifying what is wrong.
 *
 * Validation is exhaustive on purpose: the same function guards uploads, share
 * links and everything read back out of localStorage, and the editor assumes
 * from then on that geometry, color ranges and array lengths agree.
 */

import type { CharCount, CharHeight, Expansion, Project, ProjectSettings } from './types'
import { CHAR_COUNTS, CHAR_HEIGHTS, cellCount, isProjectType } from './modes'
import { FG_MAX, PALETTE_SIZE, isValidColorIndex, isValidFgIndex } from './palette'
import {
  EXPANSIONS,
  MAX_CELLS,
  MAX_COLUMNS,
  MAX_ROWS,
  SCREEN_BASE_GRANULARITY,
  validateGeometry,
} from './vic'

export class ProjectValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectValidationError'
  }
}

function fail(message: string): never {
  throw new ProjectValidationError(message)
}

/** Pretty-printed JSON, suitable for download as `<name>.vic20.json`. */
export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2)
}

/** Parse and validate a project JSON string (e.g. an uploaded file). */
export function deserializeProject(json: string): Project {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    fail('File is not valid JSON.')
  }
  return validateProject(data)
}

/** Validate an unknown value against the project schema; returns it typed. */
export function validateProject(data: unknown): Project {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    fail('Project must be a JSON object.')
  }
  const p = data as Record<string, unknown>

  // No migration from the editor this app was seeded from (D17); say so plainly.
  const foreign = tms9918Signature(p)
  if (foreign) {
    fail(
      `This is a project from the TMS9918 editor (${foreign}), not a VIC-20 one. ` +
        'The two apps share a schema version number and nothing else, and there is no ' +
        'conversion between them — VIC-20 projects are saved as ".vic20.json".',
    )
  }

  if (p.version !== 1) fail(`Unsupported project version: ${JSON.stringify(p.version)}.`)
  if (typeof p.id !== 'string' || p.id.length === 0)
    fail('Project "id" must be a non-empty string.')
  if (typeof p.name !== 'string' || p.name.length === 0) {
    fail('Project "name" must be a non-empty string.')
  }
  const type = p.type
  if (!isProjectType(type)) {
    fail(`Project "type" must be "hires", "multicolor" or "mixed" (got ${JSON.stringify(type)}).`)
  }
  if (typeof p.createdAt !== 'string' || Number.isNaN(Date.parse(p.createdAt))) {
    fail('Project "createdAt" must be an ISO-8601 date string.')
  }
  if (typeof p.modifiedAt !== 'string' || Number.isNaN(Date.parse(p.modifiedAt))) {
    fail('Project "modifiedAt" must be an ISO-8601 date string.')
  }

  const settings = validateSettings(p.settings)
  validateCharset(p.charset, settings)
  validateCharModes(p.charModes, type, settings)
  validateScreens(p.screens, settings)

  return data as Project
}

/**
 * Modes that only ever existed on the TMS9918. Its `multicolor` is deliberately
 * absent: the VIC has a type of that name too, so a file naming it is
 * identified by its shape (`charsets`, a project-level color table) instead.
 */
const TMS9918_ONLY_TYPES = ['text', 'graphics1', 'graphics2', 'sprite']

/**
 * Names what marks `p` as a file from the TMS9918 editor this app was seeded
 * from, or null. Both apps write `version: 1`, so without this check a TMS9918
 * upload is reported by whichever field validation happens to reach first —
 * "settings must be an object" — which says nothing about the actual problem.
 */
function tms9918Signature(p: Record<string, unknown>): string | null {
  if (Array.isArray(p.charsets)) return 'it holds a "charsets" list, not one "charset"'
  if (Array.isArray(p.animations)) return 'it holds sprite animations'
  if (typeof p.type === 'string' && TMS9918_ONLY_TYPES.includes(p.type)) {
    return `"${p.type}" is a TMS9918 mode`
  }
  // A project-level color table: on the VIC, color lives per screen cell (D7).
  if (p.colors !== undefined && p.charset === undefined) return 'it has a project-level color table'
  return null
}

function isIntInRange(value: unknown, max: number, min = 0): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function isByte(value: unknown): boolean {
  return isIntInRange(value, 255)
}

function validateSettings(value: unknown): ProjectSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('Project "settings" must be an object.')
  }
  const s = value as Record<string, unknown>

  if (!isIntInRange(s.columns, MAX_COLUMNS, 1) || !isIntInRange(s.rows, MAX_ROWS, 1)) {
    fail(`Settings "columns" must be 1–${MAX_COLUMNS} and "rows" 1–${MAX_ROWS}.`)
  }
  const geometry = validateGeometry({ columns: s.columns as number, rows: s.rows as number })
  if (geometry.overBudget) {
    fail(`Screen geometry is ${geometry.cells} cells; the VIC allows at most ${MAX_CELLS}.`)
  }

  if (!CHAR_HEIGHTS.includes(s.charHeight as CharHeight)) {
    fail(`Settings "charHeight" must be ${CHAR_HEIGHTS.join(' or ')}.`)
  }
  if (!CHAR_COUNTS.includes(s.charCount as CharCount)) {
    fail(`Settings "charCount" must be ${CHAR_COUNTS.join(', ')}.`)
  }
  if (s.video !== 'ntsc' && s.video !== 'pal') {
    fail('Settings "video" must be "ntsc" or "pal".')
  }

  if (!isValidColorIndex(s.screenColor) || !isValidColorIndex(s.auxColor)) {
    fail(`Settings "screenColor" and "auxColor" must be palette indices 0–${PALETTE_SIZE - 1}.`)
  }
  if (!isValidFgIndex(s.borderColor)) {
    fail(`Settings "borderColor" must be 0–${FG_MAX} — it is a 3-bit register field.`)
  }
  if (typeof s.reverse !== 'boolean') fail('Settings "reverse" must be a boolean.')

  if (!EXPANSIONS.includes(s.expansion as Expansion)) {
    fail(`Settings "expansion" must be one of ${EXPANSIONS.join(', ')}.`)
  }
  if (!isIntInRange(s.charBase, 15)) {
    fail('Settings "charBase" must be a chargen selector 0–15.')
  }
  if (!isIntInRange(s.screenBase, 0xffff) || (s.screenBase as number) % SCREEN_BASE_GRANULARITY) {
    fail('Settings "screenBase" must be a 512-byte aligned address.')
  }

  return s as unknown as ProjectSettings
}

function validateCharset(charset: unknown, settings: ProjectSettings): void {
  const { charCount, charHeight } = settings
  if (!Array.isArray(charset) || charset.length !== charCount) {
    fail(`Project "charset" must contain ${charCount} characters.`)
  }
  charset.forEach((pattern, c) => {
    if (!Array.isArray(pattern) || pattern.length !== charHeight || !pattern.every(isByte)) {
      fail(`Character ${c}: pattern must be ${charHeight} bytes (0–255).`)
    }
  })
}

function validateCharModes(
  charModes: unknown,
  type: Project['type'],
  settings: ProjectSettings,
): void {
  // The flag is per character and only `mixed` has anything to vary (D2).
  if (type !== 'mixed') {
    if (charModes !== undefined) {
      fail(`Only "mixed" projects carry "charModes" (type is "${type}").`)
    }
    return
  }
  if (
    !Array.isArray(charModes) ||
    charModes.length !== settings.charCount ||
    !charModes.every((flag) => typeof flag === 'boolean')
  ) {
    fail(`Project "charModes" must be ${settings.charCount} booleans.`)
  }
}

function validateScreens(screens: unknown, settings: ProjectSettings): void {
  const length = cellCount(settings)
  if (!Array.isArray(screens) || screens.length === 0) {
    fail('Project must have at least one screen.')
  }
  screens.forEach((screen, i) => {
    if (typeof screen !== 'object' || screen === null) fail(`Screen ${i} must be an object.`)
    const s = screen as Record<string, unknown>
    if (typeof s.name !== 'string' || s.name.length === 0) {
      fail(`Screen ${i} "name" must be a non-empty string.`)
    }
    if (!Array.isArray(s.cells) || s.cells.length !== length || !s.cells.every(isByte)) {
      fail(`Screen ${i} "cells" must be ${length} character codes (0–255).`)
    }
    if (!Array.isArray(s.colors) || s.colors.length !== length || !s.colors.every(isValidFgIndex)) {
      fail(`Screen ${i} "colors" must be ${length} color RAM values (0–${FG_MAX}).`)
    }
  })
}
