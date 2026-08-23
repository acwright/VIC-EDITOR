import { afterEach, describe, expect, it, vi } from 'vitest'
import { MENU_ACTIONS } from '@shared/menu'
import { SHELL_WORDS, words, type ShellWord } from '../strings'
import { stubApi } from './stubApi'

/**
 * The wording fork (PLAN.md F7).
 *
 * Two shells, one component tree: the views ask for a phrase and render what
 * comes back, so this is where the two answers are stated and where the ones
 * that also appear in the native menu are held to it.
 */

/** The only thing that makes `isDesktop()` — and so `shell()` — answer 'desktop'. */
function asDesktop(): void {
  vi.stubGlobal('api', stubApi())
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const KEYS = Object.keys(SHELL_WORDS) as ShellWord[]

describe('shell wording', () => {
  it('says upload and download in a browser tab', () => {
    expect(words('openProject')).toBe('Upload Project')
    expect(words('saveCopy')).toBe('Download')
  })

  it('says open and save a copy in the desktop app', () => {
    asDesktop()
    expect(words('openProject')).toBe('Open…')
    expect(words('saveCopy')).toBe('Save a Copy…')
  })

  it('never leaves a phrase the same in both shells', () => {
    // A phrase that does not fork does not belong here — it belongs wherever
    // it is used, like every other string in the app.
    for (const key of KEYS) expect(SHELL_WORDS[key].browser).not.toBe(SHELL_WORDS[key].desktop)
  })

  it('gives a button the same words as its File menu item', () => {
    // *Save a Copy…* is a menu command as well as a button (F7), and a menu
    // that said one thing while the button beside it said another would be the
    // drift this module exists to prevent.
    const item = MENU_ACTIONS.find((entry) => entry.action === 'saveCopy')
    asDesktop()
    expect(item?.label).toBe(words('saveCopy'))
  })
})
