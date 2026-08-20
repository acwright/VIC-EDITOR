/**
 * Generates the app icon set from a single source bitmap.
 *
 *   node scripts/generate-icons.mjs
 *
 * The icon is a monochrome pixel-art "V" glyph on a black tile — drawn on the
 * same 8×8 grid the editor works in, and readable at favicon sizes. Black and
 * white only; no palette color. Emits, into src/renderer/public/:
 *
 *   favicon.svg          — primary, scalable, rounded tile
 *   favicon.ico          — 32×32 PNG-in-ICO fallback (square)
 *   apple-touch-icon.png — 180×180 (square; iOS applies its own mask)
 *   icon-192.png         — web manifest
 *   icon-512.png         — web manifest
 *
 * Zero dependencies: PNGs are encoded by hand using Node's built-in zlib.
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer', 'public')

// 8×8 source glyph — 1 = white pixel, 0 = black (left-right symmetric).
const GLYPH = [
  [1, 1, 0, 0, 0, 0, 1, 1],
  [1, 1, 0, 0, 0, 0, 1, 1],
  [1, 1, 0, 0, 0, 0, 1, 1],
  [0, 1, 1, 0, 0, 1, 1, 0],
  [0, 1, 1, 0, 0, 1, 1, 0],
  [0, 0, 1, 1, 1, 1, 0, 0],
  [0, 0, 1, 1, 1, 1, 0, 0],
  [0, 0, 0, 1, 1, 0, 0, 0],
]

const BLACK = [10, 10, 10, 255] // ink-950 (#0a0a0a) — matches the app background
const WHITE = [245, 245, 245, 255] // ink-100

// --- PNG encoding (RGBA, 8-bit, no interlace) ---------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

/** Render the glyph to an RGBA buffer at `size`px (square, full-bleed black). */
function renderRgba(size) {
  const px = Buffer.alloc(size * size * 4)
  const set = (x, y, [r, g, b, a]) => {
    const i = (y * size + x) * 4
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = a
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, BLACK)

  // Center the 8×8 grid on integer cell boundaries so pixels stay crisp.
  const cell = Math.max(1, Math.floor((size * 0.72) / 8))
  const grid = cell * 8
  const off = Math.round((size - grid) / 2)
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      if (!GLYPH[gy][gx]) continue
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) {
          set(off + gx * cell + dx, off + gy * cell + dy, WHITE)
        }
      }
    }
  }
  return px
}

function encodePng(size) {
  const rgba = renderRgba(size)
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Wrap a PNG as a single-image .ico (browsers accept PNG-encoded entries). */
function encodeIco(size) {
  const png = encodePng(size)
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // image count
  const entry = Buffer.alloc(16)
  entry[0] = size >= 256 ? 0 : size // width (0 = 256)
  entry[1] = size >= 256 ? 0 : size // height
  entry[2] = 0 // palette count
  entry[3] = 0 // reserved
  entry.writeUInt16LE(1, 4) // color planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png.length, 8) // image size
  entry.writeUInt32LE(6 + 16, 12) // image offset
  return Buffer.concat([header, entry, png])
}

function buildSvg() {
  const S = 512
  const pad = 96
  const cell = (S - pad * 2) / 8 // 40
  const rects = []
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (!GLYPH[y][x]) continue
      rects.push(
        `<rect x="${pad + x * cell}" y="${pad + y * cell}" width="${cell}" height="${cell}"/>`,
      )
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" role="img" aria-label="VIC-20 Editor">
  <rect width="${S}" height="${S}" rx="112" fill="#0a0a0a"/>
  <g fill="#f5f5f5">
    ${rects.join('\n    ')}
  </g>
</svg>
`
}

const out = (name, data) => {
  writeFileSync(join(PUBLIC_DIR, name), data)
  console.log('wrote', name)
}

out('favicon.svg', buildSvg())
out('favicon.ico', encodeIco(32))
out('apple-touch-icon.png', encodePng(180))
out('icon-192.png', encodePng(192))
out('icon-512.png', encodePng(512))
