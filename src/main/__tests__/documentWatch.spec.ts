import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * The directory watcher (PLAN.md D7, S3), in the node vitest project against a
 * real disk.
 *
 * The one thing worth proving here is the finding that shaped the file, because
 * it is invisible in a reading of the code and fatal in use: **a watch on the
 * document itself is single-shot**. git replaces a file across a branch switch
 * rather than rewriting it, so a file watcher reports the checkout that kills
 * it and then goes quiet forever. The replacement case below is that shape,
 * twice in a row — the second one is the assertion that matters.
 *
 * The rest is the quiet: a watch that fires for every neighbor in a source
 * directory would wake the app on every build.
 */

import { stopWatchingDocument, watchDocument, watchedDocument } from '../documentWatch'

let directory: string
let document: string
let changes: number

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Wait for the watcher to report, or give up. Answers whether it did. */
async function reported(before: number, timeout = 3000): Promise<boolean> {
  const deadline = Date.now() + timeout
  while (changes === before && Date.now() < deadline) await wait(20)
  return changes > before
}

/** Wait long enough that a watcher which was going to fire would have. */
const settled = (): Promise<void> => wait(300)

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vic20-watch-'))
  document = join(directory, 'Title Screen.vic20')
  writeFileSync(document, 'one', 'utf-8')
  changes = 0
})

afterEach(() => {
  stopWatchingDocument()
  rmSync(directory, { recursive: true, force: true })
})

const count = (): void => {
  changes += 1
}

/**
 * Arm the watch, and let what it was handed at the door go by.
 *
 * macOS replays: a watch armed on a directory is given the events that happened
 * in it just before, so the write that set the fixture up arrives as one. In
 * the app that costs a `stat` and nothing else — an event is only ever a reason
 * to go and look (S3) — but a spec that did not wait for it would be asserting
 * on the fixture rather than on the change it made.
 */
async function arm(path: string): Promise<void> {
  watchDocument(path, count)
  await settled()
  changes = 0
}

describe('watchDocument', () => {
  it('reports a write to the document', async () => {
    await arm(document)
    writeFileSync(document, 'two', 'utf-8')
    expect(await reported(0)).toBe(true)
  })

  // S3: git replaces the file rather than rewriting it, so the inode a *file*
  // watcher holds is gone after the first switch. This is the whole reason the
  // watch is on the directory, and the second half is the assertion.
  it('survives the document being replaced, and keeps reporting', async () => {
    await arm(document)

    rmSync(document)
    writeFileSync(document, 'branch A', 'utf-8')
    expect(await reported(0)).toBe(true)

    const seen = changes
    rmSync(document)
    writeFileSync(document, 'branch B', 'utf-8')
    expect(await reported(seen)).toBe(true)
  })

  it('reports the document being deleted', async () => {
    await arm(document)
    rmSync(document)
    expect(await reported(0)).toBe(true)
  })

  // A document lives beside source files, and a build touching them must not
  // wake the app up. The watch is non-recursive and filtered by basename (S3).
  it('says nothing about the neighbors', async () => {
    await arm(document)
    writeFileSync(join(directory, 'main.asm'), 'nop', 'utf-8')
    writeFileSync(join(directory, 'Title Screen.vic20.tmp'), 'half a write', 'utf-8')
    await settled()
    expect(changes).toBe(0)
  })

  it('coalesces a burst into one report', async () => {
    await arm(document)
    for (const text of ['a', 'b', 'c', 'd']) writeFileSync(document, text, 'utf-8')
    expect(await reported(0)).toBe(true)
    await settled()
    expect(changes).toBe(1)
  })

  it('stops when it is told to, and forgets what was settling', async () => {
    await arm(document)
    writeFileSync(document, 'two', 'utf-8')
    stopWatchingDocument()
    await settled()
    expect(changes).toBe(0)
    expect(watchedDocument()).toBeNull()
  })

  it('follows the document to another directory', async () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'vic20-watch-'))
    const moved = join(elsewhere, 'Beta.vic20')
    writeFileSync(moved, 'one', 'utf-8')
    try {
      await arm(document)
      await arm(moved)
      expect(watchedDocument()).toBe(moved)

      // The old directory is no longer anyone's business.
      writeFileSync(document, 'two', 'utf-8')
      await settled()
      expect(changes).toBe(0)

      writeFileSync(moved, 'two', 'utf-8')
      expect(await reported(0)).toBe(true)
    } finally {
      rmSync(elsewhere, { recursive: true, force: true })
    }
  })

  // Focus + stat is the mechanism; the watcher is the prompt one (S3). A
  // directory that cannot be watched costs the app nothing but promptness.
  it('is quiet about a directory it cannot watch', () => {
    expect(() => watchDocument(join(directory, 'gone', 'Beta.vic20'), count)).not.toThrow()
    expect(watchedDocument()).toBeNull()
  })

  it('watches nothing when there is no document', () => {
    watchDocument(document, count)
    watchDocument(null, count)
    expect(watchedDocument()).toBeNull()
  })
})
