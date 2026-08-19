/**
 * Generates the ROM character-set module from the character generator ROM.
 *
 *   node scripts/generate-charset.mjs
 *
 * Reads `rom/chargen.bin` — the VIC-20 `901460-03` character ROM, build-time
 * input only — and emits `src/domain/romCharset.ts`: the four 1 KB blocks as
 * base64, plus a decoder. The binary never reaches the bundle; the generated
 * module does, and is committed (PLAN.md D16).
 *
 * Every check in `rom/README.md` runs first, and a failure **refuses to emit**
 * rather than writing something plausible. That matters more than it sounds:
 * the C64 chargen ROM is also 4096 bytes with the same four-block layout and
 * passes every structural test, so only the glyph fixtures and the pinned
 * hashes can tell the two machines apart (D16c).
 *
 * Zero dependencies — Node's built-in crypto and fs only.
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'rom', 'chargen.bin')
const TARGET = join(ROOT, 'src', 'domain', 'romCharset.ts')

const ROM_SIZE = 4096
const BLOCK_SIZE = 1024
const CHAR_HEIGHT = 8

/** Identity of revision 901460-03 (rom/README.md § Identity). */
const EXPECTED_MD5 = 'd390e340e94e1bef0f2fdfe9fa850993'
const EXPECTED_SHA1 = '4fd85ab6647ee2ac7ba40f729323f2472d35b9b4'

/**
 * Byte fixtures for two glyphs, by screen code. These are the checks that
 * matter — the C64's `A` is 2 pixels wide where the VIC's is 1, and nothing
 * structural notices the difference (rom/README.md § Do not use C64 values).
 */
const GLYPH_FIXTURES = [
  { code: 0, name: '@', bytes: [0x1c, 0x22, 0x4a, 0x56, 0x4c, 0x20, 0x1e, 0x00] },
  { code: 1, name: 'A', bytes: [0x18, 0x24, 0x42, 0x7e, 0x42, 0x42, 0x42, 0x00] },
]

/** The four 1 KB blocks, in ROM order. */
const BLOCKS = [
  { key: 'upper', label: 'Uppercase / graphics', reversedOf: null },
  { key: 'upperReversed', label: 'Uppercase / graphics, reversed', reversedOf: 'upper' },
  { key: 'lower', label: 'Lowercase / uppercase', reversedOf: null },
  { key: 'lowerReversed', label: 'Lowercase / uppercase, reversed', reversedOf: 'lower' },
]

const problems = []

function check(condition, message) {
  if (!condition) problems.push(message)
}

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}

// --- Read and verify ----------------------------------------------------------

let rom
try {
  rom = readFileSync(SOURCE)
} catch (error) {
  console.error(`cannot read ${SOURCE}: ${error.message}`)
  console.error('See rom/README.md for where this file comes from.')
  process.exit(1)
}

check(rom.length === ROM_SIZE, `size is ${rom.length} bytes, expected ${ROM_SIZE}`)

if (rom.length === ROM_SIZE) {
  const md5 = createHash('md5').update(rom).digest('hex')
  const sha1 = createHash('sha1').update(rom).digest('hex')
  check(md5 === EXPECTED_MD5, `MD5 is ${md5}, expected ${EXPECTED_MD5} (revision 901460-03)`)
  check(sha1 === EXPECTED_SHA1, `SHA-1 is ${sha1}, expected ${EXPECTED_SHA1}`)

  for (const fixture of GLYPH_FIXTURES) {
    const at = fixture.code * CHAR_HEIGHT
    const actual = rom.subarray(at, at + CHAR_HEIGHT)
    check(
      Buffer.from(fixture.bytes).equals(actual),
      `screen code ${fixture.code} (\`${fixture.name}\`) is ${hex(actual)}, ` +
        `expected ${hex(fixture.bytes)} — a C64 chargen dump would look like this`,
    )
  }

  const block = (index) => rom.subarray(index * BLOCK_SIZE, (index + 1) * BLOCK_SIZE)
  const complements = (a, b) => a.every((byte, i) => byte === (~b[i] & 0xff))

  check(complements(block(1), block(0)), 'block 2 is not the bitwise complement of block 1')
  check(complements(block(3), block(2)), 'block 4 is not the bitwise complement of block 3')
  check(!block(2).equals(block(0)), 'block 3 is identical to block 1 — one set, not two')
}

if (problems.length > 0) {
  console.error(`refusing to emit — ${SOURCE} failed verification:`)
  for (const problem of problems) console.error(`  · ${problem}`)
  console.error('\nSee rom/README.md. The expected dump is VIC-20 chargen 901460-03.')
  process.exit(1)
}

// --- Emit ---------------------------------------------------------------------

const encoded = Object.fromEntries(
  BLOCKS.map(({ key }, index) => [
    key,
    rom.subarray(index * BLOCK_SIZE, (index + 1) * BLOCK_SIZE).toString('base64'),
  ]),
)

/** Wrap a base64 string to `width` columns so the emitted file stays readable. */
function wrap(base64, indent, width = 92) {
  const lines = base64.match(new RegExp(`.{1,${width}}`, 'g')) ?? []
  return lines.map((line) => `${indent}'${line}'`).join(' +\n')
}

const blockEntries = BLOCKS.map(
  ({ key, label }) => `  // ${label}\n  ${key}:\n${wrap(encoded[key], '    ')},`,
).join('\n')

const source = `/**
 * The VIC-20 ROM character set — GENERATED FILE, DO NOT EDIT.
 *
 * Produced by \`node scripts/generate-charset.mjs\` from \`rom/chargen.bin\`
 * (character generator ROM 901460-03, MD5 ${EXPECTED_MD5}).
 * Regenerate rather than editing; the script re-verifies the dump and refuses
 * to emit if it is the wrong revision or the wrong machine (PLAN.md D16, D16c).
 *
 * Four 1 KB blocks, each 128 characters of ${CHAR_HEIGHT} bytes, MSB = leftmost pixel,
 * indexed by **screen code** rather than PETSCII: code 0 is \`@\`, code 1 is
 * \`A\`. Held as base64 (~5.5 KB) and decoded on demand — new projects seed
 * from this instead of starting blank (D15).
 */

import type { CharPattern, Charset } from './types'

/** Which ROM font a project seeds from; \`blank\` is the opt-out (D15). */
export type CharsetSeed = 'rom-upper' | 'rom-lower' | 'blank'

/** The two selectable ROM fonts, each paired with its reversed block (D16a). */
export type RomCharsetName = 'upper' | 'lower'

export const CHARS_PER_BLOCK = 128
export const ROM_CHAR_HEIGHT = ${CHAR_HEIGHT}

/** Base64 of the four 1 KB blocks, in ROM order. */
const BLOCKS: Record<'upper' | 'upperReversed' | 'lower' | 'lowerReversed', string> = {
${blockEntries}
}

/**
 * A ROM font and the reversed block that follows it in memory. Seeding 256
 * characters from \`upper\` gives exactly what a real VIC shows with chargen base
 * \`$8000\`: codes 128–255 read \`$8400\`, the reversed block (D16a).
 */
const SETS: Record<RomCharsetName, readonly string[]> = {
  upper: [BLOCKS.upper, BLOCKS.upperReversed],
  lower: [BLOCKS.lower, BLOCKS.lowerReversed],
}

export const ROM_CHARSET_LABELS: Record<RomCharsetName, string> = {
  upper: 'Uppercase / graphics',
  lower: 'Lowercase / uppercase',
}

/** base64 → bytes, without assuming Node's Buffer or a DOM \`atob\` shim. */
function decodeBase64(base64: string): number[] {
  const binary = atob(base64)
  return Array.from({ length: binary.length }, (_, i) => binary.charCodeAt(i))
}

/** One block's 128 patterns of ${CHAR_HEIGHT} bytes. */
function decodeBlock(base64: string): CharPattern[] {
  const bytes = decodeBase64(base64)
  return Array.from({ length: CHARS_PER_BLOCK }, (_, char) =>
    bytes.slice(char * ROM_CHAR_HEIGHT, (char + 1) * ROM_CHAR_HEIGHT),
  )
}

/**
 * \`count\` characters of ROM font \`name\`, as fresh mutable patterns: the first
 * 64 or 128 of the block, or the block followed by its reversed pair at 256
 * (D16a). The ROM is an ${CHAR_HEIGHT}×${CHAR_HEIGHT} font, so every pattern is ${CHAR_HEIGHT} bytes tall —
 * callers wanting 16-tall characters start blank instead (D16b).
 */
export function romCharset(name: RomCharsetName, count: number): Charset {
  const patterns = SETS[name].flatMap(decodeBlock)
  return patterns.slice(0, count).map((pattern) => [...pattern])
}
`

writeFileSync(TARGET, source)
console.log(`wrote ${TARGET.slice(ROOT.length + 1)} (${(source.length / 1024).toFixed(1)} KB)`)
