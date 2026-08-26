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

import { SAMPLES } from '@/samples'
import { MENU_ACTIONS, type MenuContext, type MenuSample } from '@shared/menu'
import { desktop } from './desktop'
import { MANAGER_SHORTCUTS, editorActions, menuAccelerators, shell } from './shortcuts'

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
/**
 * *New from Sample ▸*, as main needs it (F7).
 *
 * Both views report the same list because the samples are the app's, not the
 * view's — what changes between them is what else is live, not which samples
 * exist. Names only: the build function stays on this side, and main sends back
 * the id it was given.
 */
function menuSamples(): MenuSample[] {
  return SAMPLES.map((sample) => ({ id: sample.id, name: sample.name }))
}

/**
 * What the menu offers while a project is open.
 *
 * `newProject` is live here as well as on the start screen: File ▸ New Project…
 * has to work while a document is open, and D17 says what happens then — the
 * editor flushes into the file it has, and the new document replaces it.
 * `saveCopy` is the menu's own command (F7), and needs a project to copy.
 */
export function editorMenuContext(): MenuContext {
  return {
    enabled: [...editorActions(), 'newProject', 'saveCopy'],
    labels: labels(),
    accelerators: menuAccelerators(),
    samples: menuSamples(),
  }
}

/** What the menu offers on the project list, where no project is open. */
export function managerMenuContext(): MenuContext {
  return {
    enabled: MANAGER_SHORTCUTS.map((entry) => entry.action),
    labels: labels(),
    accelerators: menuAccelerators(),
    samples: menuSamples(),
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
