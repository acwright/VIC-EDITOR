import { describe, expect, it } from 'vitest'
import { createProject } from '../factory'
import { ProjectValidationError } from '../serialization'
import {
  SHARE_LENGTH_WARNING,
  ShareLinkError,
  decodeShare,
  encodeShare,
  readShareHash,
  shareUrl,
} from '../share'
import { PROJECT_TYPES } from '../modes'

describe('share links', () => {
  it.each(PROJECT_TYPES)('round-trips a %s project', async (type) => {
    const project = createProject({ seed: 'blank', name: `Share ${type}`, type })
    project.charset[0] = [0x3c, 0x42, 0x81, 0xa5, 0x81, 0x99, 0x42, 0x3c]
    project.screens[0]!.cells[10] = 65
    project.screens[0]!.colors[10] = 2
    const decoded = await decodeShare(await encodeShare(project))
    expect(decoded).toEqual(project)
  })

  it('compresses gzip-scheme payloads well below the raw JSON size', async () => {
    const project = createProject({ seed: 'blank', name: 'Heavy', type: 'hires' })
    // A worst case for size: a fully drawn charset and 4 screens.
    project.charset.forEach((pattern, i) => pattern.fill(i & 0xff))
    for (let i = 1; i < 4; i++) {
      project.screens.push({
        name: `Screen ${i + 1}`,
        cells: project.screens[0]!.cells.slice(),
        colors: project.screens[0]!.colors.slice(),
      })
    }

    const payload = await encodeShare(project)
    expect(payload.startsWith('1')).toBe(true) // gzip scheme
    expect(payload.length).toBeLessThan(JSON.stringify(project).length / 5)
    expect(await decodeShare(payload)).toEqual(project)
  })

  describe('link length', () => {
    /** A default project — 22 x 23, 256 ROM characters — with every cell drawn. */
    function fullProject() {
      const project = createProject({ name: 'Full Project', type: 'hires' })
      const screen = project.screens[0]!
      for (let i = 0; i < screen.cells.length; i++) {
        screen.cells[i] = (i * 7) % 256
        screen.colors[i] = i % 8
      }
      return project
    }

    it('keeps a full 22x23 project with a 256-character set under the warning', async () => {
      // The Phase 9 check. The charset dominates: 2 KB of pattern bytes that a
      // ROM font compresses to roughly 1.5 KB of base64, so the link lands
      // around 3.2 KB — which is why the threshold is grounded in what tools
      // actually accept rather than the 2 KB legacy-browser figure.
      const url = shareUrl(await encodeShare(fullProject()))
      expect(url.length).toBeLessThan(SHARE_LENGTH_WARNING)
      expect(url.length).toBeGreaterThan(2000) // the old threshold, for the record
    })

    it('stays under it for four full screens at the widest legal geometry', async () => {
      // 31 x 16 is 496 cells, just inside the 512-cell color RAM.
      const project = createProject({
        name: 'Biggest',
        type: 'mixed',
        settings: { columns: 31, rows: 16 },
      })
      const screen = project.screens[0]!
      for (let i = 0; i < screen.cells.length; i++) {
        screen.cells[i] = (i * 7) % 256
        screen.colors[i] = i % 8
      }
      for (let i = 1; i < 4; i++) {
        project.screens.push({ ...structuredClone(screen), name: `Screen ${i + 1}` })
      }
      expect(shareUrl(await encodeShare(project)).length).toBeLessThan(SHARE_LENGTH_WARNING)
    })

    it('goes over it once a project is genuinely too big, and still works', async () => {
      // Nothing the editor makes from ROM glyphs gets near the threshold; what
      // does is incompressible data at volume — 256 sixteen-row characters of
      // noise across several noisy screens. Nothing is broken when it happens,
      // the link is just long, so the size is surfaced (ShareDialog) rather
      // than the share being refused.
      const project = createProject({
        name: 'Noise',
        type: 'multicolor',
        seed: 'blank',
        settings: { columns: 31, rows: 16, charHeight: 16 },
      })
      let seed = 1
      const random = (max: number) => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        return (seed >>> 16) % max
      }
      for (const pattern of project.charset) {
        for (let i = 0; i < pattern.length; i++) pattern[i] = random(256)
      }
      const screen = project.screens[0]!
      for (let i = 0; i < screen.cells.length; i++) {
        screen.cells[i] = random(256)
        screen.colors[i] = random(8)
      }
      for (let i = 1; i < 4; i++) {
        project.screens.push({ ...structuredClone(screen), name: `Screen ${i + 1}` })
      }

      const payload = await encodeShare(project)
      expect(shareUrl(payload).length).toBeGreaterThan(SHARE_LENGTH_WARNING)
      expect(await decodeShare(payload)).toEqual(project) // long, but a working link
    })
  })

  it('reads the payload out of a location hash', () => {
    expect(readShareHash('#v=1abc')).toBe('1abc')
    expect(readShareHash('#')).toBeNull()
    expect(readShareHash('')).toBeNull()
    expect(readShareHash('#p=1')).toBeNull()
  })

  it('builds an absolute URL rooted at the app base', async () => {
    const url = shareUrl('1abc')
    expect(url.startsWith(window.location.origin)).toBe(true)
    expect(url.endsWith('#v=1abc')).toBe(true)
    expect(readShareHash(new URL(url).hash)).toBe('1abc')
  })

  it('rejects payloads with no scheme, an unknown scheme, or nothing after it', async () => {
    for (const bad of ['', '1', '9abcdef', 'abcdef']) {
      await expect(decodeShare(bad)).rejects.toBeInstanceOf(ShareLinkError)
    }
  })

  it('rejects a truncated payload rather than half-loading it', async () => {
    const payload = await encodeShare(
      createProject({ seed: 'blank', name: 'Trunc', type: 'hires' }),
    )
    await expect(decodeShare(payload.slice(0, payload.length - 12))).rejects.toBeInstanceOf(
      ShareLinkError,
    )
  })

  it('reads a plain-scheme payload for browsers without Compression Streams', async () => {
    const project = createProject({ seed: 'blank', name: 'Plain', type: 'hires' })
    const json = JSON.stringify(project)
    const bytes = new TextEncoder().encode(json)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const payload = '0' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(await decodeShare(payload)).toEqual(project)
  })

  it('surfaces schema problems with the normal validation message', async () => {
    const project = createProject({ seed: 'blank', name: 'Bad', type: 'hires' })
    project.screens[0]!.cells.pop()
    await expect(decodeShare(await encodeShare(project))).rejects.toBeInstanceOf(
      ProjectValidationError,
    )
  })
})
