/**
 * Commodore BASIC 2.0 output (PLAN.md D13).
 *
 * Two things make this more than "decimal bytes on numbered lines". First, the
 * VIC's screen editor accepts 88 characters per logical line; this keeps every
 * line inside {@link MAX_BASIC_LINE} so a listing can be retyped or pasted into
 * an emulator without wrapping into a second line and losing the tail. Second,
 * the optional loader turns the DATA into a program that actually runs: it
 * READs each segment straight into the address the project put it at, ending
 * with the VIC registers so the chip is only pointed at a charset once the
 * charset is there.
 *
 * Everything emitted is upper-case, punctuation-limited ASCII, because that is
 * what a PETSCII keyboard can type.
 */

import type { ByteSegment } from './tables'

/**
 * Character budget per line. BASIC 2.0 takes 88 characters of input (two
 * 40-column screen lines less the prompt); 80 leaves headroom for a listing
 * that has to survive being edited.
 */
export const MAX_BASIC_LINE = 80

export interface BasicOptions {
  startLine: number
  step: number
  /** Emit a READ/POKE loader ahead of the DATA. */
  loader: boolean
}

export const DEFAULT_BASIC_OPTIONS: BasicOptions = { startLine: 1000, step: 10, loader: true }

/**
 * Fold text into what a VIC-20 can display and a user can type: upper case,
 * dashes for the typographic ones, and nothing outside the ROM's `space`–`_`
 * run. REM text is stored verbatim, so anything left here reaches the machine.
 */
export function basicText(text: string): string {
  return text
    .toUpperCase()
    .replace(/[\u2012-\u2015\u2212]/g, '-')
    .replace(/[^\x20-\x5f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hexAddress(address: number): string {
  return '$' + address.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Render labeled byte segments as a BASIC 2.0 program: an optional loader,
 * then one `REM`-headed run of `DATA` per segment, in the order the loader
 * reads them.
 */
export function segmentsToBasic(
  segments: ByteSegment[],
  options: BasicOptions,
  title: string,
): string {
  const step = Math.max(1, Math.floor(options.step))
  let line = Math.max(0, Math.floor(options.startLine))
  const out: string[] = []
  const emit = (text: string) => {
    out.push(`${line} ${text}`)
    line += step
  }

  /**
   * A `REM`, clipped to the budget. Comment text is the one thing here that has
   * no natural length limit — a long project name would otherwise be the only
   * way to blow a line past what BASIC will read back.
   */
  const emitRem = (text: string) => {
    const budget = MAX_BASIC_LINE - `${line} REM `.length
    emit(`REM ${basicText(text).slice(0, Math.max(0, budget))}`.trimEnd())
  }

  /**
   * `DATA` for one segment. A whole logical row — one character, or one screen
   * row — goes on its own line when it fits, so the listing still reads as the
   * thing it came from; otherwise values are packed greedily to the budget.
   */
  const emitData = (bytes: number[], perLine: number) => {
    let i = 0
    while (i < bytes.length) {
      const prefix = `${line} DATA `
      const row = bytes.slice(i, i + perLine).join(',')
      if (prefix.length + row.length <= MAX_BASIC_LINE) {
        emit(`DATA ${row}`)
        i += perLine
        continue
      }
      let packed = ''
      while (i < bytes.length) {
        const piece = (packed ? ',' : '') + bytes[i]
        // At least one value per line, whatever the budget says.
        if (packed && prefix.length + packed.length + piece.length > MAX_BASIC_LINE) break
        packed += piece
        i++
      }
      emit(`DATA ${packed}`)
    }
  }

  emitRem(title)

  if (options.loader) {
    emitRem('VIC-20 EDITOR LOADER')
    for (const seg of segments) {
      if (seg.bytes.length === 0) continue
      emitRem(`${seg.description} AT ${hexAddress(seg.loadAddress)}`)
      emit(`FOR I=0 TO ${seg.bytes.length - 1}:READ V:POKE ${seg.loadAddress}+I,V:NEXT`)
    }
    emit('END')
  }

  for (const seg of segments) {
    emitRem(seg.description)
    emitData(seg.bytes, Math.max(1, seg.perLine))
  }

  return out.join('\n') + '\n'
}

/**
 * BASIC 2.0 keywords that appear in generated programs, longest first so
 * `RESTORE` is not read as `RE` + something. Each tokenises to one byte.
 */
const KEYWORDS = [
  'RESTORE',
  'RETURN',
  'GOSUB',
  'PRINT',
  'POKE',
  'READ',
  'DATA',
  'NEXT',
  'STEP',
  'THEN',
  'GOTO',
  'FOR',
  'REM',
  'END',
  'LET',
  'TO',
  'IF',
  'ON',
] as const

/** Tokenised length of one line's text, keywords counting as one byte each. */
function tokenizedLength(text: string): number {
  let bytes = 0
  let i = 0
  while (i < text.length) {
    const keyword = KEYWORDS.find((word) => text.startsWith(word, i))
    if (!keyword) {
      bytes++
      i++
      continue
    }
    bytes++
    i += keyword.length
    // A REM swallows the rest of the line as literal text.
    if (keyword === 'REM') return bytes + (text.length - i)
  }
  return bytes
}

/**
 * How large the program is once BASIC tokenises it: four bytes of link and line
 * number per line, the tokenised text, a terminating null, and two bytes of
 * end-of-program link. Worth knowing before pasting 8 KB of `DATA` into a
 * machine with 3583 bytes free.
 */
export function basicProgramBytes(program: string): number {
  const lines = program.split('\n').filter((text) => text.length > 0)
  return lines.reduce((sum, text) => sum + 5 + tokenizedLength(text.replace(/^\d+/, '')), 0) + 2
}
