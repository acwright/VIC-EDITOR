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
 * A handful of items are worded differently in the two shells, for the same
 * reason the shortcut map words their descriptions differently: on the desktop
 * `back` closes a document rather than returning to a list that does not exist
 * there (D14). The renderer picks, because it is the side that knows which
 * shell it is; main is sent the answer.
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
  /** The `EditorAction`, `ManagerAction` or `MenuCommand` this item dispatches. */
  action: string
  /** The item's title, in Title Case. */
  label: string
  /**
   * True for an item whose action is a `MenuCommand` rather than a shortcut —
   * a command the menu is the only surface for, so no key fires it and the
   * help sheet does not list it. `menu.spec.ts` reads this to know which of
   * the two tables an entry has to appear in.
   */
  command?: true
  /**
   * The title in the desktop shell, for an item that acts on a *document*
   * rather than on a list (D14). Only an action whose shortcut carries a
   * `desktopDescription` may have one.
   */
  desktopLabel?: string
  section: MenuSection
  /** Start a new separated group at this item. */
  separatorBefore?: boolean
}

/**
 * Commands the desktop menu is the only surface for (F7).
 *
 * Everything else in the table below is an action a key already fires, and the
 * menu only says where it appears; these have no key, because the keyboard map
 * is the *editor's* and these are the shell's file commands. They are still the
 * renderer's to perform — *Save a Copy…* serializes the open project and hands
 * it to a save dialog — so they travel the same `MENU_ACTION` channel and land
 * in the same handler table a shortcut would.
 *
 * Kept deliberately short. A command that would be worth a key belongs in
 * `utils/shortcuts.ts` instead, where the help sheet and the README can see it.
 */
export const MENU_COMMANDS = ['saveCopy'] as const

export type MenuCommand = (typeof MENU_COMMANDS)[number]

/**
 * *New from Sample ▸* (F7).
 *
 * The samples are the renderer's — main has never seen one — so the submenu is
 * built from what the view reports in its `MenuContext` and each item carries
 * the sample's own id back. A prefix rather than an entry per sample in
 * `MENU_COMMANDS`: the list is data, and a table that had to be edited every
 * time a sample was added would be a second place to forget.
 */
export const SAMPLE_ACTION_PREFIX = 'sample:'

/** The action id that asks for a new project from `id`. */
export function sampleAction(id: string): string {
  return `${SAMPLE_ACTION_PREFIX}${id}`
}

/** The sample an action names, or null when it names something else. */
export function sampleFromAction(action: string): string | null {
  return action.startsWith(SAMPLE_ACTION_PREFIX) ? action.slice(SAMPLE_ACTION_PREFIX.length) : null
}

/** One sample, as the menu needs it: something to call it, and its id. */
export interface MenuSample {
  id: string
  name: string
}

export const MENU_ACTIONS: readonly MenuActionItem[] = [
  // The ellipsis is the HIG's promise that the command asks for something
  // before it does anything. Open…, New from Sample ▸, Open Recent ▸ and
  // Reveal sit in this run too — they are main's own items, since none of them
  // is an action the renderer dispatches, and `menu.ts` places them.
  { action: 'newProject', label: 'New Project…', section: 'file' },
  {
    action: 'back',
    label: 'Back to Projects',
    // The desktop has no project list to go back to; it has a document to
    // close, and the start screen behind it (§4, D14).
    desktopLabel: 'Close Document',
    section: 'file',
    separatorBefore: true,
  },
  { action: 'save', label: 'Save', section: 'file' },
  // A *copy*: the open document stays open and this writes another file
  // somewhere else, which is why it is not "Save As…" (F7).
  { action: 'saveCopy', label: 'Save a Copy…', command: true, section: 'file' },

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
  /**
   * What *New from Sample ▸* offers (F7). The samples are bundled with the
   * renderer, so this is the same shape as the rest of this type: the renderer
   * answers, main renders the answer.
   */
  samples: readonly MenuSample[]
}

/** Nothing is live until the renderer says otherwise. */
export const EMPTY_MENU_CONTEXT: MenuContext = { enabled: [], labels: {}, samples: [] }
