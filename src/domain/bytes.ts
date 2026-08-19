/**
 * Format and parse a character's pattern bytes as a plain comma-separated
 * string — hex (`$3C, $42, …`) or decimal (`60, 66, …`, BASIC-friendly).
 *
 * Assembler-directive framing (ca65 `.byte`, etc.) lives in the export layer;
 * the character byte box uses these bare forms and accepts either on paste.
 */

import { DEFAULT_CHAR_HEIGHT } from './modes'
import type { CharPattern } from './types'

export type ByteRadix = 'hex' | 'dec'

/** Render pattern bytes as a comma-separated hex or decimal string. */
export function formatBytes(bytes: CharPattern, radix: ByteRadix): string {
  if (radix === 'hex') {
    return bytes.map((b) => '$' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')
  }
  return bytes.map((b) => b.toString(10)).join(', ')
}

// Leading BASIC line number ("1000 DATA …") or an assembler/BASIC keyword.
const LEADING_LINE_NUMBER = /^\s*\d+\s+(?=[a-z.!])/i
const LEADING_KEYWORD = /^\s*(\.byte|\.db|dc\.b|db|data|!byte|!by)\b[\s:]*/i

/**
 * Parse a pasted hex or decimal byte string into exactly `expected` bytes —
 * the project's char height, 8 or 16 (D3) — or `null` if it isn't a clean run
 * of in-range values of that length.
 *
 * Tolerant of separators (comma/space/newline), `$`/`0x` prefixes, and a
 * leading `.byte`/`db`/`DATA` (with optional BASIC line number). Radix is
 * inferred: any `$`/`0x` prefix or hex letter ⇒ hex; otherwise decimal — so
 * bare digits like `60, 66` read as decimal (BASIC) and `$3C, FF` as hex.
 */
export function parseBytes(
  text: string,
  expected: number = DEFAULT_CHAR_HEIGHT,
): CharPattern | null {
  const cleaned = text.trim().replace(LEADING_LINE_NUMBER, '').replace(LEADING_KEYWORD, '')
  const tokens = cleaned.split(/[\s,]+/).filter(Boolean)
  if (tokens.length !== expected) return null

  const hex = tokens.some((t) => /^(\$|0x)/i.test(t) || /[a-f]/i.test(t))
  const bytes: number[] = []
  for (const token of tokens) {
    const digits = token.replace(/^\$/, '').replace(/^0x/i, '')
    if (hex ? !/^[0-9a-f]+$/i.test(digits) : !/^[0-9]+$/.test(digits)) return null
    const value = parseInt(digits, hex ? 16 : 10)
    if (!Number.isInteger(value) || value < 0 || value > 255) return null
    bytes.push(value)
  }
  return bytes
}
