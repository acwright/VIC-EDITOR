/**
 * Screen pointer status — the read-only line under the screen canvas. Pure:
 * given the project, the screen, and the cell the pointer is over (null when it
 * isn't), produce the strings to display.
 */

import { CELL_SCREEN_WIDTH, cellCount, isCharMulticolor } from './modes'
import { DEFAULT_FG, PALETTE } from './palette'
import type { Project, Screen } from './types'

export interface PointerCell {
  x: number
  y: number
}

export interface ScreenStatus {
  /** False when the pointer is off the canvas — the idle (dimensions) form. */
  active: boolean
  /** Cell coordinates, or the screen's size in cells when idle. */
  coords: string
  /** Top-left pixel of the cell, or the screen's size in pixels when idle. */
  pixel: string
  /** Facts about the cell under the pointer; empty when idle. */
  details: string[]
}

function hex(value: number): string {
  return '$' + value.toString(16).toUpperCase().padStart(2, '0')
}

/** Status for the cell under the pointer; pass `null` for the idle readout. */
export function screenStatus(
  project: Project,
  screen: Screen | null | undefined,
  cell: PointerCell | null,
): ScreenStatus {
  const { columns, rows, charHeight } = project.settings
  const inBounds = cell !== null && cell.x >= 0 && cell.x < columns && cell.y >= 0 && cell.y < rows

  if (!cell || !inBounds) {
    return {
      active: false,
      coords: `${columns} × ${rows} cells (${cellCount(project.settings)})`,
      pixel: `${columns * CELL_SCREEN_WIDTH} × ${rows * charHeight} px`,
      details: [],
    }
  }

  const index = cell.y * columns + cell.x
  const code = screen?.cells[index] ?? 0
  const color = screen?.colors[index] ?? DEFAULT_FG
  const multicolor = isCharMulticolor(project, code)

  return {
    active: true,
    coords: `X ${cell.x}  Y ${cell.y}`,
    pixel: `px ${cell.x * CELL_SCREEN_WIDTH}, ${cell.y * charHeight}`,
    details: [
      `char ${hex(code)} (${code})`,
      // Color RAM value with the name it draws, then how the cell reads it.
      `color ${color} ${PALETTE[color]?.name ?? '?'}`,
      multicolor ? 'multicolor' : 'hires',
    ],
  }
}

/** One-line rendering of a status, for the panel's status bar. */
export function formatScreenStatus(status: ScreenStatus): string {
  return [status.coords, status.pixel, ...status.details].join('  ·  ')
}
