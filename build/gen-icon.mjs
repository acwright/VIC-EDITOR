#!/usr/bin/env node
/**
 * Generate the desktop icon formats from the masters in build/.
 *
 * Outputs, from `icon-master.png` — the application:
 *   build/icon.iconset/  — the PNG sizes macOS iconutil requires
 *   build/icon.icns      — macOS app icon
 *   build/icon.ico       — Windows app icon (multi-resolution)
 *   build/icon.png       — Linux app icon, and the About panel's icon (512×512)
 *
 * and from `icon-document-master.png` — the **document** (PLAN.md Phase F4),
 * which is what Finder and Explorer draw for a project file:
 *   build/document.iconset/
 *   build/document.icns  — named in `fileAssociations[].icon`
 *   build/document.ico
 *
 * Two sets from two masters, and the document one is deliberately not a second
 * copy of the app icon: a file has to look like a file at 32 px in a list.
 * There is no Linux `.png` for it — electron-builder's own MIME package names
 * the freedesktop `x-office-document` icon and offers no way to point at ours.
 *
 * The masters themselves are generated, not drawn:
 * `node scripts/generate-icons.mjs` renders both from the same 8×8 glyph the
 * favicons come from, so nothing here can drift apart from the web app.
 *
 * Requirements: iconutil and sips (macOS), magick (ImageMagick 7).
 * Run: npm run icons
 */

import { execSync } from 'node:child_process'
import { mkdirSync, existsSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' })
}

const ICONSET_SIZES = [
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

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/** One master → .icns, .ico, and optionally the Linux .png. */
function generate({ master, name, linuxPng = false }) {
  const src = resolve(__dirname, master)
  if (!existsSync(src)) {
    console.error(`Master PNG not found: ${src}`)
    console.error('Run `node scripts/generate-icons.mjs` first.')
    process.exit(1)
  }

  // --- macOS iconset ----------------------------------------------------------

  const iconset = resolve(__dirname, `${name}.iconset`)
  if (existsSync(iconset)) rmSync(iconset, { recursive: true })
  mkdirSync(iconset)

  // sips rather than magick here: it is macOS-native and keeps the RGB colorspace
  // iconutil expects, which an ImageMagick resize does not reliably preserve.
  console.log(`Generating ${name}.iconset PNGs…`)
  for (const { file, px } of ICONSET_SIZES) {
    run(`sips -s format png -Z ${px} "${src}" --out "${iconset}/${file}" > /dev/null`)
    console.log(`  ${file} (${px}×${px})`)
  }

  // --- macOS .icns ------------------------------------------------------------

  console.log(`\nGenerating ${name}.icns…`)
  run(`iconutil -c icns -o "${resolve(__dirname, `${name}.icns`)}" "${iconset}"`)

  // --- Linux .png (512×512) ---------------------------------------------------

  if (linuxPng) {
    console.log(`Generating ${name}.png (512×512)…`)
    run(
      `sips -s format png -Z 512 "${src}" --out "${resolve(__dirname, `${name}.png`)}" > /dev/null`,
    )
  }

  // --- Windows .ico (multi-resolution) ----------------------------------------

  console.log(`Generating ${name}.ico…`)
  const tmpFiles = ICO_SIZES.map((px) => {
    const tmp = `/tmp/${name}_master_${px}.png`
    run(`magick "${src}" -strip -resize ${px}x${px} "${tmp}"`)
    return tmp
  })
  run(`magick ${tmpFiles.map((f) => `"${f}"`).join(' ')} "${resolve(__dirname, `${name}.ico`)}"`)
  tmpFiles.forEach((f) => rmSync(f, { force: true }))
}

generate({ master: 'icon-master.png', name: 'icon', linuxPng: true })
generate({ master: 'icon-document-master.png', name: 'document' })

console.log('\nDone:')
console.log('  build/icon.iconset/   build/icon.icns   build/icon.png   build/icon.ico')
console.log('  build/document.iconset/   build/document.icns   build/document.ico')
