/**
 * Canvas rendering shared by the live screen editor (ScreenCanvas.vue) and PNG
 * export. Draws at 1 logical pixel per screen pixel; callers scale the canvas.
 *
 * A cell is always 8 screen pixels wide and `charHeight` tall, whether it holds
 * 8 hires pixels or 4 double-wide multicolor ones (PLAN.md D10), and every
 * color it draws comes from `domain/colors` — the cell's own color RAM value
 * plus the project's screen, border and auxiliary registers.
 */

import * as charOps from '@/domain/charOps'
import { cellColorHexes, colorHex } from '@/domain/colors'
import { CELL_SCREEN_WIDTH, cellShape, isCharMulticolor } from '@/domain/modes'
import type { CellShape } from '@/domain/modes'
import { DEFAULT_FG } from '@/domain/palette'
import type { Project, Screen } from '@/domain/types'

/** Columns in the exported charset sheet; rows follow from the char count. */
export const CHARSET_SHEET_COLS = 16

/** Logical pixel size of a screen, in screen pixels. */
export function screenPixelSize(project: Project): { width: number; height: number } {
  const { columns, rows, charHeight } = project.settings
  return { width: columns * CELL_SCREEN_WIDTH, height: rows * charHeight }
}

/** Logical pixel size of the charset sheet. */
export function charsetSheetSize(project: Project): { width: number; height: number } {
  const { charCount, charHeight } = project.settings
  const rows = Math.ceil(charCount / CHARSET_SHEET_COLS)
  return { width: CHARSET_SHEET_COLS * CELL_SCREEN_WIDTH, height: rows * charHeight }
}

/** Draw one screen into `ctx` at logical size (origin 0,0). */
export function renderScreen(
  ctx: CanvasRenderingContext2D,
  project: Project,
  screen: Screen,
): void {
  const { columns, rows } = project.settings
  const { width, height } = screenPixelSize(project)
  ctx.fillStyle = colorHex(project.settings.screenColor)
  ctx.fillRect(0, 0, width, height)
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < columns; cx++) {
      const index = cy * columns + cx
      const code = screen.cells[index] ?? 0
      const pattern = project.charset[code]
      if (!pattern) continue
      const shape = cellShape(project, code)
      const colors = cellColorHexes(
        project,
        screen.colors[index] ?? DEFAULT_FG,
        isCharMulticolor(project, code),
      )
      drawCell(ctx, pattern, shape, colors, cx * CELL_SCREEN_WIDTH, cy * shape.height)
    }
  }
}

/**
 * Draw the charset as a 16-column sheet into `ctx`. Glyphs have no color of
 * their own, so they are drawn in the brush color the caller passes.
 */
export function renderCharsetSheet(
  ctx: CanvasRenderingContext2D,
  project: Project,
  fg: number = DEFAULT_FG,
): void {
  const { width, height } = charsetSheetSize(project)
  ctx.fillStyle = colorHex(project.settings.screenColor)
  ctx.fillRect(0, 0, width, height)
  for (let code = 0; code < project.charset.length; code++) {
    const pattern = project.charset[code]
    if (!pattern) continue
    const shape = cellShape(project, code)
    const colors = cellColorHexes(project, fg, isCharMulticolor(project, code))
    const col = code % CHARSET_SHEET_COLS
    const row = Math.floor(code / CHARSET_SHEET_COLS)
    drawCell(ctx, pattern, shape, colors, col * CELL_SCREEN_WIDTH, row * shape.height)
  }
}

/**
 * Draw one cell. `colors` holds the hex color of each pixel value, in value
 * order; a multicolor cell's 4 pixels are each drawn 2 screen pixels wide.
 */
export function drawCell(
  ctx: CanvasRenderingContext2D,
  pattern: number[],
  shape: CellShape,
  colors: string[],
  originX: number,
  originY: number,
): void {
  const pixelWidth = CELL_SCREEN_WIDTH / shape.width
  for (let y = 0; y < shape.height; y++) {
    for (let x = 0; x < shape.width; x++) {
      const value = charOps.getPixel(pattern, shape, x, y)
      ctx.fillStyle = colors[value] ?? colors[0] ?? '#000000'
      ctx.fillRect(originX + x * pixelWidth, originY + y, pixelWidth, 1)
    }
  }
}

/**
 * Render a screen (or charset sheet) to a fresh, upscaled canvas for PNG
 * export. Smoothing is off so the pixels stay crisp.
 */
export function renderToScaledCanvas(
  logicalWidth: number,
  logicalHeight: number,
  scale: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const base = document.createElement('canvas')
  base.width = logicalWidth
  base.height = logicalHeight
  const baseCtx = base.getContext('2d')
  if (!baseCtx) throw new Error('2D canvas context unavailable')
  draw(baseCtx)

  const out = document.createElement('canvas')
  out.width = logicalWidth * scale
  out.height = logicalHeight * scale
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(base, 0, 0, out.width, out.height)
  return out
}

/** PNG canvas for one screen at `scale`× (logical pixels → CSS pixels). */
export function screenToCanvas(project: Project, screen: Screen, scale: number): HTMLCanvasElement {
  const { width, height } = screenPixelSize(project)
  return renderToScaledCanvas(width, height, scale, (ctx) => renderScreen(ctx, project, screen))
}

/** PNG canvas for the charset sheet at `scale`×. */
export function charsetSheetToCanvas(
  project: Project,
  scale: number,
  fg: number = DEFAULT_FG,
): HTMLCanvasElement {
  const { width, height } = charsetSheetSize(project)
  return renderToScaledCanvas(width, height, scale, (ctx) => renderCharsetSheet(ctx, project, fg))
}
