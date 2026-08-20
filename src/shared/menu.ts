/**
 * The native menu's action table.
 *
 * Every menu item that does something the editor already does names the
 * **shortcut action id** it dispatches rather than inventing a command of its
 * own (D10). `src/renderer/src/utils/shortcuts.ts` stays the single source of
 * truth for what an action means; this table only says where it appears in the
 * menu bar and what it is called there. `menu.spec.ts` holds the two together —
 * every action in the union appears here exactly once, and nothing here is an
 * action the map does not declare.
 *
 * Labels are **menu titles, not the shortcut descriptions**: Title Case, and as
 * short as the surrounding menu allows, per the macOS HIG. "Save now" reads
 * correctly in the help sheet and wrongly in a File menu, so the two are worded
 * separately and `menu.spec.ts` checks the capitalisation. Inside the Brush and
 * Color Target submenus the submenu name carries the noun, so the items are
 * bare.
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
  /** The item's title, in Title Case. */
  label: string
  section: MenuSection
  /** Start a new separated group at this item. */
  separatorBefore?: boolean
}

export const MENU_ACTIONS: readonly MenuActionItem[] = [
  // The ellipsis is the HIG's promise that the command asks for something
  // before it does anything.
  { action: 'newProject', label: 'New Project…', section: 'file' },
  { action: 'save', label: 'Save', section: 'file', separatorBefore: true },
  { action: 'back', label: 'Back to Projects', section: 'file', separatorBefore: true },

  { action: 'undo', label: 'Undo', section: 'edit' },
  { action: 'redo', label: 'Redo', section: 'edit' },

  { action: 'prevChar', label: 'Previous Character', section: 'character' },
  { action: 'nextChar', label: 'Next Character', section: 'character' },
  { action: 'fill', label: 'Fill', section: 'character', separatorBefore: true },
  { action: 'clear', label: 'Clear', section: 'character' },
  { action: 'invert', label: 'Invert', section: 'character' },
  { action: 'flipH', label: 'Flip Horizontal', section: 'character', separatorBefore: true },
  { action: 'flipV', label: 'Flip Vertical', section: 'character' },
  { action: 'rotateRight', label: 'Rotate Right', section: 'character' },
  { action: 'rotateLeft', label: 'Rotate Left', section: 'character' },
  { action: 'shiftLeft', label: 'Shift Left', section: 'character', separatorBefore: true },
  { action: 'shiftRight', label: 'Shift Right', section: 'character' },
  { action: 'shiftUp', label: 'Shift Up', section: 'character' },
  { action: 'shiftDown', label: 'Shift Down', section: 'character' },

  { action: 'brushChar', label: 'Character', section: 'brush' },
  { action: 'brushColor', label: 'Color', section: 'brush' },
  { action: 'brushBoth', label: 'Both', section: 'brush' },

  { action: 'slotScreen', label: 'Screen', section: 'color' },
  { action: 'slotBorder', label: 'Border', section: 'color' },
  { action: 'slotChar', label: 'Character', section: 'color' },
  { action: 'slotAux', label: 'Auxiliary', section: 'color' },

  { action: 'prevScreen', label: 'Previous Screen', section: 'view' },
  { action: 'nextScreen', label: 'Next Screen', section: 'view' },
  { action: 'zoomIn', label: 'Zoom In', section: 'view', separatorBefore: true },
  { action: 'zoomOut', label: 'Zoom Out', section: 'view' },
  { action: 'toggleGrid', label: 'Grid Overlay', section: 'view', separatorBefore: true },
  { action: 'toggleAspect', label: 'Aspect-Corrected Preview', section: 'view' },

  { action: 'help', label: 'Keyboard Shortcuts', section: 'help' },
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
