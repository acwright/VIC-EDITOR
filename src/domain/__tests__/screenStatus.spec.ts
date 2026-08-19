import { describe, expect, it } from 'vitest'
import { createProject } from '../factory'
import { formatScreenStatus, screenStatus } from '../screenStatus'

function project() {
  return createProject({ seed: 'blank', name: 'P', type: 'hires' })
}

describe('screenStatus', () => {
  it('reports the idle form with the screen dimensions when nothing is hovered', () => {
    const p = project()
    expect(screenStatus(p, p.screens[0]!, null)).toEqual({
      active: false,
      coords: '22 × 23 cells (506)',
      pixel: '176 × 184 px',
      details: [],
    })
  })

  it('measures the idle form against the project’s own geometry', () => {
    const tall = createProject({
      seed: 'blank',
      name: 'T',
      type: 'hires',
      settings: { columns: 16, rows: 16, charHeight: 16 },
    })
    const status = screenStatus(tall, tall.screens[0]!, null)
    expect(status.coords).toBe('16 × 16 cells (256)')
    expect(status.pixel).toBe('128 × 256 px')
  })

  it('gives coordinates, the cell origin, the character and its color RAM value', () => {
    const p = project()
    const screen = p.screens[0]!
    screen.cells[5 * p.settings.columns + 12] = 0x41
    screen.colors[5 * p.settings.columns + 12] = 5
    const status = screenStatus(p, screen, { x: 12, y: 5 })
    expect(status.active).toBe(true)
    expect(status.coords).toBe('X 12  Y 5')
    expect(status.pixel).toBe('px 96, 40')
    expect(status.details).toEqual(['char $41 (65)', 'color 5 Green', 'hires'])
  })

  it('reports how the cell renders in a mixed project (D2)', () => {
    const p = createProject({ seed: 'blank', name: 'M', type: 'mixed' })
    const screen = p.screens[0]!
    screen.cells[0] = 9
    p.charModes![9] = true
    expect(screenStatus(p, screen, { x: 0, y: 0 }).details).toContain('multicolor')
  })

  it('falls back to the idle form for out-of-bounds cells', () => {
    const p = project()
    for (const cell of [
      { x: -1, y: 0 },
      { x: p.settings.columns, y: 0 },
      { x: 0, y: p.settings.rows },
    ]) {
      expect(screenStatus(p, p.screens[0]!, cell).active).toBe(false)
    }
  })

  it('formats a status as one separated line', () => {
    const p = project()
    expect(formatScreenStatus(screenStatus(p, p.screens[0]!, { x: 1, y: 1 }))).toBe(
      'X 1  Y 1  ·  px 8, 8  ·  char $20 (32)  ·  color 6 Blue  ·  hires',
    )
  })
})
