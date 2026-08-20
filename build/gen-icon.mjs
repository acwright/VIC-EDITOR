#!/usr/bin/env node
/**
 * Generate the desktop app-icon formats from build/icon-master.png.
 *
 * Outputs:
 *   build/icon.iconset/  — the PNG sizes macOS iconutil requires
 *   build/icon.icns      — macOS app icon
 *   build/icon.ico       — Windows app icon (multi-resolution)
 *   build/icon.png       — Linux app icon, and the About panel's icon (512×512)
 *
 * The master itself is generated, not drawn: `node scripts/generate-icons.mjs`
 * renders it from the same 8×8 glyph the favicons come from, so the desktop
 * icon and the web one cannot drift apart.
 *
 * Requirements: iconutil and sips (macOS), magick (ImageMagick 7).
 * Run: npm run icons
 */

import { execSync } from 'node:child_process'
import { mkdirSync, existsSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = resolve(__dirname, 'icon-master.png')
const iconset = resolve(__dirname, 'icon.iconset')

if (!existsSync(src)) {
  console.error(`Master PNG not found: ${src}`)
  console.error('Run `node scripts/generate-icons.mjs` first.')
  process.exit(1)
}

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' })
}

// --- macOS iconset ------------------------------------------------------------

if (existsSync(iconset)) rmSync(iconset, { recursive: true })
mkdirSync(iconset)

const iconsetSizes = [
  { file: 'icon_16x16.png', px: 16 },
  { file: 'icon_16x16@2x.png', px: 32 },
  { file: 'icon_32x32.png', px: 32 },
  { file: 'icon_32x32@2x.png', px: 64 },
  { file: 'icon_128x128.png', px: 128 },
  { file: 'icon_128x128@2x.png', px: 256 },
  { file: 'icon_256x256.png', px: 256 },
  { file: 'icon_256x256@2x.png', px: 512 },
  { file: 'icon_512x512.png', px: 512 },
  { file: 'icon_512x512@2x.png', px: 1024 },
]

// sips rather than magick here: it is macOS-native and keeps the RGB colorspace
// iconutil expects, which an ImageMagick resize does not reliably preserve.
console.log('Generating iconset PNGs…')
for (const { file, px } of iconsetSizes) {
  run(`sips -s format png -Z ${px} "${src}" --out "${iconset}/${file}" > /dev/null`)
  console.log(`  ${file} (${px}×${px})`)
}

// --- macOS .icns --------------------------------------------------------------

console.log('\nGenerating icon.icns…')
run(`iconutil -c icns -o "${resolve(__dirname, 'icon.icns')}" "${iconset}"`)

// --- Linux .png (512×512) -----------------------------------------------------

console.log('Generating icon.png (512×512)…')
run(`sips -s format png -Z 512 "${src}" --out "${resolve(__dirname, 'icon.png')}" > /dev/null`)

// --- Windows .ico (multi-resolution) ------------------------------------------

console.log('Generating icon.ico…')
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const tmpFiles = icoSizes.map((px) => {
  const tmp = `/tmp/icon_master_${px}.png`
  run(`magick "${src}" -strip -resize ${px}x${px} "${tmp}"`)
  return tmp
})
run(`magick ${tmpFiles.map((f) => `"${f}"`).join(' ')} "${resolve(__dirname, 'icon.ico')}"`)
tmpFiles.forEach((f) => rmSync(f, { force: true }))

console.log('\nDone:')
console.log('  build/icon.iconset/')
console.log('  build/icon.icns')
console.log('  build/icon.png')
console.log('  build/icon.ico')
