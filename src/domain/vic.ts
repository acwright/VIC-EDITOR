/**
 * The 6560/6561 itself: the sixteen CPU-visible registers at $9000–$900F, the
 * memory map they select, and the limits they cannot express (PLAN.md §2.3–2.5).
 *
 * Everything with a register-shaped answer lives here, so no other module has
 * to remember the chip's traps: the video-matrix A9 bit doubling as the color
 * RAM select, the 1 KB-granular chargen base, and $900F bit 3 being *set* for
 * normal display and clear for reverse.
 */

import type { Expansion, ProjectSettings, VideoStandard } from './types'

/** First register address; the block runs to $900F. */
export const VIC_BASE = 0x9000
export const REGISTER_COUNT = 16

/** Color RAM is 512 nybbles and the matrix base is 512-byte granular (§2.3). */
export const MAX_CELLS = 512
export const MAX_COLUMNS = 31
export const MAX_ROWS = 32
export const DEFAULT_COLUMNS = 22
export const DEFAULT_ROWS = 23

/**
 * The VIC sees a 14-bit address whose top bit is the CPU's A15 inverted: the
 * chip's $0000–$1FFF is the CPU's $8000–$9FFF (character ROM and I/O), and its
 * $2000–$3FFF is the CPU's bottom 8 KB of RAM.
 */
function toVicAddress(cpuAddress: number): number {
  return cpuAddress >= 0x8000 ? cpuAddress - 0x8000 : cpuAddress + 0x2000
}

function toCpuAddress(vicAddress: number): number {
  return vicAddress < 0x2000 ? vicAddress + 0x8000 : vicAddress - 0x2000
}

/** CPU address of chargen base value 0–15 ($9005 bits 0–3), e.g. 0 → $8000. */
export function charBaseAddress(value: number): number {
  return toCpuAddress((value & 0x0f) << 10)
}

/** The $9005 nybble that selects `address`; inverse of `charBaseAddress`. */
export function charBaseValue(address: number): number {
  return (toVicAddress(address) >> 10) & 0x0f
}

/** Video-matrix fields: the $9005 high nybble and the A9 bit in $9002 bit 7. */
export function screenBaseFields(screenBase: number): { nybble: number; a9: number } {
  const vic = toVicAddress(screenBase)
  return { nybble: (vic >> 10) & 0x0f, a9: (vic >> 9) & 1 }
}

/**
 * Color RAM address for a video matrix: $9600 when matrix A9 is set, $9400
 * when it is clear. One bit selects both — color RAM is not freely placeable.
 */
export function colorRamAddress(screenBase: number): number {
  return screenBaseFields(screenBase).a9 ? 0x9600 : 0x9400
}

/** How a chargen selector's 1 KB block is backed (§2.4). */
export type CharBaseKind = 'rom' | 'io' | 'ram'

export interface CharBaseOption {
  /** $9005 bits 0–3. */
  value: number
  address: number
  kind: CharBaseKind
  /** What lives at that address, so a selector can say why 5 is a bad idea. */
  note: string
}

/** What backs each 1 KB chargen block, indexed by the selector value (§2.4). */
const CHAR_BASE_BLOCKS: readonly { kind: CharBaseKind; note: string }[] = [
  { kind: 'rom', note: 'Uppercase / graphics ROM' },
  { kind: 'rom', note: 'Uppercase / graphics ROM, reversed' },
  { kind: 'rom', note: 'Lowercase / uppercase ROM' },
  { kind: 'rom', note: 'Lowercase / uppercase ROM, reversed' },
  { kind: 'io', note: 'VIC and VIA registers — not memory' },
  { kind: 'io', note: 'Color RAM — not memory' },
  { kind: 'io', note: 'I/O block 2 — not memory' },
  { kind: 'io', note: 'I/O block 3 — not memory' },
  { kind: 'ram', note: 'Zero page, stack and KERNAL workspace' },
  { kind: 'ram', note: '+3 K expansion RAM' },
  { kind: 'ram', note: '+3 K expansion RAM' },
  { kind: 'ram', note: '+3 K expansion RAM' },
  { kind: 'ram', note: 'Main RAM — screen memory with +8 K' },
  { kind: 'ram', note: 'Main RAM — the usual charset with +8 K' },
  { kind: 'ram', note: 'Main RAM' },
  { kind: 'ram', note: 'Main RAM — the usual unexpanded charset' },
]

/** Every chargen base the register can select, in register order (§2.4). */
export const CHAR_BASE_OPTIONS: readonly CharBaseOption[] = CHAR_BASE_BLOCKS.map(
  (block, value) => ({ ...block, value, address: charBaseAddress(value) }),
)

/** The video matrix base is 512-byte granular (§2.3). */
export const SCREEN_BASE_GRANULARITY = 0x200

/**
 * Where the video matrix can start. The register reaches the whole 14-bit VIC
 * address space, but only the CPU's bottom 8 KB is RAM — a screen anywhere
 * else would be pointed at ROM or I/O, so those are not offered.
 */
export const SCREEN_BASE_OPTIONS: readonly number[] = Array.from(
  { length: 0x2000 / SCREEN_BASE_GRANULARITY },
  (_, index) => index * SCREEN_BASE_GRANULARITY,
)

/** Every memory expansion the editor models, smallest first (§2.4). */
export const EXPANSIONS: readonly Expansion[] = ['none', '3k', '8k', '16k', '24k']

/** How an expansion is written in the UI — "Unexpanded (5 K)", "+8 K". */
export function expansionLabel(expansion: Expansion): string {
  return expansion === 'none'
    ? 'Unexpanded (5 K)'
    : `+${expansion.toUpperCase().replace('K', ' K')}`
}

export interface ExpansionDefaults {
  /** Where BASIC's program text starts, for the generated loader. */
  basicStart: number
  screenBase: number
  /** $9005 low nybble — a RAM address the charset can be copied to. */
  charBase: number
}

/** Where screen, charset and BASIC sensibly live for a given expansion (§2.4). */
export function defaultsForExpansion(expansion: Expansion): ExpansionDefaults {
  switch (expansion) {
    case 'none':
      return { basicStart: 0x1001, screenBase: 0x1e00, charBase: 15 } // $1C00
    case '3k':
      return { basicStart: 0x0401, screenBase: 0x1e00, charBase: 15 }
    default:
      // +8 K and above move the screen down and BASIC up to $1201.
      return { basicStart: 0x1201, screenBase: 0x1000, charBase: 13 } // $1400
  }
}

export interface Origins {
  /** $9000 bits 0–6. */
  horizontal: number
  /** $9001. */
  vertical: number
}

/** Display origins that center the default screen on each standard (§2.6). */
export function defaultOrigins(video: VideoStandard): Origins {
  return video === 'pal' ? { horizontal: 12, vertical: 38 } : { horizontal: 5, vertical: 25 }
}

/**
 * The active picture, in VIC dots across and scanlines down, per standard.
 *
 * The chip emits four dots per CPU cycle — 65 cycles a line on NTSC (a 4.09 MHz
 * dot clock), 71 on PAL (4.43 MHz) — but a CRT only paints the ~52.6 µs of the
 * NTSC line and ~52 µs of the PAL one that fall outside blanking, which is
 * where these dot counts come from.
 */
const ACTIVE_PICTURE: Record<VideoStandard, { dots: number; lines: number }> = {
  ntsc: { dots: 215, lines: 240 },
  pal: { dots: 231, lines: 288 },
}

/**
 * How wide a VIC pixel is relative to its height on a 4:3 display — about 1.49
 * on NTSC and 1.66 on PAL. The editor draws square pixels because that is the
 * grid you author on; this is the number that stretches the preview back to
 * what the hardware shows, where a circle drawn round comes out an upright
 * ellipse.
 */
export function pixelAspect(video: VideoStandard): number {
  const { dots, lines } = ACTIVE_PICTURE[video]
  return (4 / 3) * (lines / dots)
}

/**
 * The sixteen register bytes a project's settings describe (§2.5, D14).
 * Read-only and unmodeled registers ($9004 raster, $9006–$900D light pen,
 * paddles and sound) read back as zero.
 */
export function registerBytes(settings: ProjectSettings): number[] {
  const origins = defaultOrigins(settings.video)
  const { nybble, a9 } = screenBaseFields(settings.screenBase)
  const bytes: number[] = Array.from({ length: REGISTER_COUNT }, () => 0)

  bytes[0] = origins.horizontal & 0x7f // bit 7 interlace: off
  bytes[1] = origins.vertical & 0xff
  bytes[2] = (a9 << 7) | (settings.columns & 0x7f)
  bytes[3] = ((settings.rows & 0x3f) << 1) | (settings.charHeight === 16 ? 1 : 0)
  bytes[5] = (nybble << 4) | (settings.charBase & 0x0f)
  bytes[14] = (settings.auxColor & 0x0f) << 4 // low nybble is sound volume
  bytes[15] =
    ((settings.screenColor & 0x0f) << 4) |
    (settings.reverse ? 0 : 0x08) | // bit 3 is *set* for normal display
    (settings.borderColor & 0x07)

  return bytes
}

export interface GeometryStatus {
  /** True when the geometry is representable and displayable (D9). */
  ok: boolean
  cells: number
  /** Both dimensions are whole numbers the registers can hold. */
  inRange: boolean
  /** columns × rows exceeds the 512-cell color RAM. */
  overBudget: boolean
  /** Legal, but larger than the machine's power-on 22 × 23. */
  nonDefault: boolean
}

/** Check a geometry against the register, display and color-RAM limits (D9). */
export function validateGeometry(
  settings: Pick<ProjectSettings, 'columns' | 'rows'>,
): GeometryStatus {
  const { columns, rows } = settings
  const cells = columns * rows
  const inRange =
    Number.isInteger(columns) &&
    Number.isInteger(rows) &&
    columns >= 1 &&
    columns <= MAX_COLUMNS &&
    rows >= 1 &&
    rows <= MAX_ROWS
  const overBudget = cells > MAX_CELLS
  return {
    ok: inRange && !overBudget,
    cells,
    inRange,
    overBudget,
    nonDefault: columns > DEFAULT_COLUMNS || rows > DEFAULT_ROWS,
  }
}

export interface RegisterInfo {
  /** CPU address, $9000–$900F. */
  address: number
  /** Short name, for the readout's label. */
  name: string
  /** What the byte means, field by field — the readout's hover text (D14). */
  description: string
}

/**
 * The sixteen registers, in order, with what each byte carries (§2.5). The
 * readout is only as useful as its explanations, so they live beside the
 * encoder that produces the bytes rather than in the component that shows them.
 */
const REGISTER_MEANINGS: readonly Omit<RegisterInfo, 'address'>[] = [
  {
    name: 'Horizontal origin',
    description: 'Bits 0–6 place the display left to right. Bit 7 selects interlace (NTSC only).',
  },
  { name: 'Vertical origin', description: 'The raster line the display starts on.' },
  {
    name: 'Columns / matrix A9',
    description:
      'Bits 0–6 are the column count. Bit 7 is video-matrix A9, which also chooses color RAM: $9400 when clear, $9600 when set.',
  },
  {
    name: 'Rows / char height',
    description:
      'Bits 1–6 are the row count. Bit 0 selects 8 × 16 characters. Bit 7 is the raster high bit and is read-only.',
  },
  { name: 'Raster', description: 'The current raster line. Read-only — this readout shows 0.' },
  {
    name: 'Matrix / chargen base',
    description:
      'Bits 4–7 are video-matrix A13–A10, bits 0–3 chargen A13–A10. Both are 1 KB granular.',
  },
  { name: 'Light pen X', description: 'Light pen horizontal position. Not modeled.' },
  { name: 'Light pen Y', description: 'Light pen vertical position. Not modeled.' },
  { name: 'Paddle X', description: 'Potentiometer 1. Not modeled.' },
  { name: 'Paddle Y', description: 'Potentiometer 2. Not modeled.' },
  { name: 'Bass voice', description: 'Sound oscillator 1. Not modeled.' },
  { name: 'Alto voice', description: 'Sound oscillator 2. Not modeled.' },
  { name: 'Soprano voice', description: 'Sound oscillator 3. Not modeled.' },
  { name: 'Noise voice', description: 'Noise oscillator. Not modeled.' },
  {
    name: 'Auxiliary color / volume',
    description:
      'Bits 4–7 are the auxiliary color — multicolor pixel value 11. Bits 0–3 are the sound volume, which this editor leaves at zero.',
  },
  {
    name: 'Screen / reverse / border',
    description:
      'Bits 4–7 are the screen color, bits 0–2 the border. Bit 3 is set for normal video and clear for reverse — the polarity that is easy to invert by accident.',
  },
]

export const REGISTERS: readonly RegisterInfo[] = REGISTER_MEANINGS.map((register, index) => ({
  ...register,
  address: VIC_BASE + index,
}))

/** `$9000`, `$900F` — register addresses formatted the one way. */
export function registerLabel(index: number): string {
  return '$' + (VIC_BASE + index).toString(16).toUpperCase()
}

/**
 * The register block as a hex dump: two rows of eight, addressed, with a
 * comment line naming what it is. This is what the readout copies (D14) — the
 * assembly and BASIC renderings of the same bytes are the export's job.
 */
export function formatRegisterDump(bytes: number[]): string {
  const hex = (value: number) => value.toString(16).toUpperCase().padStart(2, '0')
  const lines = [`; VIC-20 registers ${registerLabel(0)}-${registerLabel(REGISTER_COUNT - 1)}`]
  for (let offset = 0; offset < REGISTER_COUNT; offset += 8) {
    const row = bytes
      .slice(offset, offset + 8)
      .map(hex)
      .join(' ')
    lines.push(`${registerLabel(offset)}: ${row}`)
  }
  return lines.join('\n')
}
