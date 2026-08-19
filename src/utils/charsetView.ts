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
  label: string
  /** Tooltip: what this layout does, and when it is the right one. */
  hint: string
}

export const CHARSET_VIEWS: readonly CharsetViewInfo[] = [
  {
    view: 'blocks',
    label: 'Blocks',
    hint: 'Blocks — the set in halves of 128, scaled to fit the space. Best with height to spare.',
  },
  {
    view: 'grid',
    label: 'Grid',
    hint: 'Grid — eight glyphs a row at a fixed size, scrolling. Best on a short window.',
  },
  {
    view: 'list',
    label: 'List',
    hint: 'List — one glyph a row with its code, scrolling. Best for finding a character by number.',
  },
]

export const DEFAULT_CHARSET_VIEW: CharsetView = 'blocks'

export function isCharsetView(value: unknown): value is CharsetView {
  return CHARSET_VIEWS.some((entry) => entry.view === value)
}
