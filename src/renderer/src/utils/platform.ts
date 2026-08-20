/**
 * Platform-aware keyboard shortcut labels for tooltips:
 * ⌘/⌥/⇧ glyphs on Apple platforms, Ctrl/Alt/Shift+ elsewhere.
 */

export const isMac =
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.userAgent)

/** Ctrl/Cmd + key, e.g. "⌘Z" / "Ctrl+Z" */
export function modLabel(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`
}

/** Shift + Ctrl/Cmd + key, e.g. "⇧⌘Z" / "Shift+Ctrl+Z" */
export function shiftModLabel(key: string): string {
  return isMac ? `⇧⌘${key}` : `Shift+Ctrl+${key}`
}

/** Alt/Option + key, e.g. "⌥←" / "Alt+←" */
export function altLabel(key: string): string {
  return isMac ? `⌥${key}` : `Alt+${key}`
}

/** Shift + key, e.g. "⇧R" / "Shift+R" */
export function shiftLabel(key: string): string {
  return isMac ? `⇧${key}` : `Shift+${key}`
}
