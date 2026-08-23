import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CANVAS_SHORTCUTS,
  EDITOR_SHORTCUTS,
  GROUP_ORDER,
  MANAGER_SHORTCUTS,
  keyLabel,
  keyText,
  matchEditorShortcut,
  matchManagerShortcut,
  parseKey,
  shortcutLabel,
  shortcutSections,
} from '../shortcuts'

/** A keydown with the modifiers left off unless asked for. */
function press(key: string, modifiers: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ...modifiers })
}

describe('parseKey', () => {
  it('splits modifiers off the key', () => {
    expect(parseKey('Shift+Mod+Z')).toEqual({ shift: true, mod: true, alt: false, key: 'Z' })
    expect(parseKey('Alt+ArrowLeft')).toEqual({
      shift: false,
      mod: false,
      alt: true,
      key: 'ArrowLeft',
    })
  })

  it('treats a lone + as a key, not a joiner', () => {
    expect(parseKey('+')).toEqual({ shift: false, mod: false, alt: false, key: '+' })
  })
})

describe('matchEditorShortcut', () => {
  it('matches Ctrl and Cmd alike', () => {
    expect(matchEditorShortcut(press('z', { ctrlKey: true }))).toBe('undo')
    expect(matchEditorShortcut(press('z', { metaKey: true }))).toBe('undo')
  })

  it('separates undo from redo by Shift', () => {
    expect(matchEditorShortcut(press('z', { metaKey: true, shiftKey: true }))).toBe('redo')
  })

  it('separates the two rotations by Shift', () => {
    expect(matchEditorShortcut(press('r'))).toBe('rotateRight')
    expect(matchEditorShortcut(press('R', { shiftKey: true }))).toBe('rotateLeft')
  })

  it('ignores a modifier the shortcut does not carry', () => {
    // Ctrl+G is the browser's find-again, not the grid toggle
    expect(matchEditorShortcut(press('g', { ctrlKey: true }))).toBeNull()
    expect(matchEditorShortcut(press('g'))).toBe('toggleGrid')
  })

  it('reads Alt+arrows as pattern shifts and bare arrows as nothing', () => {
    expect(matchEditorShortcut(press('ArrowLeft', { altKey: true }))).toBe('shiftLeft')
    // Bare arrows belong to whichever canvas has focus (its cursor mode)
    expect(matchEditorShortcut(press('ArrowLeft'))).toBeNull()
  })

  it('takes punctuation whatever Shift is doing, since the key already reflects it', () => {
    expect(matchEditorShortcut(press('?', { shiftKey: true }))).toBe('help')
    expect(matchEditorShortcut(press('+', { shiftKey: true }))).toBe('zoomIn')
    expect(matchEditorShortcut(press('='))).toBe('zoomIn')
  })

  it('maps the digit row to the brush modes and the color slots', () => {
    expect(matchEditorShortcut(press('1'))).toBe('brushChar')
    expect(matchEditorShortcut(press('3'))).toBe('brushBoth')
    expect(matchEditorShortcut(press('4'))).toBe('slotScreen')
    expect(matchEditorShortcut(press('7'))).toBe('slotAux')
  })

  it('does not answer to the manager’s keys', () => {
    expect(matchEditorShortcut(press('n'))).toBeNull()
    expect(matchManagerShortcut(press('n'))).toBe('newProject')
    expect(matchManagerShortcut(press('g'))).toBeNull()
  })
})

describe('the map itself', () => {
  const all = [...EDITOR_SHORTCUTS, ...MANAGER_SHORTCUTS, ...CANVAS_SHORTCUTS]

  it('binds every key to exactly one action per scope', () => {
    for (const list of [EDITOR_SHORTCUTS, MANAGER_SHORTCUTS]) {
      const seen = new Set<string>()
      for (const shortcut of list) {
        for (const key of shortcut.keys) {
          expect(seen.has(key), `${key} is bound twice`).toBe(false)
          seen.add(key)
        }
      }
    }
  })

  it('puts every shortcut in a known section', () => {
    for (const shortcut of all) expect(GROUP_ORDER).toContain(shortcut.group)
  })

  it('lists every shortcut exactly once across the sections', () => {
    const listed = shortcutSections().flatMap((section) => section.shortcuts)
    expect(listed).toHaveLength(all.length)
  })
})

describe('labels', () => {
  it('spells modifiers out for this platform (jsdom is not a Mac)', () => {
    expect(keyLabel('Mod+Z')).toBe('Ctrl+Z')
    expect(keyLabel('Shift+Mod+Z')).toBe('Shift+Ctrl+Z')
    expect(keyLabel('Alt+ArrowLeft')).toBe('Alt+←')
    expect(keyLabel('Escape')).toBe('Esc')
    expect(shortcutLabel('undo')).toBe('Ctrl+Z')
  })

  it('uses the Apple glyphs on a Mac', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })
    vi.resetModules()
    const mac = await import('../shortcuts')
    expect(mac.keyLabel('Shift+Mod+Z')).toBe('⇧⌘Z')
    expect(mac.keyLabel('Alt+ArrowLeft')).toBe('⌥←')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('names both platforms in the form the README uses', () => {
    expect(keyText('Mod+Z')).toBe('Ctrl/Cmd+Z')
    expect(keyText('Shift+Mod+Z')).toBe('Shift+Ctrl/Cmd+Z')
    expect(keyText('Alt+ArrowUp')).toBe('Alt+↑')
  })
})

/**
 * The phase's promise is that the map is documented, and documentation drifts
 * unless something checks it. Each shortcut owns one README row, written in the
 * platform-neutral spelling, so a key added to the map without a line in the
 * README fails here rather than at the first user who goes looking for it.
 */
describe('README', () => {
  // Vitest's root is the project root; under jsdom `import.meta.url` is an
  // http:// URL and cannot be resolved to a path.
  const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8')

  /** Table rows as `[cell, cell]` pairs, with the alignment padding dropped. */
  const rows = readme
    .split('\n')
    .filter((line) => line.trimStart().startsWith('|'))
    .map((line) =>
      line
        .trim()
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim()),
    )

  it('carries a row for every shortcut', () => {
    for (const shortcut of [...EDITOR_SHORTCUTS, ...CANVAS_SHORTCUTS, ...MANAGER_SHORTCUTS]) {
      const keys = shortcut.keys.map((key) => `\`${keyText(key)}\``).join(' / ')
      // A key worded differently on the desktop owns a second row (D14).
      for (const description of [shortcut.description, shortcut.desktopDescription]) {
        if (!description) continue
        const documented = rows.some((row) => row[0] === keys && row[1] === description)
        expect(documented, `${shortcut.action} (${keys}) is undocumented: ${description}`).toBe(
          true,
        )
      }
    }
  })
})
