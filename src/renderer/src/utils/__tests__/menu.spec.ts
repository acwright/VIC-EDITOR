import { describe, expect, it } from 'vitest'
import { MENU_ACTIONS } from '@shared/menu'
import { editorMenuContext, managerMenuContext } from '../menu'
import { EDITOR_SHORTCUTS, MANAGER_SHORTCUTS } from '../shortcuts'

/**
 * The native menu's table lives in `src/shared/` because the main process
 * cannot import the renderer's shortcut map, so the two are held together here
 * instead — the same way `shortcuts.spec.ts` holds the README to the key list.
 */

const SECTIONS = ['file', 'edit', 'character', 'brush', 'color', 'view', 'help']

/**
 * Words Title Case leaves lowercase — but never as the first or last word of a
 * title. The macOS HIG's list, which is why "Back to Projects" is right and
 * "Back To Projects" is not.
 */
const MINOR_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'from',
  'in',
  'nor',
  'of',
  'on',
  'or',
  'so',
  'the',
  'to',
  'up',
  'yet',
  'with',
])

/** Whether `title` is Title Case: every word capitalised bar the minor ones. */
function isTitleCase(title: string): boolean {
  const words = title.split(' ')
  return words.every((word, index) => {
    // Hyphens and slashes join words that each get their own capital.
    const parts = word.split(/[-/]/).filter(Boolean)
    return parts.every((part, partIndex) => {
      const first = index === 0 && partIndex === 0
      const last = index === words.length - 1 && partIndex === parts.length - 1
      if (!first && !last && MINOR_WORDS.has(part.toLowerCase())) return part === part.toLowerCase()
      return /^[^a-z]/.test(part)
    })
  })
}

/** Every action the editor and the manager dispatch, ignoring the duplicate `help`. */
const ACTIONS = [
  ...new Set([...EDITOR_SHORTCUTS, ...MANAGER_SHORTCUTS].map((entry) => entry.action)),
]

describe('isTitleCase', () => {
  // The checker below is the only thing standing between a menu title and the
  // help sheet's voice, so it is worth knowing it rejects what it should.
  it('rejects the sentence-case titles it replaced', () => {
    expect(isTitleCase('Save now')).toBe(false)
    expect(isTitleCase('Keyboard shortcuts')).toBe(false)
    expect(isTitleCase('Zoom in')).toBe(false)
    expect(isTitleCase('Back To Projects')).toBe(false)
  })

  it('accepts the forms a native menu uses', () => {
    expect(isTitleCase('Back to Projects')).toBe(true)
    expect(isTitleCase('Zoom In')).toBe(true)
    expect(isTitleCase('Play/Pause')).toBe(true)
    expect(isTitleCase('Aspect-Corrected Preview')).toBe(true)
    expect(isTitleCase('New Project…')).toBe(true)
  })
})

describe('the menu table', () => {
  it('carries every editor and manager action exactly once', () => {
    expect([...MENU_ACTIONS].map((entry) => entry.action).sort()).toEqual([...ACTIONS].sort())
  })

  it('invents no action of its own', () => {
    for (const entry of MENU_ACTIONS) expect(ACTIONS).toContain(entry.action)
  })

  // The help sheet's descriptions are sentences ("Save now", "Fill the
  // character"); a menu title is not. Menu labels are written separately for
  // that reason, so this is what keeps them honest.
  it('titles every item the way a native menu does', () => {
    // Collected rather than asserted one by one, so a failure names every
    // label that needs rewording instead of only the first.
    const wrong = MENU_ACTIONS.map((entry) => entry.label).filter((label) => !isTitleCase(label))
    expect(wrong).toEqual([])
  })

  it('puts every item in a known section', () => {
    for (const entry of MENU_ACTIONS) expect(SECTIONS).toContain(entry.section)
  })

  it('never opens a section with a separator', () => {
    for (const section of SECTIONS) {
      const first = MENU_ACTIONS.find((entry) => entry.section === section)
      expect(first?.separatorBefore).toBeUndefined()
    }
  })
})

describe('what the menu offers', () => {
  it('greys out everything but the manager’s own items on the project list', () => {
    expect(managerMenuContext().enabled).toEqual(['newProject', 'help'])
  })

  it('lights the editor’s whole map while a project is open', () => {
    expect(editorMenuContext().enabled).toEqual(EDITOR_SHORTCUTS.map((entry) => entry.action))
  })

  it('sends a title for every item, from either view', () => {
    for (const labels of [editorMenuContext().labels, managerMenuContext().labels]) {
      for (const entry of MENU_ACTIONS) expect(labels[entry.action]).toBeTruthy()
    }
  })
})
