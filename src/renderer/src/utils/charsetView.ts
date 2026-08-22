/**
 * How the character-set picker arranges its glyphs.
 *
 * The blocks view scales the whole set to the space it is given, which is the
 * best reading of a character set when there is room and the worst when there
 * is not: on a short window the glyphs shrink toward unreadable. So the layout
 * is a choice, remembered per browser rather than per project — it is a
 * property of the screen you are working on, not of the file.
 *
 * Named here rather than in the picker so `persistence/preferences.ts` can
 * validate a stored value without importing a component.
 */

export type CharsetView = 'blocks' | 'grid' | 'list'

export interface CharsetViewInfo {
  view: CharsetView
  /**
   * The layout's button: its tooltip and its accessible name. Names the view
   * the way the rest of the app's tooltips name their action — when each is
   * the right one is the file comment above, not something to read on hover.
   */
  label: string
}

export const CHARSET_VIEWS: readonly CharsetViewInfo[] = [
  { view: 'blocks', label: 'Blocks View' },
  { view: 'grid', label: 'Grid View' },
  { view: 'list', label: 'List View' },
]

export const DEFAULT_CHARSET_VIEW: CharsetView = 'blocks'

/** Below this the blocks view has no height to scale into. Tailwind's `sm`. */
const NARROW_VIEWPORT_PX = 640

/**
 * Where a browser with no stored choice starts. Blocks scales the whole set to
 * the space it is given, and on a phone that is a sliver — the scrolling grid
 * is the readable one there. Only ever a starting point: an explicit choice is
 * stored and always wins, and this is not consulted again once one exists.
 */
export function defaultCharsetView(): CharsetView {
  if (typeof window === 'undefined') return DEFAULT_CHARSET_VIEW
  return window.innerWidth < NARROW_VIEWPORT_PX ? 'grid' : DEFAULT_CHARSET_VIEW
}

export function isCharsetView(value: unknown): value is CharsetView {
  return CHARSET_VIEWS.some((entry) => entry.view === value)
}
