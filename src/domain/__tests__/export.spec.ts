import { describe, expect, it } from 'vitest'
import { blankScreen, createProject, defaultSettings } from '../factory'
import { charBaseAddress, colorRamAddress, registerBytes, VIC_BASE } from '../vic'
import {
  ASM_DIALECTS,
  ASM_DIALECT_LIST,
  LABEL_CASES,
  MAX_BASIC_LINE,
  applyLabelCase,
  availableSegments,
  basicProgramBytes,
  basicText,
  charsetSegments,
  colorRamBytes,
  hexAddress,
  isAsmDialectId,
  labelSlug,
  nameTableBytes,
  patternTableBytes,
  prgLoadAddress,
  registerSegment,
  screenSegments,
  segmentsToAsm,
  segmentsToBasic,
  segmentsToBinary,
  segmentsToPrg,
  type ByteSegment,
} from '../export'

const { columns: COLUMNS, rows: ROWS, charCount: CHAR_COUNT } = defaultSettings()
const CELLS = COLUMNS * ROWS

function project() {
  return createProject({ seed: 'blank', name: 'Export', type: 'hires' })
}

describe('table extraction', () => {
  it('patternTableBytes is every character laid end to end', () => {
    const p = project()
    p.charset[0] = [1, 2, 3, 4, 5, 6, 7, 8]
    const bytes = patternTableBytes(p)
    expect(bytes).toHaveLength(CHAR_COUNT * 8)
    expect(bytes.slice(0, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(bytes.slice(8, 16)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('patternTableBytes follows the project char height', () => {
    const tall = createProject({
      seed: 'blank',
      name: 'T',
      type: 'hires',
      settings: { charHeight: 16 },
    })
    expect(patternTableBytes(tall)).toHaveLength(CHAR_COUNT * 16)
  })

  it('nameTableBytes is the screen cells, masked to a byte', () => {
    const p = project()
    p.screens[0]!.cells[3] = 200
    const bytes = nameTableBytes(p, 0)
    expect(bytes).toHaveLength(CELLS)
    expect(bytes[3]).toBe(200)
  })

  it('nameTableBytes is empty for a screen that does not exist', () => {
    expect(nameTableBytes(project(), 4)).toEqual([])
  })

  it('colorRamBytes is the color RAM as the hardware reads it', () => {
    const p = project()
    p.screens[0]!.colors[2] = 5
    const bytes = colorRamBytes(p, 0)
    expect(bytes).toHaveLength(CELLS)
    expect(bytes[2]).toBe(5)
  })

  it('colorRamBytes sets bit 3 on cells holding a multicolor character (D2)', () => {
    const p = createProject({ seed: 'blank', name: 'M', type: 'mixed' })
    p.screens[0]!.cells[0] = 4
    p.screens[0]!.colors[0] = 2
    p.charModes![4] = true
    expect(colorRamBytes(p, 0)[0]).toBe(0x0a)
    expect(colorRamBytes(p, 0)[1]).toBe(6) // untouched cell, default color
  })

  it('colorRamBytes flags every cell in a multicolor project', () => {
    const p = createProject({ seed: 'blank', name: 'M', type: 'multicolor' })
    expect(colorRamBytes(p, 0).every((byte) => (byte & 0x08) !== 0)).toBe(true)
  })
})

describe('labelSlug', () => {
  it('slugifies to a safe assembler identifier', () => {
    expect(labelSlug('Title Screen')).toBe('title_screen')
    expect(labelSlug('  ¡Hola! ')).toBe('hola')
    expect(labelSlug('2nd screen')).toBe('_2nd_screen')
    expect(labelSlug('***')).toBe('untitled')
  })
})

describe('charsetSegments', () => {
  it('emits the pattern table, one character per line', () => {
    const segs = charsetSegments(project())
    expect(segs.map((s) => s.label)).toEqual(['char_patterns'])
    expect(segs[0]!.bytes).toHaveLength(CHAR_COUNT * 8)
    expect(segs[0]!.perLine).toBe(8)
  })

  it('wraps tall characters at their own height', () => {
    const tall = createProject({
      seed: 'blank',
      name: 'T',
      type: 'hires',
      settings: { charHeight: 16 },
    })
    expect(charsetSegments(tall)[0]!.perLine).toBe(16)
  })

  it('loads at the project chargen base', () => {
    const p = createProject({ seed: 'blank', name: 'C', type: 'hires', settings: { charBase: 13 } })
    expect(charsetSegments(p)[0]!.loadAddress).toBe(charBaseAddress(13))
  })
})

describe('screenSegments', () => {
  it('emits cells and color RAM per selected screen, named after it', () => {
    const p = project()
    p.screens.push(blankScreen('Title', p.settings))
    const segs = screenSegments(p, [0, 1])
    expect(segs.map((s) => s.label)).toEqual(['screen_1', 'colors_1', 'screen_2', 'colors_2'])
    expect(segs[2]!.description).toContain('Title')
    expect(segs[3]!.description).toContain('Color RAM')
    expect(segs[0]!.bytes).toHaveLength(CELLS)
    expect(segs[1]!.bytes).toHaveLength(CELLS)
  })

  it('wraps lines at the screen width so the output reads as the grid', () => {
    const segs = screenSegments(project(), [0])
    expect(segs[0]!.perLine).toBe(COLUMNS)
    expect(segs[1]!.perLine).toBe(COLUMNS)
  })

  it('loads the matrix at the screen base and the colors at the RAM it implies', () => {
    const p = project()
    const segs = screenSegments(p, [0])
    expect(segs[0]!.loadAddress).toBe(p.settings.screenBase)
    expect(segs[1]!.loadAddress).toBe(colorRamAddress(p.settings.screenBase))
  })
})

describe('registerSegment', () => {
  it('is the sixteen configured register bytes at $9000 (D14)', () => {
    const p = project()
    const seg = registerSegment(p)
    expect(seg.label).toBe('vic_registers')
    expect(seg.bytes).toEqual(registerBytes(p.settings))
    expect(seg.bytes).toHaveLength(16)
    expect(seg.loadAddress).toBe(VIC_BASE)
    expect(seg.description).toBe('VIC registers')
  })
})

describe('availableSegments', () => {
  it('offers the scope tables plus the registers, registers last', () => {
    const p = project()
    expect(availableSegments(p, 'charset', []).map((s) => s.label)).toEqual([
      'char_patterns',
      'vic_registers',
    ])
    expect(availableSegments(p, 'screen', [0]).map((s) => s.label)).toEqual([
      'screen_1',
      'colors_1',
      'vic_registers',
    ])
  })
})

const SAMPLE: ByteSegment[] = [
  {
    label: 'char_patterns',
    description: 'Character patterns',
    bytes: [0, 60, 66, 255],
    perLine: 4,
    loadAddress: 0x1c00,
  },
]

describe('assembler dialects (D12)', () => {
  it('offers ca65/64tass, ACME and DASM — and no Z80', () => {
    expect(ASM_DIALECT_LIST.map((d) => d.id)).toEqual(['ca65', 'acme', 'dasm'])
    expect(isAsmDialectId('acme')).toBe(true)
    expect(isAsmDialectId('z80')).toBe(false)
  })

  it.each([
    ['ca65', '.byte', '.s'],
    ['acme', '!byte', '.a'],
    ['dasm', 'dc.b', '.asm'],
  ] as const)('%s emits %s into %s', (id, directive, extension) => {
    expect(ASM_DIALECTS[id].directive).toBe(directive)
    expect(ASM_DIALECTS[id].extension).toBe(extension)
    expect(segmentsToAsm(SAMPLE, ASM_DIALECTS[id], 'X')).toContain(
      `    ${directive} $00, $3C, $42, $FF`,
    )
  })
})

describe('segmentsToAsm', () => {
  it('renders a whole ca65 file byte for byte', () => {
    expect(segmentsToAsm(SAMPLE, ASM_DIALECTS.ca65, 'My Project — Hires')).toBe(
      [
        '; My Project — Hires',
        '; 6502 assembly (ca65 / 64tass) — exported from VIC-20 Editor',
        '',
        '; Character patterns — 4 bytes @ $1C00',
        'char_patterns:',
        '    .byte $00, $3C, $42, $FF',
        '',
      ].join('\n'),
    )
  })

  it('recases labels when asked, leaving the data untouched', () => {
    const out = segmentsToAsm(SAMPLE, ASM_DIALECTS.ca65, 'X', { labelCase: 'pascal' })
    expect(out).toContain('CharPatterns:')
    expect(out).not.toContain('char_patterns:')
    expect(out).toContain('    .byte $00, $3C, $42, $FF')
  })

  it('defaults to snake_case', () => {
    expect(segmentsToAsm(SAMPLE, ASM_DIALECTS.ca65, 'X')).toBe(
      segmentsToAsm(SAMPLE, ASM_DIALECTS.ca65, 'X', { labelCase: 'snake' }),
    )
  })
})

describe('applyLabelCase', () => {
  it.each([
    ['snake', 'char_patterns_1'],
    ['upper', 'CHAR_PATTERNS_1'],
    ['camel', 'charPatterns1'],
    ['pascal', 'CharPatterns1'],
  ] as const)('renders %s', (labelCase, expected) => {
    expect(applyLabelCase('char_patterns_1', labelCase)).toBe(expected)
  })

  it('handles single-token labels', () => {
    expect(applyLabelCase('screen', 'pascal')).toBe('Screen')
    expect(applyLabelCase('screen', 'camel')).toBe('screen')
    expect(applyLabelCase('char_colors', 'camel')).toBe('charColors')
  })

  it('never emits a character an assembler would read as an operator', () => {
    for (const { id } of LABEL_CASES) {
      expect(applyLabelCase('screen_1', id)).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/)
    }
  })
})

describe('hexAddress', () => {
  it('is always four digits', () => {
    expect(hexAddress(0x1c00)).toBe('$1C00')
    expect(hexAddress(0)).toBe('$0000')
    expect(hexAddress(0x9000)).toBe('$9000')
  })
})

describe('basicText', () => {
  it('folds text into what a PETSCII keyboard can type', () => {
    expect(basicText('My Project — Hires')).toBe('MY PROJECT - HIRES')
    expect(basicText('Color RAM: Café')).toBe('COLOR RAM: CAF')
    expect(basicText('  spaced   out  ')).toBe('SPACED OUT')
  })
})

describe('segmentsToBasic', () => {
  it('renders a whole DATA-only program byte for byte', () => {
    const out = segmentsToBasic(SAMPLE, { startLine: 1000, step: 10, loader: false }, 'X')
    expect(out.trimEnd().split('\n')).toEqual([
      '1000 REM X',
      '1010 REM CHARACTER PATTERNS',
      '1020 DATA 0,60,66,255',
    ])
  })

  it('generates a loader that READs each segment to its own address (D13)', () => {
    const out = segmentsToBasic(SAMPLE, { startLine: 1000, step: 10, loader: true }, 'My — Set')
    expect(out.trimEnd().split('\n')).toEqual([
      '1000 REM MY - SET',
      '1010 REM VIC-20 EDITOR LOADER',
      '1020 REM CHARACTER PATTERNS AT $1C00',
      '1030 FOR I=0 TO 3:READ V:POKE 7168+I,V:NEXT',
      '1040 END',
      '1050 REM CHARACTER PATTERNS',
      '1060 DATA 0,60,66,255',
    ])
  })

  it('pokes the registers last, after the data they point at', () => {
    const p = project()
    const out = segmentsToBasic(
      availableSegments(p, 'charset', []),
      { startLine: 100, step: 1, loader: true },
      'X',
    )
    const loops = out.split('\n').filter((line) => line.includes('FOR I=0'))
    expect(loops).toHaveLength(2)
    expect(loops[1]).toContain(`POKE ${VIC_BASE}+I,V`)
  })

  it('skips empty segments in the loader rather than emitting FOR I=0 TO -1', () => {
    const empty: ByteSegment[] = [
      { label: 'screen_1', description: 'Screen', bytes: [], perLine: 4, loadAddress: 0x1e00 },
    ]
    const out = segmentsToBasic(empty, { startLine: 10, step: 10, loader: true }, 'X')
    expect(out).not.toContain('TO -1')
    expect(out).not.toContain('DATA')
  })

  it('keeps a whole logical row per line while it fits', () => {
    const rows: ByteSegment[] = [
      { label: 'a', description: 'A', bytes: [1, 2, 3, 4, 5, 6], perLine: 3, loadAddress: 0 },
    ]
    const out = segmentsToBasic(rows, { startLine: 10, step: 10, loader: false }, 'X')
    expect(out).toContain('DATA 1,2,3')
    expect(out).toContain('DATA 4,5,6')
  })

  it('packs a row too wide for the budget instead of overflowing it', () => {
    const wide: ByteSegment[] = [
      {
        label: 'screen_1',
        description: 'Screen',
        bytes: Array.from({ length: 22 }, () => 255),
        perLine: 22,
        loadAddress: 0x1e00,
      },
    ]
    const out = segmentsToBasic(wide, { startLine: 1000, step: 10, loader: false }, 'X')
    const data = out
      .trimEnd()
      .split('\n')
      .filter((line) => line.includes('DATA'))
    expect(data.length).toBeGreaterThan(1)
    const values = data.flatMap((line) => line.replace(/^\d+ DATA /, '').split(','))
    expect(values).toHaveLength(22)
    expect(values.every((v) => v === '255')).toBe(true)
  })

  it('never exceeds the line budget, loader and all', () => {
    const p = project()
    p.screens[0]!.cells = p.screens[0]!.cells.map(() => 255)
    p.charset = p.charset.map(() => [255, 255, 255, 255, 255, 255, 255, 255])
    for (const scope of ['charset', 'screen'] as const) {
      const out = segmentsToBasic(
        availableSegments(p, scope, [0]),
        { startLine: 63000, step: 1, loader: true },
        'A Very Long Project Title That Nobody Would Sensibly Type Into A Vic Twenty',
      )
      // Naming the offenders beats a bare length assertion when this breaks.
      expect(out.split('\n').filter((line) => line.length > MAX_BASIC_LINE)).toEqual([])
    }
  })

  it('always emits at least one value per DATA line', () => {
    const out = segmentsToBasic(SAMPLE, { startLine: 999999, step: 1, loader: false }, 'X')
    expect(out).toContain('DATA 0,60,66,255')
  })
})

describe('basicProgramBytes', () => {
  it('counts link, line number, tokenised text and terminators', () => {
    // 2 link + 2 line number + 1 REM token + 3 literal chars + 1 null, + 2 end.
    expect(basicProgramBytes('1000 REM AB\n')).toBe(12)
  })

  it('grows with the program', () => {
    const small = segmentsToBasic(SAMPLE, { startLine: 10, step: 10, loader: false }, 'X')
    const big = segmentsToBasic(
      availableSegments(project(), 'charset', []),
      { startLine: 10, step: 10, loader: true },
      'X',
    )
    expect(basicProgramBytes(big)).toBeGreaterThan(basicProgramBytes(small))
  })
})

describe('segmentsToBinary', () => {
  it('concatenates all segment bytes', () => {
    const two: ByteSegment[] = [
      { label: 'a', description: 'a', bytes: [1, 2, 3], perLine: 8, loadAddress: 0x1c00 },
      { label: 'b', description: 'b', bytes: [4, 5], perLine: 8, loadAddress: 0x1e00 },
    ]
    expect(Array.from(segmentsToBinary(two))).toEqual([1, 2, 3, 4, 5])
  })
})

describe('segmentsToPrg', () => {
  it('prefixes the bytes with a little-endian load address (D12)', () => {
    expect(Array.from(segmentsToPrg(SAMPLE))).toEqual([0x00, 0x1c, 0, 60, 66, 255])
  })

  it('takes the load address from the first segment', () => {
    const p = project()
    const segs = screenSegments(p, [0])
    expect(prgLoadAddress(segs)).toBe(p.settings.screenBase)
    const prg = segmentsToPrg(segs)
    expect(prg[0]! | (prg[1]! << 8)).toBe(p.settings.screenBase)
    expect(prg).toHaveLength(2 + CELLS * 2)
  })

  it('honors an explicit load address', () => {
    expect(Array.from(segmentsToPrg(SAMPLE, 0x1201)).slice(0, 2)).toEqual([0x01, 0x12])
  })

  it('is a bare two-byte header when there is nothing to write', () => {
    expect(Array.from(segmentsToPrg([]))).toEqual([0x00, 0x00])
  })
})
