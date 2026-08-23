import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppApi, OpenFileRequest, OpenedTextFile } from '@shared/api'
import { pickProjectFile } from '../upload'
import { stubApi } from './stubApi'

/** Every open request the stubbed bridge received. */
let opens: OpenFileRequest[] = []

/** Install a bridge whose open dialog records and resolves to `result`. */
function installBridge(result: OpenedTextFile | null) {
  const api = stubApi({
    files: {
      save: () => Promise.resolve(null),
      openText: (request: OpenFileRequest) => {
        opens.push(request)
        return Promise.resolve(result)
      },
    },
  })
  ;(window as Window & { api?: AppApi }).api = api
}

/**
 * Stand in for the file picker: the next `click()` on a file input fires
 * `event` on it, having first given it `files`.
 */
function answerPicker(event: 'change' | 'cancel', files: File[] = []) {
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement,
  ) {
    Object.defineProperty(this, 'files', { value: files, configurable: true })
    this.dispatchEvent(new Event(event))
  })
}

beforeEach(() => {
  opens = []
})

afterEach(() => {
  delete (window as Window & { api?: AppApi }).api
  vi.restoreAllMocks()
})

describe('pickProjectFile (browser build)', () => {
  it('reads the chosen file as text', async () => {
    answerPicker('change', [new File(['{"name":"Demo"}'], 'demo.json')])
    await expect(pickProjectFile()).resolves.toBe('{"name":"Demo"}')
  })

  it('resolves to null when the picker is dismissed', async () => {
    answerPicker('cancel')
    await expect(pickProjectFile()).resolves.toBeNull()
  })

  it('resolves to null when the picker fires change with no file', async () => {
    answerPicker('change')
    await expect(pickProjectFile()).resolves.toBeNull()
  })
})

describe('pickProjectFile (desktop build)', () => {
  it('opens a native dialog filtered to project files and returns its text', async () => {
    installBridge({ path: '/Users/test/demo.json', text: '{"name":"Demo"}' })
    await expect(pickProjectFile()).resolves.toBe('{"name":"Demo"}')
    expect(opens).toEqual([{ extensions: ['json'] }])
  })

  it('resolves to null when the dialog is cancelled', async () => {
    installBridge(null)
    await expect(pickProjectFile()).resolves.toBeNull()
  })
})
