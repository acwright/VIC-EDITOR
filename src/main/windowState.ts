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
  /**
   * Whether `width`/`height` describe the *content* area rather than the whole
   * window. True only on a first launch: the default is a statement about how
   * much room the layout needs, and the title bar it has to sit under is 32 px
   * on macOS but not on Windows or Linux. Once the user has sized the window
   * themselves the saved numbers are window bounds, which is what
   * `getNormalBounds` reports and what restores exactly.
   */
  useContentSize: boolean
}

/**
 * The content area a fresh window opens with — the size the editor was
 * designed to be used at, not the smallest size it survives.
 *
 * Both numbers are measurements taken from the running app across every
 * sample. **1600** clears the widest toolbar with room to spare: the screen
 * editor's toolbar wraps onto a second row below 1500 px of viewport. **1200**
 * clears the tallest left column: a mixed project needs 1103 px of viewport
 * before its per-character mode controls push the character set off the
 * bottom, and the margin above that is what turns "nothing is clipped" into
 * "the picker is worth looking at".
 *
 * Both are clamped to the display's work area on launch, so a smaller screen
 * gets the largest window it can show rather than one hanging off the edge.
 */
export const DEFAULT_CONTENT_SIZE = { width: 1600, height: 1200 }

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

/**
 * Headroom kept between the default *content* size and the work area, since
 * the frame around that content is what actually has to fit. 40 px covers the
 * tallest of the three title bars with room to spare; it only ever bites on a
 * display too short for the default anyway.
 */
const FRAME_ALLOWANCE = 40

const FILE = (): string => join(app.getPath('userData'), 'window-state.json')

/** Debounce: `resize` and `move` fire continuously while a drag is in flight. */
const SAVE_DELAY = 500

export function loadWindowState(): WindowState {
  const fallback = defaultWindowState()
  let state: WindowState
  try {
    const parsed = JSON.parse(readFileSync(FILE(), 'utf-8')) as Partial<WindowState>
    state = {
      width: numberOr(parsed.width, fallback.width),
      height: numberOr(parsed.height, fallback.height),
      x: Number.isFinite(parsed.x) ? parsed.x : undefined,
      y: Number.isFinite(parsed.y) ? parsed.y : undefined,
      maximized: parsed.maximized === true,
      useContentSize: false,
    }
  } catch {
    return fallback
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

/**
 * A first launch: the measured content size, but never taller or wider than
 * the display can show. A window sized past the work area is not a bigger
 * window, it is one with its bottom edge off the screen — worse than the
 * scrolling this default exists to avoid, and impossible to fix by dragging
 * the edge that is now under the Dock.
 */
function defaultWindowState(): WindowState {
  const { workAreaSize } = screen.getPrimaryDisplay()
  return {
    width: Math.min(DEFAULT_CONTENT_SIZE.width, workAreaSize.width - FRAME_ALLOWANCE),
    height: Math.min(DEFAULT_CONTENT_SIZE.height, workAreaSize.height - FRAME_ALLOWANCE),
    maximized: false,
    useContentSize: true,
  }
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
    // What is saved is always the whole window, whatever the window was
    // created from.
    useContentSize: false,
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
  // `useContentSize` describes how a window was *created*, not where it ended
  // up, so it is not part of what a saved window is.
  const { width, height, x, y, maximized } = state
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(FILE(), JSON.stringify({ width, height, x, y, maximized }, null, 2), 'utf-8')
  } catch (error) {
    // A window that cannot remember where it was is not a reason to fail.
    console.error('[windowState] save:', error)
  }
}
