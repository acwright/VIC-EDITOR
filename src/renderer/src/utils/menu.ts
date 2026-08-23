/**
 * The native menu, from the renderer's side.
 *
 * The menu bar is built in the main process, but what it *offers* is decided
 * here: which actions mean something in the view on screen, and what they are
 * called. The first answer comes off the shortcut map itself rather than a
 * restatement of it, so a menu item and its keyboard shortcut cannot disagree
 * (D10). The second comes off `MENU_ACTIONS`, which words items as menu titles
 * — the help sheet's sentences are not menu titles, so the two are written
 * separately. A title that differs between the shells is picked here too (D14),
 * so the main process never has to ask which shell it is in either.
 *
 * Every function is a no-op in the browser build, where `window.api` is
 * undefined. The views call them unconditionally.
 */

import { MENU_ACTIONS, type MenuContext } from '@shared/menu'
import { desktop } from './desktop'
import { MANAGER_SHORTCUTS, editorActions, shell } from './shortcuts'

/**
 * Every menu title. Nothing here varies by mode, so the only question is which
 * shell is asking.
 */
function labels(): Record<string, string> {
  return Object.fromEntries(MENU_ACTIONS.map((entry) => [entry.action, actionLabel(entry.action)]))
}

/**
 * One action's title, worded for this shell.
 *
 * Exported because the editor's own Back/Close button wants the same words its
 * File menu item has — "Back to Projects" in the browser, "Close Document" on
 * the desktop (D14) — and taking them from here is what stops the two drifting.
 */
export function actionLabel(action: string): string {
  const entry = MENU_ACTIONS.find((item) => item.action === action)
  if (!entry) return action
  return shell() === 'desktop' && entry.desktopLabel ? entry.desktopLabel : entry.label
}

/** What the menu offers while a project is open. */
export function editorMenuContext(): MenuContext {
  return { enabled: editorActions(), labels: labels() }
}

/** What the menu offers on the project list, where no project is open. */
export function managerMenuContext(): MenuContext {
  return { enabled: MANAGER_SHORTCUTS.map((entry) => entry.action), labels: labels() }
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
