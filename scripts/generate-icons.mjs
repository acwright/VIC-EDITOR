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
 * and, into build/:
 *
 *   icon-master.png      — 1024×1024 source for the desktop app icon; feed it
 *                          to `npm run icons` (build/gen-icon.mjs) to get the
 *                          .icns/.ico/.png set electron-builder packages
 *   icon-document-master.png — 1024×1024 source for the *document* icon, the
 *                          one Finder and Explorer draw for a .vic20 file
 *
 * Zero dependencies: PNGs are encoded by hand using Node's built-in zlib.
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = join(ROOT, 'src', 'renderer', 'public')
const BUILD_DIR = join(ROOT, 'build')

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
const FOLD = [200, 200, 200, 255] // ink-300 — the underside of the folded corner
const CLEAR = [0, 0, 0, 0]

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

/**
 * Render the desktop app-icon master: the same tile, inset in a transparent
 * canvas with rounded corners.
 *
 * macOS draws an app icon at whatever size the file gives it and applies no
 * mask of its own, so full-bleed art reads as oversized beside every other icon
 * in the Dock. The platform convention is art occupying 824 of a 1024 canvas
 * with a corner radius near a quarter of its width — that margin lives in the
 * master, and Windows and Linux inherit it.
 */
function renderMasterRgba(size) {
  const px = Buffer.alloc(size * size * 4) // zero-filled: fully transparent
  const set = (x, y, [r, g, b, a]) => {
    const i = (y * size + x) * 4
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = a
  }

  const inset = Math.round((size * 100) / 1024)
  const tile = size - inset * 2
  const radius = tile * 0.225

  // Corner coverage by 4×4 supersampling — the only antialiasing in here, and
  // the only place it is needed: everything else lands on a pixel boundary.
  const covered = (x, y) => {
    let hits = 0
    for (let sy = 0; sy < 4; sy++) {
      for (let sx = 0; sx < 4; sx++) {
        const px0 = x + (sx + 0.5) / 4 - inset
        const py0 = y + (sy + 0.5) / 4 - inset
        if (px0 < 0 || px0 > tile || py0 < 0 || py0 > tile) continue
        const cx = Math.min(Math.max(px0, radius), tile - radius)
        const cy = Math.min(Math.max(py0, radius), tile - radius)
        const dx = px0 - cx
        const dy = py0 - cy
        if (dx * dx + dy * dy <= radius * radius) hits++
      }
    }
    return hits / 16
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = covered(x, y)
      set(x, y, a === 0 ? CLEAR : [BLACK[0], BLACK[1], BLACK[2], Math.round(a * 255)])
    }
  }

  // The glyph keeps favicon.svg's proportions within the tile: 96/512 padding
  // on each side, so the 8×8 grid fills 0.625 of it.
  const cell = Math.max(1, Math.floor((tile * 0.625) / 8))
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

/**
 * Render the *document* icon master: a page, corner turned down, with the app's
 * glyph on it.
 *
 * It has to read as "a file this app owns" at 32 px in a Finder list, which
 * rules out a second copy of the app icon — a document icon that is just the
 * app icon says "application" at every size. So the silhouette is the thing
 * doing the work: portrait, folded corner, and the same 8×8 glyph the app icon
 * carries, inverted onto a light page. Black-and-white, like everything else
 * here.
 */
function renderDocumentMasterRgba(size) {
  const px = Buffer.alloc(size * size * 4) // zero-filled: fully transparent
  const set = (x, y, [r, g, b, a]) => {
    const i = (y * size + x) * 4
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = a
  }

  const u = size / 1024 // the geometry below is written at 1024
  const x0 = 190 * u
  const x1 = 834 * u
  const y0 = 80 * u
  const y1 = 944 * u
  const fold = 210 * u
  const radius = 18 * u
  const stroke = 14 * u
  // Inside the page is everything below-left of the fold's diagonal, which runs
  // at 45° from (x1 - fold, y0) to (x1, y0 + fold).
  const diagonal = y0 - x1 + fold

  /** The color at one sub-sample, or CLEAR outside the page. */
  const sample = (x, y) => {
    if (y - x <= diagonal) return CLEAR
    if (x < x0 || x > x1 || y < y0 || y > y1) return CLEAR
    // Rounded corners: outside the corner circle is outside the page. The
    // top-right one is cut by the fold and needs no rounding.
    const cx = Math.min(Math.max(x, x0 + radius), x1 - radius)
    const cy = Math.min(Math.max(y, y0 + radius), y1 - radius)
    const corner = Math.hypot(x - cx, y - cy)
    if (corner > radius) return CLEAR

    const toEdge = Math.min(x - x0, x1 - x, y - y0, y1 - y, radius - corner + stroke)
    const toDiagonal = (y - x - diagonal) / Math.SQRT2
    if (toEdge < stroke || toDiagonal < stroke) return BLACK
    // The flap: the corner square on the page side of the diagonal.
    return x > x1 - fold && y < y0 + fold ? FOLD : WHITE
  }

  // 4×4 supersampling, averaged premultiplied so the outline does not fringe.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const [sr, sg, sb, sa] = sample(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)
          r += sr * sa
          g += sg * sa
          b += sb * sa
          a += sa
        }
      }
      if (a === 0) continue
      set(x, y, [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / 16)])
    }
  }

  // The glyph, on whole pixels so it stays crisp, centered on the page and
  // pulled clear of the fold.
  const cell = Math.max(1, Math.floor(((x1 - x0) * 0.6) / 8))
  const grid = cell * 8
  const offX = Math.round((x0 + x1) / 2 - grid / 2)
  const offY = Math.round((y0 + y1) / 2 - grid / 2)
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      if (!GLYPH[gy][gx]) continue
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) {
          set(offX + gx * cell + dx, offY + gy * cell + dy, BLACK)
        }
      }
    }
  }
  return px
}

function encodePng(size, render = renderRgba) {
  const rgba = render(size)
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

const writeTo = (dir, name, data) => {
  writeFileSync(join(dir, name), data)
  console.log('wrote', name)
}
const out = (name, data) => writeTo(PUBLIC_DIR, name, data)
const outBuild = (name, data) => writeTo(BUILD_DIR, name, data)

out('favicon.svg', buildSvg())
out('favicon.ico', encodeIco(32))
out('apple-touch-icon.png', encodePng(180))
out('icon-192.png', encodePng(192))
out('icon-512.png', encodePng(512))

mkdirSync(BUILD_DIR, { recursive: true })
outBuild('icon-master.png', encodePng(1024, renderMasterRgba))
outBuild('icon-document-master.png', encodePng(1024, renderDocumentMasterRgba))
