/**
 * Export table extraction — turns a project's charset, screens and registers
 * into flat byte arrays and named segments that the format renderers (assembly
 * / BASIC / PRG / binary) consume.
 *
 * Every segment carries the address it belongs at on the machine, because two
 * of the four formats need it: PRG puts it in the two-byte header, and the
 * generated BASIC loader pokes into it (PLAN.md D12, D13).
 */

import type { Project } from '../types'
import { isCharMulticolor, patternBytes } from '../modes'
import { DEFAULT_FG } from '../palette'
import { VIC_BASE, charBaseAddress, colorRamAddress, registerBytes } from '../vic'

/** The two things a project can be exported as; sprites are gone (D11). */
export type ExportScope = 'charset' | 'screen'

/** A labeled run of bytes — one table (or one table per screen). */
export interface ByteSegment {
  /** Assembler/BASIC label (valid identifier, no punctuation). Also its id. */
  label: string
  /** Human description for header comments. */
  description: string
  bytes: number[]
  /** Bytes per line when rendered to text. */
  perLine: number
  /** CPU address the block belongs at — the PRG header and loader target. */
  loadAddress: number
}

/** Pattern table for the charset: `charCount × charHeight` bytes. */
export function patternTableBytes(project: Project): number[] {
  const height = patternBytes(project.settings.charHeight)
  const out: number[] = []
  for (const pattern of project.charset) {
    for (let i = 0; i < height; i++) out.push(pattern[i] ?? 0)
  }
  return out
}

/** Name table for one screen: the row-major cell codes. */
export function nameTableBytes(project: Project, screenIndex: number): number[] {
  return (project.screens[screenIndex]?.cells ?? []).map((code) => code & 0xff)
}

/**
 * Color RAM for one screen: the cell's color in bits 0–2 with bit 3 set when
 * the character it holds renders as multicolor. The flag is a property of the
 * character in this editor (D2), but the hardware reads it per cell, so that is
 * how it is written out.
 */
export function colorRamBytes(project: Project, screenIndex: number): number[] {
  const screen = project.screens[screenIndex]
  if (!screen) return []
  return screen.cells.map((code, i) => {
    const color = (screen.colors[i] ?? DEFAULT_FG) & 0x07
    return isCharMulticolor(project, code) ? color | 0x08 : color
  })
}

/** Slugify a name into a safe assembler identifier (leading digit → `_`). */
export function labelSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!slug) return 'untitled'
  return /^[0-9]/.test(slug) ? `_${slug}` : slug
}

/** Segments for a character-set export: the pattern table. */
export function charsetSegments(project: Project): ByteSegment[] {
  return [
    {
      label: 'char_patterns',
      description: 'Character patterns',
      bytes: patternTableBytes(project),
      perLine: patternBytes(project.settings.charHeight),
      loadAddress: charBaseAddress(project.settings.charBase),
    },
  ]
}

/**
 * Segments for a screen export — the name table and the color RAM beside it,
 * per selected screen. Both are needed to reproduce the screen (D7).
 *
 * Every screen in a project shares one video matrix, so exporting several gives
 * them all the same load address: only one can be resident at a time, and which
 * one is the program's business, not the exporter's.
 */
export function screenSegments(project: Project, screenIndices: number[]): ByteSegment[] {
  const { columns, screenBase } = project.settings
  const colorBase = colorRamAddress(screenBase)
  return screenIndices.flatMap((index) => {
    const name = project.screens[index]?.name ?? `Screen ${index + 1}`
    return [
      {
        label: `screen_${index + 1}`,
        description: `Screen: ${name}`,
        bytes: nameTableBytes(project, index),
        perLine: columns,
        loadAddress: screenBase,
      },
      {
        label: `colors_${index + 1}`,
        description: `Color RAM: ${name}`,
        bytes: colorRamBytes(project, index),
        perLine: columns,
        loadAddress: colorBase,
      },
    ]
  })
}

/**
 * The sixteen configured register bytes as a segment (D14). The description
 * stays bare because every renderer prints the load address beside it, and
 * "VIC registers $9000-$900F at $9000" reads like a stutter.
 */
export function registerSegment(project: Project): ByteSegment {
  return {
    label: 'vic_registers',
    description: 'VIC registers',
    bytes: registerBytes(project.settings),
    perLine: 8,
    loadAddress: VIC_BASE,
  }
}

/**
 * Every segment a scope can offer, in emission order. Registers come last so a
 * generated loader pokes them *after* the data they describe — pointing $9005
 * at a chargen block that has not been filled yet shows a screen of garbage.
 */
export function availableSegments(
  project: Project,
  scope: ExportScope,
  screenIndices: number[],
): ByteSegment[] {
  const data =
    scope === 'charset' ? charsetSegments(project) : screenSegments(project, screenIndices)
  return [...data, registerSegment(project)]
}
