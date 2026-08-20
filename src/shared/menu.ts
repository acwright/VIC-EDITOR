/**
 * The native menu's action table.
 *
 * Every menu item that does something the editor already does names the
 * **shortcut action id** it dispatches rather than inventing a command of its
 * own (D10). `src/renderer/src/utils/shortcuts.ts` stays the single source of
 * truth for what an action means; this table only says where it appears in the
 * menu bar and what it is called there. `menu.spec.ts` holds the two together —
 * every action in the union appears here exactly once, and every label matches
 * the shortcut's own description.
 *
 * **No item carries an accelerator, deliberately.** A registered accelerator
 * fires the menu item *and* still delivers the keydown to the page (§3.5), so
 * an accelerated menu item would run its action twice — and would run it while
 * the user is typing in a text field, which the renderer's key handler is
 * careful not to do. Keys stay entirely the renderer's job, exactly as on the
 * web; the menu is a click surface, and Help ▸ Keyboard shortcuts is where the
 * keys are advertised. Menu items built from Electron *roles* (Copy, Reload,
 * Quit) keep their standard accelerators — the editor's map binds none of them.
 */

/**
 * Where an item sits. `character`, `brush` and `color` are submenus of Edit and
 * `view` is the View menu's app-specific block; the rest name their menu.
 */
export type MenuSection = 'file' | 'edit' | 'character' | 'brush' | 'color' | 'view' | 'help'

export interface MenuActionItem {
  /** The `EditorAction` or `ManagerAction` this item dispatches. */
  action: string
  /** The item's label — the shortcut's own description. */
  label: string
  section: MenuSection
  /** Start a new separated group at this item. */
  separatorBefore?: boolean
}

export const MENU_ACTIONS: readonly MenuActionItem[] = [
  { action: 'newProject', label: 'New project', section: 'file' },
  { action: 'save', label: 'Save now', section: 'file', separatorBefore: true },
  { action: 'back', label: 'Back to the project list', section: 'file', separatorBefore: true },

  { action: 'undo', label: 'Undo', section: 'edit' },
  { action: 'redo', label: 'Redo', section: 'edit' },

  { action: 'prevChar', label: 'Previous character', section: 'character' },
  { action: 'nextChar', label: 'Next character', section: 'character' },
  { action: 'fill', label: 'Fill the character', section: 'character', separatorBefore: true },
  { action: 'clear', label: 'Clear the character', section: 'character' },
  { action: 'invert', label: 'Invert the character', section: 'character' },
  { action: 'flipH', label: 'Flip horizontal', section: 'character', separatorBefore: true },
  { action: 'flipV', label: 'Flip vertical', section: 'character' },
  { action: 'rotateRight', label: 'Rotate right', section: 'character' },
  { action: 'rotateLeft', label: 'Rotate left', section: 'character' },
  {
    action: 'shiftLeft',
    label: 'Shift the pattern left',
    section: 'character',
    separatorBefore: true,
  },
  { action: 'shiftRight', label: 'Shift the pattern right', section: 'character' },
  { action: 'shiftUp', label: 'Shift the pattern up', section: 'character' },
  { action: 'shiftDown', label: 'Shift the pattern down', section: 'character' },

  { action: 'brushChar', label: 'Brush: character', section: 'brush' },
  { action: 'brushColor', label: 'Brush: color', section: 'brush' },
  { action: 'brushBoth', label: 'Brush: both', section: 'brush' },

  { action: 'slotScreen', label: 'Target the screen color', section: 'color' },
  { action: 'slotBorder', label: 'Target the border color', section: 'color' },
  { action: 'slotChar', label: 'Target the character color', section: 'color' },
  { action: 'slotAux', label: 'Target the auxiliary color', section: 'color' },

  { action: 'prevScreen', label: 'Previous screen', section: 'view' },
  { action: 'nextScreen', label: 'Next screen', section: 'view' },
  { action: 'zoomIn', label: 'Zoom in', section: 'view', separatorBefore: true },
  { action: 'zoomOut', label: 'Zoom out', section: 'view' },
  { action: 'toggleGrid', label: 'Grid overlay', section: 'view', separatorBefore: true },
  { action: 'toggleAspect', label: 'Aspect-corrected preview', section: 'view' },

  { action: 'help', label: 'Keyboard shortcuts', section: 'help' },
]

/**
 * What the menu should offer right now, as reported by the renderer.
 *
 * The renderer owns this because the question "does this action mean anything
 * in the view on screen" is one the shortcut map already answers, and
 * restating it in the main process is exactly the drift D10 exists to prevent.
 * Main receives the answer, not the question.
 */
export interface MenuContext {
  /** Action ids that are live; every other item is disabled. */
  enabled: readonly string[]
  /** Labels, keyed by action, as the view on screen words them. */
  labels: Readonly<Record<string, string>>
}

/** Nothing is live until the renderer says otherwise. */
export const EMPTY_MENU_CONTEXT: MenuContext = { enabled: [], labels: {} }
