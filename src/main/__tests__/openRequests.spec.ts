import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../../shared/ipc'

/**
 * The one arrival path (PLAN.md D15), in the node vitest project.
 *
 * What is worth checking here is the part a run of the app is worst at showing:
 * that a document arriving *before* the window exists is not lost (S2), and
 * that the argument scan cannot be talked into opening something that is not a
 * document. The double-click itself is verified by driving the built app.
 */

vi.mock('electron', () => ({
  app: { on: () => {} },
  BrowserWindow: {},
}))

const {
  documentFromArgv,
  hasPendingDocument,
  rendererDidLoad,
  rendererDidUnload,
  requestOpen,
  takePendingDocument,
} = await import('../openRequests')

let directory: string
let document: string

/** A window far enough along to be notified. */
function fakeWindow() {
  const send = vi.fn<(channel: string) => void>()
  return {
    window: {
      isDestroyed: () => false,
      isMinimized: () => false,
      show: vi.fn<() => void>(),
      focus: vi.fn<() => void>(),
      webContents: { send },
    },
    send,
  }
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vic20-open-'))
  document = join(directory, 'Title Screen.vic20')
  writeFileSync(document, '{}\n', 'utf-8')
})

afterEach(() => {
  rendererDidUnload()
  takePendingDocument()
  rmSync(directory, { recursive: true, force: true })
})

describe('requestOpen', () => {
  it('holds a document that arrives before the window does (S2)', () => {
    // The cold-start double-click: `open-file` beats `whenReady`, so there is
    // nothing to announce to yet and the path has to wait.
    requestOpen(document)
    expect(hasPendingDocument()).toBe(true)
    // Resolved, so that it matches however it arrives the next time (S1).
    expect(takePendingDocument()).toContain('Title Screen.vic20')
    expect(hasPendingDocument()).toBe(false)
  })

  it('announces a document that arrives once the renderer is up', () => {
    const { window, send } = fakeWindow()
    rendererDidLoad(window as unknown as Parameters<typeof rendererDidLoad>[0])

    requestOpen(document)
    expect(send).toHaveBeenCalledWith(IPC.DOCUMENT_PENDING)
    // Raised, because a double-click on a document is a request to see it.
    expect(window.focus).toHaveBeenCalled()
  })

  it('announces what was already waiting when the renderer arrives', () => {
    // A reload with a document still pending, and the launch order itself.
    requestOpen(document)
    const { window, send } = fakeWindow()
    rendererDidLoad(window as unknown as Parameters<typeof rendererDidLoad>[0])
    expect(send).toHaveBeenCalledWith(IPC.DOCUMENT_PENDING)
  })

  it('drops a path that is not there rather than queueing a failure', () => {
    requestOpen(join(directory, 'gone.vic20'))
    expect(hasPendingDocument()).toBe(false)
  })
})

describe('documentFromArgv', () => {
  const platform = process.platform

  function pretend(value: string): void {
    Object.defineProperty(process, 'platform', { value, configurable: true })
  }

  afterEach(() => pretend(platform))

  it('finds the document a double-click passed on Windows and Linux', () => {
    pretend('linux')
    expect(documentFromArgv(['/opt/app/vic20-editor', document])).toBe(document)
  })

  it('never reads argv on macOS, where the document comes through open-file (S2)', () => {
    pretend('darwin')
    expect(documentFromArgv(['/Applications/VIC-20 Editor.app', document])).toBeNull()
  })

  it('ignores switches, the dev run’s dot, and files that are not documents', () => {
    pretend('linux')
    const other = join(directory, 'notes.json')
    writeFileSync(other, '{}\n', 'utf-8')
    expect(documentFromArgv(['electron', '.', '--remote-debugging-port=9222', other])).toBeNull()
  })

  it('ignores a document-shaped argument that is not a file', () => {
    pretend('linux')
    expect(documentFromArgv(['electron', join(directory, 'gone.vic20')])).toBeNull()
    expect(documentFromArgv(['electron', directory])).toBeNull()
  })

  it('skips argv[0], which is the executable and never a document', () => {
    pretend('linux')
    expect(documentFromArgv([document])).toBeNull()
  })
})
