import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Recent Documents (PLAN.md D16), in the node vitest project.
 *
 * Recents are the desktop's primary navigation now that there is no project
 * list, so the things worth holding still are the ones that would quietly rot:
 * that the list stays unique and bounded, that a file which is gone leaves it,
 * and that what the renderer is handed carries no path (D8).
 */

let userData: string
let home: string

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'home' ? home : userData),
    addRecentDocument: vi.fn<() => void>(),
    clearRecentDocuments: vi.fn<() => void>(),
  },
}))

const {
  clearRecentDocuments,
  displayDirectory,
  noteRecentDocument,
  onRecentDocumentsChanged,
  recentDocumentPath,
  recentDocumentPaths,
  recentDocuments,
} = await import('../recent')

let directory: string

/** A document on disk, since a path that is not there is pruned on sight. */
function document(name: string): string {
  const path = join(directory, `${name}.vic20`)
  writeFileSync(path, '{}\n', 'utf-8')
  return path
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vic20-recent-'))
  userData = join(directory, 'userData')
  home = join(directory, 'home')
  onRecentDocumentsChanged(() => {})
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('recent documents', () => {
  it('puts the newest first', () => {
    noteRecentDocument(document('Alpha'))
    noteRecentDocument(document('Beta'))
    expect(recentDocumentPaths().map((path) => path.endsWith('Beta.vic20'))).toEqual([true, false])
  })

  it('moves a document already in the list rather than listing it twice', () => {
    const alpha = document('Alpha')
    noteRecentDocument(alpha)
    noteRecentDocument(document('Beta'))
    noteRecentDocument(alpha)

    expect(recentDocumentPaths()).toEqual([alpha, join(directory, 'Beta.vic20')])
  })

  it('keeps 16, which is what D16 asks for', () => {
    for (let index = 0; index < 20; index++) noteRecentDocument(document(`Project ${index}`))
    expect(recentDocumentPaths()).toHaveLength(16)
    expect(recentDocumentPaths()[0]).toBe(join(directory, 'Project 19.vic20'))
  })

  it('drops a document that is no longer there', () => {
    const alpha = document('Alpha')
    noteRecentDocument(alpha)
    noteRecentDocument(document('Beta'))
    unlinkSync(alpha)

    expect(recentDocumentPaths()).toEqual([join(directory, 'Beta.vic20')])
    // And the pruning is written back, not recomputed every time.
    unlinkSync(join(directory, 'Beta.vic20'))
    expect(recentDocumentPaths()).toEqual([])
  })

  it('starts empty, and survives a file that is not a list', () => {
    expect(recentDocumentPaths()).toEqual([])
    noteRecentDocument(document('Alpha'))
    writeFileSync(join(userData, 'recent-documents.json'), 'not json at all', 'utf-8')
    expect(recentDocumentPaths()).toEqual([])
  })

  it('clears on request', () => {
    noteRecentDocument(document('Alpha'))
    clearRecentDocuments()
    expect(recentDocumentPaths()).toEqual([])
  })

  it('tells the menu when the list moves', () => {
    const changed = vi.fn<() => void>()
    onRecentDocumentsChanged(changed)
    noteRecentDocument(document('Alpha'))
    clearRecentDocuments()
    expect(changed).toHaveBeenCalledTimes(2)
  })
})

describe('what the renderer is given', () => {
  it('is a name, a folder and an opaque id — never a path (D8)', () => {
    const alpha = document('Alpha')
    noteRecentDocument(alpha)

    const [entry] = recentDocuments()
    expect(entry).toMatchObject({ name: 'Alpha', directory })
    expect(entry!.id).not.toContain('/')
    expect(recentDocumentPath(entry!.id)).toBe(alpha)
  })

  it('answers null for an id that has left the list', () => {
    const alpha = document('Alpha')
    noteRecentDocument(alpha)
    const [entry] = recentDocuments()
    clearRecentDocuments()

    expect(recentDocumentPath(entry!.id)).toBeNull()
  })

  it('gives an id that is stable across a rebuild of the list', () => {
    const alpha = document('Alpha')
    noteRecentDocument(alpha)
    const first = recentDocuments()[0]!.id
    noteRecentDocument(document('Beta'))

    expect(recentDocuments().find((entry) => entry.name === 'Alpha')!.id).toBe(first)
  })
})

describe('displayDirectory', () => {
  it('writes the home directory the way every other tool does', () => {
    expect(displayDirectory(home)).toBe('~')
    expect(displayDirectory(join(home, 'dev', 'game'))).toBe(join('~', 'dev', 'game'))
  })

  it('leaves a folder outside home as it is', () => {
    expect(displayDirectory('/Volumes/Work/charsets')).toBe('/Volumes/Work/charsets')
    // And does not collapse a folder that merely starts with the same letters.
    expect(displayDirectory(`${home}-old`)).toBe(`${home}-old`)
  })
})
