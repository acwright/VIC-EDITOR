import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Window size and position, remembered across launches in
 * `<userData>/window-state.json`.
 *
 * Synchronous I/O, on the reference project's `SettingsService` model: the file
 * is one small object, it is read once at launch and written after the user
 * stops dragging, and any read failure falls back to the defaults rather than
 * blocking startup on a corrupt file.
 */

export interface WindowState {
  width: number
  height: number
  /** Absent until the window has been moved — a fresh window is centred. */
  x?: number
  y?: number
  maximized: boolean
}

/** Roomy enough for both editor columns plus the character set list. */
export const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1280,
  height: 860,
  maximized: false,
}

/**
 * The floor the layout stays usable at, measured against the running app
 * rather than guessed (§5).
 *
 * 1024 is the width at which the character and screen columns stop sitting
 * side by side and collapse into the tab split — the responsive layout the web
 * build needs on a phone, and not what a desktop window should be resizable
 * into. 640 is the height at which the screen preview drops from 2× to 1×.
 * Nothing overflows below either number; the layout just stops being the
 * desktop one.
 */
export const MIN_WINDOW_SIZE = { width: 1024, height: 640 }

const FILE = (): string => join(app.getPath('userData'), 'window-state.json')

/** Debounce: `resize` and `move` fire continuously while a drag is in flight. */
const SAVE_DELAY = 500

export function loadWindowState(): WindowState {
  let state: WindowState
  try {
    const parsed = JSON.parse(readFileSync(FILE(), 'utf-8')) as Partial<WindowState>
    state = {
      width: numberOr(parsed.width, DEFAULT_WINDOW_STATE.width),
      height: numberOr(parsed.height, DEFAULT_WINDOW_STATE.height),
      x: Number.isFinite(parsed.x) ? parsed.x : undefined,
      y: Number.isFinite(parsed.y) ? parsed.y : undefined,
      maximized: parsed.maximized === true,
    }
  } catch {
    return { ...DEFAULT_WINDOW_STATE }
  }

  state.width = Math.max(state.width, MIN_WINDOW_SIZE.width)
  state.height = Math.max(state.height, MIN_WINDOW_SIZE.height)

  // The display the window was last on may be gone — a laptop undocked, a
  // second monitor unplugged. Restoring those coordinates puts the window
  // somewhere the user cannot reach it, so drop them and let it centre.
  if (state.x === undefined || state.y === undefined || !onSomeDisplay(state)) {
    delete state.x
    delete state.y
  }
  return state
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/** Whether the saved rectangle still overlaps the work area of an attached display. */
function onSomeDisplay(state: WindowState): boolean {
  const bounds: Rectangle = {
    x: state.x ?? 0,
    y: state.y ?? 0,
    width: state.width,
    height: state.height,
  }
  return screen.getAllDisplays().some((display) => intersects(display.workArea, bounds))
}

function intersects(a: Rectangle, b: Rectangle): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  )
}

/**
 * Keep `window`'s size and position on disk.
 *
 * `getNormalBounds` rather than `getBounds`: a window closed while maximized or
 * in fullscreen should reopen maximized *and*, once restored, back at the size
 * it had before — which is what the un-maximized bounds record.
 */
export function trackWindowState(window: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined

  const capture = (): WindowState => ({
    ...window.getNormalBounds(),
    maximized: window.isMaximized(),
  })

  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => save(capture()), SAVE_DELAY)
  }

  window.on('resize', schedule)
  window.on('move', schedule)
  window.on('maximize', schedule)
  window.on('unmaximize', schedule)

  // The debounce would otherwise lose the last drag of the session.
  window.on('close', () => {
    clearTimeout(timer)
    save(capture())
  })
}

function save(state: WindowState): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(FILE(), JSON.stringify(state, null, 2), 'utf-8')
  } catch (error) {
    // A window that cannot remember where it was is not a reason to fail.
    console.error('[windowState] save:', error)
  }
}
