import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * The file mechanics behind the open document (PLAN.md D6), in the node vitest
 * project — the renderer's suite runs in jsdom and cannot reach `src/main`.
 *
 * What is covered here is what a run of the app is bad at showing: that the
 * write really is atomic, that a failed write leaves nothing behind, and that
 * the two extensions a document can arrive under both come back with the right
 * name. The dialogs and the IPC wiring are verified by driving the app.
 *
 * `documentFile.ts` imports no Electron, which is what lets this run straight
 * rather than behind a mock of it.
 */

import {
  documentFileName,
  documentName,
  isDocumentPath,
  readDocumentAt,
  resolveDocumentPath,
  stampOf,
  writeDocumentAt,
} from '../documentFile'

let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vic20-document-'))
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('documentName', () => {
  it('takes the extension off the name a document is written under', () => {
    expect(documentName('/projects/Title Screen.vic20')).toBe('Title Screen')
  })

  // The compound name has to be tried first, or this comes back as
  // "Title Screen.vic20" — the wrong half stripped (D3).
  it('takes the whole compound extension off a v1 export', () => {
    expect(documentName('/projects/Title Screen.vic20.json')).toBe('Title Screen')
  })

  it('is case-insensitive about the extension', () => {
    expect(documentName('/projects/Title Screen.VIC20')).toBe('Title Screen')
  })

  it('drops the last extension of anything else', () => {
    expect(documentName('/projects/notes.txt')).toBe('notes')
    expect(documentName('/projects/README')).toBe('README')
  })

  it('keeps the dots inside a name', () => {
    expect(documentName('/projects/v1.2 charset.vic20')).toBe('v1.2 charset')
  })
})

describe('documentFileName', () => {
  it('keeps the name the user typed, spaces and all', () => {
    expect(documentFileName('Title Screen')).toBe('Title Screen.vic20')
  })

  it('replaces only what a filesystem refuses', () => {
    expect(documentFileName('Level 1/2: "final"')).toBe('Level 1 2 final.vic20')
    expect(documentFileName('a\\b|c?d*e')).toBe('a b c d e.vic20')
  })

  it('never produces a hidden file, a trailing dot or a bare extension', () => {
    expect(documentFileName('.hidden')).toBe('hidden.vic20')
    expect(documentFileName('trailing.')).toBe('trailing.vic20')
    expect(documentFileName('   ')).toBe('Project.vic20')
    expect(documentFileName('')).toBe('Project.vic20')
  })
})

describe('writeDocumentAt', () => {
  it('writes the text and answers with the file’s stamp', () => {
    const path = join(directory, 'Alpha.vic20')
    const stamp = writeDocumentAt(path, 'hello\n')

    expect(readFileSync(path, 'utf-8')).toBe('hello\n')
    expect(stamp).toEqual(stampOf(path))
    expect(stamp.size).toBe(6)
  })

  it('leaves no temporary file beside the document', () => {
    const path = join(directory, 'Alpha.vic20')
    writeDocumentAt(path, 'hello\n')
    expect(readdirSync(directory)).toEqual(['Alpha.vic20'])
  })

  it('replaces the previous contents rather than appending to them', () => {
    const path = join(directory, 'Alpha.vic20')
    writeDocumentAt(path, 'first\n')
    writeDocumentAt(path, 'second\n')
    expect(readFileSync(path, 'utf-8')).toBe('second\n')
  })

  it('moves the stamp when the same-length text is written again', () => {
    // D5 elides a write that would change nothing, and D6's guard compares
    // stamps — both of which need mtime to be finer-grained than the writes.
    const path = join(directory, 'Alpha.vic20')
    const first = writeDocumentAt(path, 'aaaa\n')
    const second = writeDocumentAt(path, 'bbbb\n')
    expect(second.size).toBe(first.size)
    expect(second.mtimeMs).not.toBe(first.mtimeMs)
  })

  it('leaves the existing document intact when the write fails', () => {
    // A directory where the temporary file wants to be: `writeFileSync` throws
    // EISDIR, and the rename never happens. This is the property the whole
    // temp-then-rename dance exists for.
    const path = join(directory, 'Alpha.vic20')
    writeDocumentAt(path, 'an evening of work\n')
    mkdirSync(`${path}.tmp`)

    expect(() => writeDocumentAt(path, 'clobbered')).toThrow(/EISDIR|illegal operation/)
    expect(readFileSync(path, 'utf-8')).toBe('an evening of work\n')
  })

  it('cleans up the temporary file when the rename fails', () => {
    // The temporary is written, then `rename` refuses because the target is a
    // directory. Nothing may be left lying next to the user's projects.
    const path = join(directory, 'Alpha.vic20')
    mkdirSync(path)

    expect(() => writeDocumentAt(path, 'text')).toThrow(/EISDIR|ENOTEMPTY|illegal operation/)
    expect(readdirSync(directory)).toEqual(['Alpha.vic20'])
  })
})

describe('readDocumentAt', () => {
  it('answers with the text, the name and a stamp', () => {
    const path = join(directory, 'Title Screen.vic20')
    writeFileSync(path, '{}\n', 'utf-8')

    expect(readDocumentAt(path)).toEqual({
      path,
      name: 'Title Screen',
      text: '{}\n',
      stamp: stampOf(path),
    })
  })

  it('reads a v1 export under its compound name', () => {
    const path = join(directory, 'Title Screen.vic20.json')
    writeFileSync(path, '{}\n', 'utf-8')
    expect(readDocumentAt(path).name).toBe('Title Screen')
  })

  it('throws rather than answering with an empty document', () => {
    expect(() => readDocumentAt(join(directory, 'missing.vic20'))).toThrow(/ENOENT/)
  })

  it('round-trips what writeDocumentAt wrote', () => {
    const path = join(directory, 'Alpha.vic20')
    const text = '{\n  "id": "abc"\n}\n'
    writeDocumentAt(path, text)
    expect(readDocumentAt(path).text).toBe(text)
  })
})

describe('isDocumentPath', () => {
  it('recognises the name documents are written under, and the v1 one (D3)', () => {
    expect(isDocumentPath('/projects/Title Screen.vic20')).toBe(true)
    expect(isDocumentPath('/projects/Title Screen.vic20.json')).toBe(true)
    expect(isDocumentPath('/projects/TITLE SCREEN.VIC20')).toBe(true)
  })

  // What this keeps out of `documentFromArgv`: Electron's own switches, the
  // `.` electron-vite passes in development, and a flag's value.
  it('refuses anything else', () => {
    expect(isDocumentPath('.')).toBe(false)
    expect(isDocumentPath('/projects/notes.json')).toBe(false)
    expect(isDocumentPath('--remote-debugging-port=9222')).toBe(false)
  })
})

describe('resolveDocumentPath', () => {
  it('answers with an absolute path for a file that is there', () => {
    const path = join(directory, 'Alpha.vic20')
    writeFileSync(path, '{}\n', 'utf-8')
    // The directory itself may be a symlink (/tmp is one on macOS), which is
    // exactly what this resolves — so it is compared against the same answer
    // rather than against the path that went in (S1).
    expect(resolveDocumentPath(path)).toBe(realpathSync(path))
  })

  it('answers null for a path that is not there', () => {
    expect(resolveDocumentPath(join(directory, 'missing.vic20'))).toBeNull()
  })
})
