/**
 * The words that differ per shell (PLAN.md Phase F7).
 *
 * The two shells are not the same app. In the browser a project is a row in a
 * list you *upload* into and *download* out of; on the desktop it is a file you
 * *open* and *save a copy of*. Same buttons, same handlers, different nouns —
 * and the difference is a wording one, so it belongs in a table rather than in
 * an `if` inside a view. **No component branches on the shell** (D13); it asks
 * here and renders the answer.
 *
 * `back` is deliberately *not* here. Its two words — "Back to Projects" and
 * "Close Document" (D14) — are carried by the native menu's own table in
 * `src/shared/menu.ts`, because the File menu has an item for it and main has
 * to be sent the same string the button shows. `actionLabel('back')` in
 * `utils/menu.ts` is how a view asks for that one, and having it in two places
 * is exactly what this module exists to prevent.
 */

import { shell } from './shortcuts'

/** One phrase, in both shells. */
export interface ShellWords {
  browser: string
  desktop: string
}

/**
 * Every phrase that changes with the shell.
 *
 * Menu titles, so Title Case — these appear on buttons and in tooltips beside
 * items taken from `MENU_ACTIONS`, and a sentence among them would read as a
 * mistake. `strings.spec.ts` holds them to it.
 */
export const SHELL_WORDS = {
  /**
   * Bringing a project in. The browser reads a file into its own storage and
   * keeps the file; the desktop opens the file itself and edits it in place.
   */
  openProject: { browser: 'Upload Project', desktop: 'Open…' },
  /**
   * Writing a project out. In the browser that is a download of a copy the app
   * then forgets; on the desktop the document stays open and a *copy* of it
   * lands wherever the save dialog was pointed — which is why it is not
   * "Save As…".
   */
  saveCopy: { browser: 'Download', desktop: 'Save a Copy…' },
} as const satisfies Record<string, ShellWords>

export type ShellWord = keyof typeof SHELL_WORDS

/** A phrase, worded for the running shell. */
export function words(key: ShellWord): string {
  return SHELL_WORDS[key][shell()]
}
