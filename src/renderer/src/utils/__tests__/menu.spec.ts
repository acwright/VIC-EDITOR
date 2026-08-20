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

/** Every action the editor and the manager dispatch, ignoring the duplicate `help`. */
const ACTIONS = [
  ...new Set([...EDITOR_SHORTCUTS, ...MANAGER_SHORTCUTS].map((entry) => entry.action)),
]

describe('the menu table', () => {
  it('carries every editor and manager action exactly once', () => {
    expect([...MENU_ACTIONS].map((entry) => entry.action).sort()).toEqual([...ACTIONS].sort())
  })

  it('invents no action of its own', () => {
    for (const entry of MENU_ACTIONS) expect(ACTIONS).toContain(entry.action)
  })

  it('labels each item with the shortcut’s own description', () => {
    const descriptions = new Map<string, string>(
      [...EDITOR_SHORTCUTS, ...MANAGER_SHORTCUTS].map((entry) => [entry.action, entry.description]),
    )
    for (const entry of MENU_ACTIONS) {
      expect(entry.label).toBe(descriptions.get(entry.action))
    }
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

  it('takes its wording from the shortcut map, not a copy of it', () => {
    const labels = editorMenuContext().labels
    for (const entry of EDITOR_SHORTCUTS) {
      expect(labels[entry.action]).toBe(entry.description)
    }
  })
})
