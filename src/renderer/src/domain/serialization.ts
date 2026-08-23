/**
 * Project (de)serialization — to/from the JSON schema in PLAN.md §4, with
 * structural validation of uploaded files. `deserializeProject` and
 * `validateProject` throw `ProjectValidationError` with a human-readable
 * message identifying what is wrong.
 *
 * Validation is exhaustive on purpose: the same function guards uploads, share
 * links and everything read back out of localStorage, and the editor assumes
 * from then on that geometry, color ranges and array lengths agree.
 *
 * `serializeProject` is the *only* serialization (Document Storage plan, D4):
 * downloads and, from F3, disk writes both go through it. It is git-first, not
 * merely pretty — the rules below buy a diff that names the characters and
 * screen rows that changed instead of one enormous blob:
 *
 * - keys in a fixed order, so a project built by `createProject` and one parsed
 *   back from a file serialize identically;
 * - one character per line — a pattern's `charHeight` bytes stay together, so a
 *   charset is one line per character;
 * - one screen row per line — `cells` and `colors` wrapped at
 *   `settings.columns`, so a row of the file is a row of the screen;
 * - 2-space indent, LF, trailing newline (both repos are `* text=auto eol=lf`).
 *
 * Formatting is never semantic: `deserialize(serialize(p))` deep-equals `p`,
 * and reserializing a file this wrote reproduces it byte for byte.
 *
 * The share link is deliberately *not* on this path — it compresses compact
 * JSON, where none of this would help (`share.ts`).
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

/**
 * How each node of the document is laid out. `'block'` puts one entry on its
 * own line; a number wraps a flat array at that many entries per line; the
 * default, `'inline'`, keeps the whole node on the line it starts on.
 */
type Layout = 'block' | 'inline' | number

/**
 * Object key order, by node path (`''` is the document itself, `[]` stands for
 * any array index). Keys not listed follow the listed ones, sorted — a
 * hand-added key survives a round-trip rather than being dropped.
 */
const KEY_ORDER: Record<string, string[]> = {
  '': [
    'version',
    'id',
    'name',
    'type',
    'createdAt',
    'modifiedAt',
    'settings',
    'charset',
    'charModes',
    'screens',
  ],
  settings: [
    'columns',
    'rows',
    'charHeight',
    'charCount',
    'video',
    'screenColor',
    'borderColor',
    'auxColor',
    'reverse',
    'expansion',
    'charBase',
    'screenBase',
  ],
  'screens[]': ['name', 'cells', 'colors'],
}

/**
 * Layout by node path. What is *absent* matters as much as what is here:
 * `charset[]` (a character's pattern bytes) falls through to `'inline'`, which
 * is what puts one character on one line.
 */
const LAYOUT: Record<string, Layout> = {
  '': 'block',
  settings: 'block',
  charset: 'block',
  charModes: 16,
  screens: 'block',
  'screens[]': 'block',
}

const INDENT = '  '

function childPath(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`
}

/** Listed keys first in their listed order, then anything else, sorted. */
function orderedEntries(object: Record<string, unknown>, path: string): [string, unknown][] {
  const keys = Object.keys(object).filter((key) => object[key] !== undefined)
  const order = KEY_ORDER[path]
  const ordered = order
    ? [
        ...order.filter((key) => keys.includes(key)),
        ...keys.filter((key) => !order.includes(key)).sort(),
      ]
    : keys.sort()
  return ordered.map((key) => [key, object[key]])
}

/**
 * Renders one node. The first line carries no indent — the caller has already
 * placed it — and every line after it is indented from `depth`.
 */
function render(
  value: unknown,
  path: string,
  depth: number,
  layouts: Record<string, Layout>,
): string {
  const layout = layouts[path] ?? 'inline'
  const pad = INDENT.repeat(depth + 1)
  const close = INDENT.repeat(depth)

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const item = (entry: unknown, itemDepth: number): string =>
      render(entry, `${path}[]`, itemDepth, layouts)
    if (layout === 'inline') return `[${value.map((entry) => item(entry, depth)).join(', ')}]`
    if (typeof layout === 'number') {
      const rows: string[] = []
      for (let i = 0; i < value.length; i += layout) {
        rows.push(
          pad +
            value
              .slice(i, i + layout)
              .map((entry) => item(entry, depth + 1))
              .join(', '),
        )
      }
      return `[\n${rows.join(',\n')}\n${close}]`
    }
    return `[\n${value.map((entry) => pad + item(entry, depth + 1)).join(',\n')}\n${close}]`
  }

  if (typeof value === 'object' && value !== null) {
    const entries = orderedEntries(value as Record<string, unknown>, path)
    if (entries.length === 0) return '{}'
    const property = (key: string, entry: unknown, entryDepth: number): string =>
      `${JSON.stringify(key)}: ${render(entry, childPath(path, key), entryDepth, layouts)}`
    if (layout !== 'block') {
      return `{ ${entries.map(([key, entry]) => property(key, entry, depth)).join(', ')} }`
    }
    const lines = entries.map(([key, entry]) => pad + property(key, entry, depth + 1))
    return `{\n${lines.join(',\n')}\n${close}}`
  }

  return JSON.stringify(value)
}

/**
 * Git-first project text (D4), and the only serialization: what *Download*
 * writes today and what the desktop app writes to disk from F3. Byte-identical
 * for equal projects, whatever order their keys were built in.
 */
export function serializeProject(project: Project): string {
  // One screen row per line. Geometry is project-wide here, so both grids wrap
  // at the same width; the guard is for a project that has not been validated.
  const columns = Math.max(1, Math.trunc(project.settings?.columns) || 1)
  const layouts: Record<string, Layout> = {
    ...LAYOUT,
    'screens[].cells': columns,
    'screens[].colors': columns,
  }
  return `${render(project, '', 0, layouts)}\n`
}

/**
 * Content identity for D5's "a write that would not change the file does not
 * happen". `modifiedAt` is excluded — it is a consequence of a change, never
 * one — so a project that autosave revisits without an edit hashes the same and
 * is not written. This is change detection, not integrity: two 32-bit FNV-1a
 * passes under different offset bases, printed as 16 hex digits.
 */
export function projectContentHash(project: Project): string {
  const text = serializeProject({ ...project, modifiedAt: '' })
  return fnv1a(text, 0x811c9dc5) + fnv1a(text, 0x9dc5811c)
}

function fnv1a(text: string, basis: number): string {
  let hash = basis
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
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
