/**
 * The keyboard map, in one place (PLAN.md Phase 11).
 *
 * Three surfaces used to be able to disagree about a key: the handler that
 * acts on it, the tooltip that advertises it, and the README that documents
 * it. Here the keys are declared once, the views dispatch on the *action*
 * rather than on the key, and their handler tables are `Record<Action, …>` —
 * so adding a shortcut without wiring it up is a type error rather than a
 * quietly dead key. `shortcuts.spec.ts` holds the README to the same list.
 *
 * Key tokens are `event.key` values with optional `Shift+`, `Mod+` and `Alt+`
 * prefixes, in that order. `Mod` is Ctrl on Windows/Linux and Cmd on Apple
 * platforms — the same key under both names, as every other editor spells it.
 */

import { isMac } from './platform'

/** Everything the editor view acts on. */
export type EditorAction =
  | 'undo'
  | 'redo'
  | 'save'
  | 'help'
  | 'back'
  | 'prevChar'
  | 'nextChar'
  | 'fill'
  | 'clear'
  | 'invert'
  | 'flipH'
  | 'flipV'
  | 'rotateRight'
  | 'rotateLeft'
  | 'shiftLeft'
  | 'shiftRight'
  | 'shiftUp'
  | 'shiftDown'
  | 'slotScreen'
  | 'slotBorder'
  | 'slotChar'
  | 'slotAux'
  | 'brushChar'
  | 'brushColor'
  | 'brushBoth'
  | 'prevScreen'
  | 'nextScreen'
  | 'zoomIn'
  | 'zoomOut'
  | 'toggleGrid'
  | 'toggleAspect'

/** Everything the project manager acts on. */
export type ManagerAction = 'newProject' | 'help'

export interface Shortcut<A extends string = string> {
  action: A
  /** Key tokens; any one of them fires the action. */
  keys: readonly string[]
  /** Imperative description, as shown in the help dialog and the README. */
  description: string
  /** Section heading, in `GROUP_ORDER`. */
  group: string
}

export const EDITOR_SHORTCUTS: readonly Shortcut<EditorAction>[] = [
  { action: 'undo', keys: ['Mod+Z'], description: 'Undo', group: 'Project' },
  { action: 'redo', keys: ['Shift+Mod+Z'], description: 'Redo', group: 'Project' },
  { action: 'save', keys: ['Mod+S'], description: 'Save now', group: 'Project' },
  { action: 'help', keys: ['?'], description: 'Keyboard shortcuts', group: 'Project' },
  { action: 'back', keys: ['Escape'], description: 'Back to the project list', group: 'Project' },

  { action: 'prevChar', keys: ['['], description: 'Previous character', group: 'Character' },
  { action: 'nextChar', keys: [']'], description: 'Next character', group: 'Character' },
  { action: 'fill', keys: ['F'], description: 'Fill the character', group: 'Character' },
  { action: 'clear', keys: ['C'], description: 'Clear the character', group: 'Character' },
  { action: 'invert', keys: ['I'], description: 'Invert the character', group: 'Character' },
  { action: 'flipH', keys: ['H'], description: 'Flip horizontal', group: 'Character' },
  { action: 'flipV', keys: ['V'], description: 'Flip vertical', group: 'Character' },
  { action: 'rotateRight', keys: ['R'], description: 'Rotate right', group: 'Character' },
  { action: 'rotateLeft', keys: ['Shift+R'], description: 'Rotate left', group: 'Character' },
  {
    action: 'shiftLeft',
    keys: ['Alt+ArrowLeft'],
    description: 'Shift the pattern left',
    group: 'Character',
  },
  {
    action: 'shiftRight',
    keys: ['Alt+ArrowRight'],
    description: 'Shift the pattern right',
    group: 'Character',
  },
  {
    action: 'shiftUp',
    keys: ['Alt+ArrowUp'],
    description: 'Shift the pattern up',
    group: 'Character',
  },
  {
    action: 'shiftDown',
    keys: ['Alt+ArrowDown'],
    description: 'Shift the pattern down',
    group: 'Character',
  },

  // The four color slots keep the digit row going where the brush modes stop,
  // so the whole tool bar of the editor is reachable without a modifier.
  { action: 'slotScreen', keys: ['4'], description: 'Target the screen color', group: 'Color' },
  { action: 'slotBorder', keys: ['5'], description: 'Target the border color', group: 'Color' },
  { action: 'slotChar', keys: ['6'], description: 'Target the character color', group: 'Color' },
  { action: 'slotAux', keys: ['7'], description: 'Target the auxiliary color', group: 'Color' },

  { action: 'brushChar', keys: ['1'], description: 'Brush: character', group: 'Screen' },
  { action: 'brushColor', keys: ['2'], description: 'Brush: color', group: 'Screen' },
  { action: 'brushBoth', keys: ['3'], description: 'Brush: both', group: 'Screen' },
  { action: 'prevScreen', keys: [','], description: 'Previous screen', group: 'Screen' },
  { action: 'nextScreen', keys: ['.'], description: 'Next screen', group: 'Screen' },
  { action: 'zoomIn', keys: ['+', '='], description: 'Zoom in', group: 'Screen' },
  { action: 'zoomOut', keys: ['-'], description: 'Zoom out', group: 'Screen' },
  { action: 'toggleGrid', keys: ['G'], description: 'Grid overlay', group: 'Screen' },
  { action: 'toggleAspect', keys: ['A'], description: 'Aspect-corrected preview', group: 'Screen' },
]

export const MANAGER_SHORTCUTS: readonly Shortcut<ManagerAction>[] = [
  { action: 'newProject', keys: ['N'], description: 'New project', group: 'Project list' },
  { action: 'help', keys: ['?'], description: 'Keyboard shortcuts', group: 'Project list' },
]

/**
 * The cursor mode the canvases answer to. These are handled by the focused
 * canvas rather than by a window listener — arrows have to mean "move this
 * cursor" only while a canvas holds focus — so they are documentation here,
 * not a dispatch table.
 */
export const CANVAS_SHORTCUTS: readonly Shortcut[] = [
  {
    action: 'canvasFocus',
    keys: ['Tab'],
    description: 'Focus the pixel grid, the character set, or the screen',
    group: 'Canvas cursor',
  },
  {
    action: 'canvasMove',
    keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'],
    description: 'Move the cursor',
    group: 'Canvas cursor',
  },
  {
    action: 'canvasRow',
    keys: ['Home', 'End'],
    description: 'First or last cell of the row',
    group: 'Canvas cursor',
  },
  {
    action: 'canvasPaint',
    keys: ['Enter', 'Space'],
    description: 'Paint the cursor cell',
    group: 'Canvas cursor',
  },
  {
    action: 'canvasErase',
    keys: ['Backspace', 'Delete'],
    description: 'Erase the cursor cell',
    group: 'Canvas cursor',
  },
  {
    action: 'canvasExit',
    keys: ['Escape'],
    description: 'Hide the cursor',
    group: 'Canvas cursor',
  },
]

/** Section order for the help dialog and the README table. */
export const GROUP_ORDER: readonly string[] = [
  'Project',
  'Character',
  'Color',
  'Screen',
  'Canvas cursor',
  'Project list',
]

export interface ShortcutSection {
  title: string
  shortcuts: readonly Shortcut[]
}

/** Every documented shortcut, grouped and ordered for display. */
export function shortcutSections(): ShortcutSection[] {
  const all: readonly Shortcut[] = [...EDITOR_SHORTCUTS, ...CANVAS_SHORTCUTS, ...MANAGER_SHORTCUTS]
  return GROUP_ORDER.map((title) => ({
    title,
    shortcuts: all.filter((entry) => entry.group === title),
  })).filter((section) => section.shortcuts.length > 0)
}

// --- Matching ---

const MODIFIERS = /^(Shift|Mod|Alt)\+/

interface ParsedKey {
  shift: boolean
  mod: boolean
  alt: boolean
  key: string
}

/** Split a token into its modifiers and its key. `'+'` is a key, not a joiner. */
export function parseKey(token: string): ParsedKey {
  const parsed: ParsedKey = { shift: false, mod: false, alt: false, key: token }
  for (;;) {
    const match = MODIFIERS.exec(parsed.key)
    if (!match) return parsed
    if (match[1] === 'Shift') parsed.shift = true
    else if (match[1] === 'Mod') parsed.mod = true
    else parsed.alt = true
    parsed.key = parsed.key.slice(match[0].length)
  }
}

/** True when `key` is a letter — the only keys whose Shift state we enforce. */
function isLetter(key: string): boolean {
  return key.length === 1 && /[a-z]/i.test(key)
}

function matchesEvent(token: string, event: KeyboardEvent): boolean {
  const { shift, mod, alt, key } = parseKey(token)
  if (mod !== (event.metaKey || event.ctrlKey)) return false
  if (alt !== event.altKey) return false
  const eventKey = event.key === ' ' ? 'Space' : event.key
  if (key.length === 1 && eventKey.length === 1) {
    if (key.toLowerCase() !== eventKey.toLowerCase()) return false
  } else if (key !== eventKey) {
    return false
  }
  // `?` and `+` need Shift on most layouts and already say so in `event.key`;
  // only a letter (or a named key) can distinguish `R` from `Shift+R`.
  if (isLetter(key) || key.length > 1) return shift === event.shiftKey
  return true
}

function match<A extends string>(list: readonly Shortcut<A>[], event: KeyboardEvent): A | null {
  return list.find((entry) => entry.keys.some((key) => matchesEvent(key, event)))?.action ?? null
}

/**
 * Every editor action, in map order.
 *
 * The native menu asks rather than listing the actions itself, so that adding
 * a shortcut lights up its menu item without a second edit.
 */
export function editorActions(): EditorAction[] {
  return EDITOR_SHORTCUTS.map((entry) => entry.action)
}

/** The editor action this key press means, or null when it means nothing. */
export function matchEditorShortcut(event: KeyboardEvent): EditorAction | null {
  return match(EDITOR_SHORTCUTS, event)
}

/** The project-manager action this key press means, or null. */
export function matchManagerShortcut(event: KeyboardEvent): ManagerAction | null {
  return match(MANAGER_SHORTCUTS, event)
}

// --- Labels ---

/** Keys with a conventional printed name rather than their `event.key`. */
const KEY_GLYPHS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  ' ': 'Space',
}

function keyName(key: string): string {
  return KEY_GLYPHS[key] ?? (key.length === 1 ? key.toUpperCase() : key)
}

/**
 * A key token as this platform prints it: `⇧⌘Z` on Apple, `Shift+Ctrl+Z`
 * elsewhere.
 */
export function keyLabel(token: string): string {
  const { shift, mod, alt, key } = parseKey(token)
  if (isMac) {
    return `${shift ? '⇧' : ''}${mod ? '⌘' : ''}${alt ? '⌥' : ''}${keyName(key)}`
  }
  const parts: string[] = []
  if (shift) parts.push('Shift')
  if (mod) parts.push('Ctrl')
  if (alt) parts.push('Alt')
  parts.push(keyName(key))
  return parts.join('+')
}

/**
 * A key token spelled for prose that both platforms read — the form the README
 * uses, where there is no "this machine" to be specific about.
 */
export function keyText(token: string): string {
  const { shift, mod, alt, key } = parseKey(token)
  const parts: string[] = []
  if (shift) parts.push('Shift')
  if (mod) parts.push('Ctrl/Cmd')
  if (alt) parts.push('Alt')
  parts.push(keyName(key))
  return parts.join('+')
}

const BY_ACTION = new Map<string, Shortcut>(
  [...EDITOR_SHORTCUTS, ...MANAGER_SHORTCUTS, ...CANVAS_SHORTCUTS].map((entry) => [
    entry.action,
    entry,
  ]),
)

/**
 * The key a tooltip advertises for an action — the first of its keys, in this
 * platform's spelling. Buttons take their shortcut from here so the tooltip
 * cannot drift from the handler.
 */
export function shortcutLabel(action: EditorAction | ManagerAction): string {
  const entry = BY_ACTION.get(action)
  return entry?.keys[0] ? keyLabel(entry.keys[0]) : ''
}

/** Every key of a shortcut, in this platform's spelling, for the help dialog. */
export function keyLabels(shortcut: Shortcut): string[] {
  return shortcut.keys.map(keyLabel)
}
