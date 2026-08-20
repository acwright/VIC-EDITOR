/**
 * The native menu, from the renderer's side.
 *
 * The menu bar is built in the main process, but what it *offers* is decided
 * here: which actions mean something in the view on screen, and what they are
 * called. Both answers already exist in the shortcut map, so this file reads
 * them off it rather than restating them — a menu item and its keyboard
 * shortcut cannot disagree when the same list produced both (D10).
 *
 * Every function is a no-op in the browser build, where `window.api` is
 * undefined. The views call them unconditionally.
 */

import type { MenuContext } from '@shared/menu'
import { desktop } from './desktop'
import { EDITOR_SHORTCUTS, MANAGER_SHORTCUTS, editorActions, type Shortcut } from './shortcuts'

function labelsFor(shortcuts: readonly Shortcut[]): Record<string, string> {
  return Object.fromEntries(shortcuts.map((entry) => [entry.action, entry.description]))
}

/** What the menu offers while a project is open. */
export function editorMenuContext(): MenuContext {
  return { enabled: editorActions(), labels: labelsFor(EDITOR_SHORTCUTS) }
}

/** What the menu offers on the project list, where no project is open. */
export function managerMenuContext(): MenuContext {
  return {
    enabled: MANAGER_SHORTCUTS.map((entry) => entry.action),
    labels: labelsFor(MANAGER_SHORTCUTS),
  }
}

/** Tell the native menu what this view offers. */
export function reportMenuContext(context: MenuContext): void {
  desktop()?.menu.setContext(context)
}

/**
 * Run `callback` when a menu item is chosen. Returns an unsubscribe function,
 * which is a no-op in the browser.
 */
export function onMenuAction(callback: (action: string) => void): () => void {
  return desktop()?.menu.onAction(callback) ?? (() => {})
}
