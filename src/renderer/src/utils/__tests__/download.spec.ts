import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppApi, SaveFileRequest } from '@shared/api'
import { downloadBytes, downloadCanvasPng, downloadText } from '../download'
import { stubApi } from './stubApi'

/** Every anchor download the module triggered, in order. */
let clicks: { href: string; download: string }[] = []
/** Every save request the stubbed bridge received. */
let saves: SaveFileRequest[] = []

/** Install a bridge whose save dialog records and resolves to a path. */
function installBridge(result: string | null = '/Users/test/Downloads/out.bin') {
  const api = stubApi({
    files: {
      save: (request: SaveFileRequest) => {
        saves.push(request)
        return Promise.resolve(result)
      },
      openText: () => Promise.resolve(null),
    },
  })
  ;(window as Window & { api?: AppApi }).api = api
  return api
}

/** A canvas stand-in — jsdom has no real one — that yields `blob` to `toBlob`. */
function stubCanvas(blob: Blob | null): HTMLCanvasElement {
  return {
    toBlob: (callback: BlobCallback) => callback(blob),
  } as unknown as HTMLCanvasElement
}

const decoder = new TextDecoder()

beforeEach(() => {
  clicks = []
  saves = []
  URL.createObjectURL = vi.fn<() => string>(() => 'blob:stub')
  URL.revokeObjectURL = vi.fn<() => void>()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push({ href: this.href, download: this.download })
  })
})

afterEach(() => {
  delete (window as Window & { api?: AppApi }).api
  vi.restoreAllMocks()
})

describe('download (browser build)', () => {
  it('downloads text through an anchor', () => {
    downloadText('notes.asm', 'lda #0', 'text/x-asm')
    expect(clicks).toEqual([{ href: 'blob:stub', download: 'notes.asm' }])
    expect(saves).toEqual([])
  })

  it('downloads bytes through an anchor', () => {
    downloadBytes('tiles.bin', new Uint8Array([1, 2, 3]))
    expect(clicks).toEqual([{ href: 'blob:stub', download: 'tiles.bin' }])
  })

  it('downloads a canvas as a PNG through an anchor', () => {
    downloadCanvasPng('sheet.png', stubCanvas(new Blob([new Uint8Array([137, 80])])))
    expect(clicks).toEqual([{ href: 'blob:stub', download: 'sheet.png' }])
  })

  it('does nothing when the canvas yields no blob', () => {
    downloadCanvasPng('sheet.png', stubCanvas(null))
    expect(clicks).toEqual([])
  })
})

describe('download (desktop build)', () => {
  it('sends text to the save dialog as UTF-8 bytes, with no anchor', () => {
    installBridge()
    downloadText('notes.asm', 'lda #0', 'text/x-asm')
    expect(clicks).toEqual([])
    expect(saves).toHaveLength(1)
    expect(saves[0]!.filename).toBe('notes.asm')
    expect(decoder.decode(saves[0]!.data)).toBe('lda #0')
  })

  it('sends bytes to the save dialog untouched', () => {
    installBridge()
    const bytes = new Uint8Array([1, 2, 3])
    downloadBytes('tiles.bin', bytes)
    expect(clicks).toEqual([])
    expect(saves[0]!.data).toEqual(bytes)
  })

  it('reads the PNG blob back out and sends its bytes', async () => {
    installBridge()
    downloadCanvasPng('sheet.png', stubCanvas(new Blob([new Uint8Array([137, 80, 78, 71])])))
    await vi.waitFor(() => expect(saves).toHaveLength(1))
    expect(clicks).toEqual([])
    expect(saves[0]!.filename).toBe('sheet.png')
    expect([...saves[0]!.data]).toEqual([137, 80, 78, 71])
  })

  it('treats a cancelled dialog as a no-op rather than falling back', async () => {
    installBridge(null)
    downloadText('notes.asm', 'lda #0')
    await vi.waitFor(() => expect(saves).toHaveLength(1))
    expect(clicks).toEqual([])
  })
})
