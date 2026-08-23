import { describe, expect, it } from 'vitest'
import { blankScreen, createProject, defaultSettings } from '../factory'
import {
  ProjectValidationError,
  deserializeProject,
  projectContentHash,
  serializeProject,
  validateProject,
} from '../serialization'
import type { Project } from '../types'

function clone(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project
}

function sample(): Project {
  return clone(createProject({ seed: 'blank', name: 'X', type: 'hires' }))
}

/** Returns the ProjectValidationError thrown for `data`; fails if none is thrown. */
function rejectionOf(data: unknown): ProjectValidationError {
  try {
    validateProject(data)
  } catch (error) {
    if (error instanceof ProjectValidationError) return error
    throw error
  }
  throw new Error('expected validateProject to throw')
}

describe('serialization', () => {
  describe('round-trip', () => {
    it('round-trips a hires project', () => {
      const project = createProject({ seed: 'blank', name: 'RT', type: 'hires' })
      project.charset[7] = [0x3c, 0x42, 0x81, 0xa5, 0x81, 0x99, 0x42, 0x3c]
      project.settings.screenColor = 6
      project.settings.borderColor = 3
      project.screens[0]!.cells[42] = 7
      project.screens[0]!.colors[42] = 2
      project.screens.push(blankScreen('Screen 2', project.settings))
      expect(deserializeProject(serializeProject(project))).toEqual(project)
    })

    it('round-trips a multicolor project on non-default geometry', () => {
      const project = createProject({
        seed: 'blank',
        name: 'MC',
        type: 'multicolor',
        settings: { columns: 16, rows: 16, charHeight: 16, charCount: 64, video: 'pal' },
      })
      expect(deserializeProject(serializeProject(project))).toEqual(project)
    })

    it('round-trips a mixed project with its per-character modes', () => {
      const project = createProject({ seed: 'blank', name: 'MX', type: 'mixed' })
      project.charModes![3] = true
      expect(deserializeProject(serializeProject(project))).toEqual(project)
    })

    it('serializes pretty-printed JSON', () => {
      const json = serializeProject(createProject({ seed: 'blank', name: 'Pretty', type: 'hires' }))
      expect(json).toContain('\n  "version": 1')
    })
  })

  describe('rejection of malformed input', () => {
    it('rejects invalid JSON text', () => {
      expect(() => deserializeProject('{not json')).toThrowError('File is not valid JSON.')
    })

    it('rejects non-objects', () => {
      expect(rejectionOf([]).message).toContain('must be a JSON object')
      expect(rejectionOf('hi').message).toContain('must be a JSON object')
      expect(rejectionOf(null).message).toContain('must be a JSON object')
    })

    it('rejects unsupported versions', () => {
      expect(rejectionOf({ ...sample(), version: 2 }).message).toContain(
        'Unsupported project version',
      )
    })

    it('rejects missing id / name', () => {
      expect(rejectionOf({ ...sample(), id: '' }).message).toContain('"id"')
      expect(rejectionOf({ ...sample(), name: 42 }).message).toContain('"name"')
    })

    it('rejects an unknown type', () => {
      expect(rejectionOf({ ...sample(), type: 'bitmap' }).message).toContain('"type"')
    })

    describe('files from the TMS9918 editor this one was seeded from', () => {
      // Same schema version, different chip — there is no migration path (D17),
      // so the message has to name the app rather than report whichever field
      // the generic validator happened to reach first.
      function tms9918(overrides: Record<string, unknown> = {}): unknown {
        return {
          version: 1,
          id: 'abc',
          name: 'Old Project',
          type: 'graphics1',
          createdAt: '2026-01-01T00:00:00.000Z',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          settings: {},
          charsets: [[]],
          colors: { groups: [] },
          screens: [{ name: 'Screen 1', cells: [] }],
          ...overrides,
        }
      }

      it('names the app rather than the first field that fails', () => {
        const message = rejectionOf(tms9918()).message
        expect(message).toContain('TMS9918 editor')
        expect(message).toContain('.vic20.json')
      })

      it('recognizes a "charsets" list', () => {
        expect(rejectionOf(tms9918()).message).toContain('"charsets"')
      })

      it('recognizes a TMS9918-only mode', () => {
        // No `charsets`/`colors` to go on — the mode name is the signature.
        for (const type of ['text', 'graphics2', 'sprite']) {
          const file = tms9918({ type, charsets: undefined, colors: undefined })
          expect(rejectionOf(file).message).toContain(`"${type}" is a TMS9918 mode`)
        }
      })

      it('recognizes a sprite project by its animations', () => {
        const file = tms9918({ type: 'multicolor', charsets: undefined, animations: [] })
        expect(rejectionOf(file).message).toContain('sprite animations')
      })

      it('recognizes the one mode name both editors use', () => {
        // `multicolor` exists on both chips, so a TMS9918 file naming it would
        // otherwise pass the type check and fail on settings instead.
        const file = tms9918({ type: 'multicolor' })
        expect(rejectionOf(file).message).toContain('TMS9918 editor')
      })

      it('leaves valid VIC projects alone', () => {
        // The detector runs before every other check, so a false positive here
        // would make the app unable to open its own files.
        expect(() => validateProject(sample())).not.toThrow()
      })
    })

    it('rejects malformed timestamps', () => {
      expect(rejectionOf({ ...sample(), createdAt: 'yesterday' }).message).toContain('createdAt')
      expect(rejectionOf({ ...sample(), modifiedAt: 7 }).message).toContain('modifiedAt')
    })

    it('rejects non-object settings', () => {
      expect(rejectionOf({ ...sample(), settings: [] }).message).toContain('"settings"')
      expect(rejectionOf({ ...sample(), settings: null }).message).toContain('"settings"')
    })

    describe('settings', () => {
      /** A project whose settings carry `overrides`, with everything else valid. */
      function withSettings(overrides: Record<string, unknown>): unknown {
        const p = sample()
        return { ...p, settings: { ...p.settings, ...overrides } }
      }

      it('rejects geometry outside the register and display limits (D9)', () => {
        expect(rejectionOf(withSettings({ columns: 0 })).message).toContain('"columns"')
        expect(rejectionOf(withSettings({ columns: 32 })).message).toContain('"columns"')
        expect(rejectionOf(withSettings({ rows: 33 })).message).toContain('"rows"')
      })

      it('rejects geometry over the 512-cell color RAM', () => {
        // 27 × 19 = 513: legal in both registers, one cell too many together.
        const p = sample()
        const over = { ...p, settings: { ...p.settings, columns: 27, rows: 19 } }
        expect(rejectionOf(over).message).toContain('513 cells')
      })

      it('rejects unknown char heights, counts and video standards', () => {
        expect(rejectionOf(withSettings({ charHeight: 12 })).message).toContain('"charHeight"')
        expect(rejectionOf(withSettings({ charCount: 100 })).message).toContain('"charCount"')
        expect(rejectionOf(withSettings({ video: 'secam' })).message).toContain('"video"')
      })

      it('rejects colors outside the width of their register field (D5)', () => {
        expect(rejectionOf(withSettings({ screenColor: 16 })).message).toContain('"screenColor"')
        expect(rejectionOf(withSettings({ auxColor: -1 })).message).toContain('"auxColor"')
        // Border is a 3-bit field: 8–15 cannot be expressed.
        expect(rejectionOf(withSettings({ borderColor: 8 })).message).toContain('"borderColor"')
        // …while the 4-bit slots take the same value happily.
        expect(() => validateProject(withSettings({ screenColor: 15 }))).not.toThrow()
      })

      it('rejects a non-boolean reverse flag', () => {
        expect(rejectionOf(withSettings({ reverse: 'off' })).message).toContain('"reverse"')
      })

      it('rejects unknown expansions and out-of-range memory bases', () => {
        expect(rejectionOf(withSettings({ expansion: '64k' })).message).toContain('"expansion"')
        expect(rejectionOf(withSettings({ charBase: 16 })).message).toContain('"charBase"')
        // The video matrix base is 512-byte granular (§2.3).
        expect(rejectionOf(withSettings({ screenBase: 0x1e10 })).message).toContain('"screenBase"')
      })
    })

    it('rejects a charset whose length does not match charCount', () => {
      const p = sample()
      p.charset.pop()
      expect(rejectionOf(p).message).toContain('256 characters')
    })

    it('rejects patterns of the wrong length or with out-of-range bytes', () => {
      const short = sample()
      short.charset[3]!.pop()
      expect(rejectionOf(short).message).toContain('8 bytes')

      const oversized = sample()
      oversized.charset[3]![0] = 256
      expect(rejectionOf(oversized).message).toContain('8 bytes')
    })

    it('measures patterns against the project’s char height', () => {
      const tall = clone(
        createProject({ seed: 'blank', name: 'T', type: 'hires', settings: { charHeight: 16 } }),
      )
      expect(() => validateProject(tall)).not.toThrow()
      tall.charset[0] = [0, 0, 0, 0, 0, 0, 0, 0]
      expect(rejectionOf(tall).message).toContain('16 bytes')
    })

    describe('charModes (D2)', () => {
      it('are required, and the right length, in `mixed`', () => {
        const p = clone(createProject({ seed: 'blank', name: 'M', type: 'mixed' }))
        expect(() => validateProject(p)).not.toThrow()
        expect(rejectionOf({ ...p, charModes: undefined }).message).toContain('"charModes"')
        expect(rejectionOf({ ...p, charModes: [true, false] }).message).toContain('"charModes"')
        expect(rejectionOf({ ...p, charModes: p.charModes!.map(() => 1) }).message).toContain(
          '"charModes"',
        )
      })

      it('are refused everywhere else', () => {
        const p = sample()
        expect(rejectionOf({ ...p, charModes: [] }).message).toContain('"charModes"')
      })
    })

    it('requires at least one named screen', () => {
      expect(rejectionOf({ ...sample(), screens: [] }).message).toContain('at least one screen')
      const unnamed = sample()
      unnamed.screens[0]!.name = ''
      expect(rejectionOf(unnamed).message).toContain('"name"')
    })

    it('rejects screens whose cell count does not match the geometry', () => {
      const cells = defaultSettings().columns * defaultSettings().rows
      const p = sample()
      p.screens[0]!.cells.pop()
      expect(rejectionOf(p).message).toContain(`${cells} character codes`)
    })

    it('rejects out-of-range character codes', () => {
      const p = sample()
      p.screens[0]!.cells[0] = 256
      expect(rejectionOf(p).message).toContain('character codes')
    })

    it('rejects color RAM of the wrong length or outside 0–7 (D7)', () => {
      const short = sample()
      short.screens[0]!.colors.pop()
      expect(rejectionOf(short).message).toContain('color RAM values')

      const bright = sample()
      bright.screens[0]!.colors[0] = 8 // color RAM is 3 bits wide
      expect(rejectionOf(bright).message).toContain('color RAM values (0–7)')
    })
  })
})

describe('git-first format (D4)', () => {
  const lines = (project: Project): string[] => serializeProject(project).split('\n')

  it('ends with a trailing newline and uses LF throughout', () => {
    const text = serializeProject(sample())
    expect(text.endsWith('\n')).toBe(true)
    expect(text).not.toContain('\r')
  })

  it('writes the top-level keys in the fixed order', () => {
    const text = serializeProject(createProject({ seed: 'blank', name: 'Order', type: 'mixed' }))
    const keys = [...text.matchAll(/^ {2}"(\w+)":/gm)].map((match) => match[1])
    expect(keys).toEqual([
      'version',
      'id',
      'name',
      'type',
      'createdAt',
      'modifiedAt',
      'settings',
      'charset',
      'charModes',
      'screens',
    ])
  })

  it('writes the settings keys in the fixed order', () => {
    const text = serializeProject(sample())
    const keys = [...text.matchAll(/^ {4}"(\w+)":/gm)].map((match) => match[1])
    expect(keys).toEqual(Object.keys(defaultSettings()))
  })

  it('serializes identically whichever order the keys were built in', () => {
    const project = sample()
    // What a file someone else wrote parses back as: same project, other order.
    const shuffled = Object.fromEntries(
      Object.entries(project as unknown as Record<string, unknown>).reverse(),
    ) as unknown as Project
    expect(serializeProject(shuffled)).toBe(serializeProject(project))
  })

  it('puts one character per line, whatever the character height', () => {
    const project = sample()
    project.charset[5] = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(lines(project)).toContain('    [1, 2, 3, 4, 5, 6, 7, 8],')
    expect(lines(project).filter((line) => /^ {4}\[\d/.test(line))).toHaveLength(256)

    const tall = createProject({
      seed: 'blank',
      name: 'Tall',
      type: 'hires',
      settings: { charHeight: 16, charCount: 64 },
    })
    const patterns = lines(tall).filter((line) => /^ {4}\[\d/.test(line))
    expect(patterns).toHaveLength(64)
    expect(
      patterns[0]!
        .trim()
        .replace(/[[\],]/g, '')
        .split(' '),
    ).toHaveLength(16)
  })

  it('puts one screen row per line, at settings.columns, for cells and colors', () => {
    const project = createProject({
      seed: 'blank',
      name: 'Rows',
      type: 'hires',
      settings: { columns: 20, rows: 12 },
    })
    const rows = lines(project).filter((line) => /^ {8}\d/.test(line))
    // Two grids of 12 rows each.
    expect(rows).toHaveLength(24)
    expect(rows[0]!.trim().split(', ')).toHaveLength(20)
  })

  it('reserializes a document it wrote byte for byte', () => {
    const text = serializeProject(createProject({ seed: 'blank', name: 'Idem', type: 'mixed' }))
    expect(serializeProject(deserializeProject(text))).toBe(text)
  })

  it('keeps a key it does not know about, after the ones it does', () => {
    const withExtra = { ...sample(), zzz: 'kept' } as unknown as Project
    const text = serializeProject(withExtra)
    expect(text).toContain('"zzz": "kept"')
    expect(text.indexOf('"zzz"')).toBeGreaterThan(text.indexOf('"screens"'))
  })

  it('changes exactly one line when one character changes', () => {
    const project = sample()
    const before = serializeProject(project).split('\n')
    project.charset[7] = [1, 2, 3, 4, 5, 6, 7, 8]
    const after = serializeProject(project).split('\n')
    expect(after).toHaveLength(before.length)
    expect(after.filter((line, i) => line !== before[i])).toHaveLength(1)
  })
})

describe('content hash (D5)', () => {
  it('ignores modifiedAt', () => {
    const project = sample()
    const before = projectContentHash(project)
    project.modifiedAt = new Date(Date.now() + 60_000).toISOString()
    expect(projectContentHash(project)).toBe(before)
  })

  it('moves when a single pixel does', () => {
    const project = sample()
    const before = projectContentHash(project)
    project.charset[0]![0] = 1
    expect(projectContentHash(project)).not.toBe(before)
  })

  it('matches across a round-trip through the file format', () => {
    const project = createProject({ seed: 'blank', name: 'Hash', type: 'mixed' })
    expect(projectContentHash(deserializeProject(serializeProject(project)))).toBe(
      projectContentHash(project),
    )
  })
})
