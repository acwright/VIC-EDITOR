/**
 * The VIC-20 ROM character set — GENERATED FILE, DO NOT EDIT.
 *
 * Produced by `node scripts/generate-charset.mjs` from `rom/chargen.bin`
 * (character generator ROM 901460-03, MD5 d390e340e94e1bef0f2fdfe9fa850993).
 * Regenerate rather than editing; the script re-verifies the dump and refuses
 * to emit if it is the wrong revision or the wrong machine (PLAN.md D16, D16c).
 *
 * Four 1 KB blocks, each 128 characters of 8 bytes, MSB = leftmost pixel,
 * indexed by **screen code** rather than PETSCII: code 0 is `@`, code 1 is
 * `A`. Held as base64 (~5.5 KB) and decoded on demand — new projects seed
 * from this instead of starting blank (D15).
 */

import type { CharPattern, Charset } from './types'

/** Which ROM font a project seeds from; `blank` is the opt-out (D15). */
export type CharsetSeed = 'rom-upper' | 'rom-lower' | 'blank'

/** The two selectable ROM fonts, each paired with its reversed block (D16a). */
export type RomCharsetName = 'upper' | 'lower'

export const CHARS_PER_BLOCK = 128
export const ROM_CHAR_HEIGHT = 8

/** Base64 of the four 1 KB blocks, in ROM order. */
const BLOCKS: Record<'upper' | 'upperReversed' | 'lower' | 'lowerReversed', string> = {
  // Uppercase / graphics
  upper:
    'HCJKVkwgHgAYJEJ+QkJCAHwiIjwiInwAHCJAQEAiHAB4JCIiIiR4AH5AQHhAQH4AfkBAeEBAQAAcIkBOQiIcAEJCQn5C' +
    'QkIAHAgICAgIHAAOBAQEBEQ4AEJESHBIREIAQEBAQEBAfgBCZlpaQkJCAEJiUkpGQkIAGCRCQkIkGAB8QkJ8QEBAABgk' +
    'QkJKJBoAfEJCfEhEQgA8QkA8AkI8AD4ICAgICAgAQkJCQkJCPABCQkIkJBgYAEJCQlpaZkIAQkIkGCRCQgAiIiIcCAgI' +
    'AH4CBBggQH4APCAgICAgPAAMEBA8EHBuADwEBAQEBDwAAAgcKggICAgAABAgfyAQAAAAAAAAAAAACAgICAAACAAkJCQA' +
    'AAAAACQkfiR+JCQACB4oHAo8CAAAYmQIECZGADBISDBKRDoABAgQAAAAAAAECBAQEAgEACAQCAgIECAACCocPhwqCAAA' +
    'CAg+CAgAAAAAAAAACAgQAAAAfgAAAAAAAAAAABgYAAACBAgQIEAAPEJGWmJCPAAIGCgICAg+ADxCAgwwQH4APEICHAJC' +
    'PAAEDBQkfgQEAH5AeAQCRDgAHCBAfEJCPAB+QgQIEBAQADxCQjxCQjwAPEJCPgIEOAAAAAgAAAgAAAAACAAACAgQDhgw' +
    'YDAYDgAAAH4AfgAAAHAYDAYMGHAAPEICDBAAEAAAAAAA/wAAAAgcPn9/HD4AEBAQEBAQEBAAAAD/AAAAAAAA/wAAAAAA' +
    'AP8AAAAAAAAAAAAAAP8AACAgICAgICAgBAQEBAQEBAQAAAAA4BAICAgICAQDAAAACAgIEOAAAACAgICAgICA/4BAIBAI' +
    'BAIBAQIECBAgQID/gICAgICAgP8BAQEBAQEBADx+fn5+PAAAAAAAAAD/ADZ/f38+HAgAQEBAQEBAQEAAAAAAAwQICIFC' +
    'JBgYJEKBADxCQkJCPAAIHCp3KggIAAICAgICAgICCBw+fz4cCAAICAgI/wgICKBQoFCgUKBQCAgICAgICAgAAAE+VBQU' +
    'AP9/Px8PBwMBAAAAAAAAAADw8PDw8PDw8AAAAAD//////wAAAAAAAAAAAAAAAAAA/4CAgICAgICAqlWqVapVqlUBAQEB' +
    'AQEBAQAAAACqVapV//78+PDgwIADAwMDAwMDAwgICAgPCAgIAAAAAA8PDw8ICAgIDwAAAAAAAAD4CAgIAAAAAAAA//8A' +
    'AAAADwgICAgICAj/AAAAAAAAAP8ICAgICAgI+AgICMDAwMDAwMDA4ODg4ODg4OAHBwcHBwcHB///AAAAAAAA////AAAA' +
    'AAAAAAAAAP///wEBAQEBAQH/AAAAAPDw8PAPDw8PAAAAAAgICAj4AAAA8PDw8AAAAADw8PDwDw8PDw==',
  // Uppercase / graphics, reversed
  upperReversed:
    '4921qbPf4f/n272Bvb29/4Pd3cPd3YP/492/v7/d4/+H293d3duH/4G/v4e/v4H/gb+/h7+/v//j3b+xvd3j/729vYG9' +
    'vb3/4/f39/f34//x+/v7+7vH/727t4+3u73/v7+/v7+/gf+9maWlvb29/72drbW5vb3/59u9vb3b5/+Dvb2Dv7+//+fb' +
    'vb212+X/g729g7e7vf/Dvb/D/b3D/8H39/f39/f/vb29vb29w/+9vb3b2+fn/729vaWlmb3/vb3b59u9vf/d3d3j9/f3' +
    '/4H9++ffv4H/w9/f39/fw//z7+/D74+R/8P7+/v7+8P///fj1ff39/f//+/fgN/v////////////9/f39///9//b29v/' +
    '/////9vbgduB29v/9+HX4/XD9///nZv379m5/8+3t8+1u8X/+/fv///////79+/v7/f7/9/v9/f379//99XjwePV9///' +
    '9/fB9/f/////////9/fv////gf///////////+fn///9+/fv37//w725pZ29w//359f39/fB/8O9/fPPv4H/w7394/29' +
    'w//78+vbgfv7/4G/h/v9u8f/49+/g729w/+Bvfv37+/v/8O9vcO9vcP/w729wf37x/////f///f/////9///9/fv8efP' +
    'n8/n8f///4H/gf///4/n8/nz54//w7398+//7///////AP////fjwYCA48H/7+/v7+/v7+////8A////////AP//////' +
    '/wD//////////////wD//9/f39/f39/f+/v7+/v7+/v/////H+/39/f39/v8////9/f37x////9/f39/f39/AH+/3+/3' +
    '+/3+/v379+/fv38Af39/f39/fwD+/v7+/v7+/8OBgYGBw/////////8A/8mAgIDB4/f/v7+/v7+/v7///////Pv39369' +
    '2+fn271+/8O9vb29w//349WI1ff3//39/f39/f399+PBgMHj9//39/f3APf391+vX69fr1+v9/f39/f39/f///7Bq+vr' +
    '/wCAwODw+Pz+//////////8PDw8PDw8PD/////8AAAAAAP//////////////////AH9/f39/f39/VapVqlWqVar+/v7+' +
    '/v7+/v////9VqlWqAAEDBw8fP3/8/Pz8/Pz8/Pf39/fw9/f3//////Dw8PD39/f38P////////8H9/f3////////AAD/' +
    '////8Pf39/f39/cA/////////wD39/f39/f3B/f39z8/Pz8/Pz8/Hx8fHx8fHx/4+Pj4+Pj4+AAA////////AAAA////' +
    '/////////wAAAP7+/v7+/v4A/////w8PDw/w8PDw//////f39/cH////Dw8PD/////8PDw8P8PDw8A==',
  // Lowercase / uppercase
  lower:
    'HCJKVkwgHgAAADgEPEQ6AEBAXGJCYlwAAAA8QkBCPAACAjpGQkY6AAAAPEJ+QDwADBIQfBAQEAAAADpGRjoCPEBAXGJC' +
    'QkIACAAYCAgIHAAEAAwEBAREOEBAREhQaEQAGAgICAgIHAAAAHZJSUlJAAAAXGJCQkIAAAA8QkJCPAAAAFxiYlxAQAAA' +
    'OkZGOgICAABcYkBAQAAAAD5APAJ8ABAQfBAQEgwAAABCQkJGOgAAAEJCQiQYAAAAQUlJSTYAAABCJBgkQgAAAEJCRjoC' +
    'PAAAfgQYIH4APCAgICAgPAAMEBA8EHBuADwEBAQEBDwAAAgcKggICAgAABAgfyAQAAAAAAAAAAAACAgICAAACAAkJCQA' +
    'AAAAACQkfiR+JCQACB4oHAo8CAAAYmQIECZGADBISDBKRDoABAgQAAAAAAAECBAQEAgEACAQCAgIECAACCocPhwqCAAA' +
    'CAg+CAgAAAAAAAAACAgQAAAAfgAAAAAAAAAAABgYAAACBAgQIEAAPEJGWmJCPAAIGCgICAg+ADxCAgwwQH4APEICHAJC' +
    'PAAEDBQkfgQEAH5AeAQCRDgAHCBAfEJCPAB+QgQIEBAQADxCQjxCQjwAPEJCPgIEOAAAAAgAAAgAAAAACAAACAgQDhgw' +
    'YDAYDgAAAH4AfgAAAHAYDAYMGHAAPEICDBAAEAAAAAAA/wAAABgkQn5CQkIAfCIiPCIifAAcIkBAQCIcAHgkIiIiJHgA' +
    'fkBAeEBAfgB+QEB4QEBAABwiQE5CIhwAQkJCfkJCQgAcCAgICAgcAA4EBAQERDgAQkRIcEhEQgBAQEBAQEB+AEJmWlpC' +
    'QkIAQmJSSkZCQgAYJEJCQiQYAHxCQnxAQEAAGCRCQkokGgB8QkJ8SERCADxCQDwCQjwAPggICAgICABCQkJCQkI8AEJC' +
    'QiQkGBgAQkJCWlpmQgBCQiQYJEJCACIiIhwICAgAfgIEGCBAfgAICAgI/wgICKBQoFCgUKBQCAgICAgICAjMzDMzzMwz' +
    'M8xmM5nMZjOZAAAAAAAAAADw8PDw8PDw8AAAAAD//////wAAAAAAAAAAAAAAAAAA/4CAgICAgICAqlWqVapVqlUBAQEB' +
    'AQEBAQAAAACqVapVmTNmzJkzZswDAwMDAwMDAwgICAgPCAgIAAAAAA8PDw8ICAgIDwAAAAAAAAD4CAgIAAAAAAAA//8A' +
    'AAAADwgICAgICAj/AAAAAAAAAP8ICAgICAgI+AgICMDAwMDAwMDA4ODg4ODg4OAHBwcHBwcHB///AAAAAAAA////AAAA' +
    'AAAAAAAAAP///wECREhQYEAAAAAAAPDw8PAPDw8PAAAAAAgICAj4AAAA8PDw8AAAAADw8PDwDw8PDw==',
  // Lowercase / uppercase, reversed
  lowerReversed:
    '4921qbPf4f///8f7w7vF/7+/o529naP////Dvb+9w//9/cW5vbnF////w72Bv8P/8+3vg+/v7////8W5ucX9w7+/o529' +
    'vb3/9//n9/f34//7//P7+/u7x7+/u7evl7v/5/f39/f34////4m2tra2////o529vb3////Dvb29w////6OdnaO/v///' +
    'xbm5xf39//+jnb+/v////8G/w/2D/+/vg+/v7fP///+9vb25xf///729vdvn////vra2tsn///+92+fbvf///729ucX9' +
    'w///gfvn34H/w9/f39/fw//z7+/D74+R/8P7+/v7+8P///fj1ff39/f//+/fgN/v////////////9/f39///9//b29v/' +
    '/////9vbgduB29v/9+HX4/XD9///nZv379m5/8+3t8+1u8X/+/fv///////79+/v7/f7/9/v9/f379//99XjwePV9///' +
    '9/fB9/f/////////9/fv////gf///////////+fn///9+/fv37//w725pZ29w//359f39/fB/8O9/fPPv4H/w7394/29' +
    'w//78+vbgfv7/4G/h/v9u8f/49+/g729w/+Bvfv37+/v/8O9vcO9vcP/w729wf37x/////f///f/////9///9/fv8efP' +
    'n8/n8f///4H/gf///4/n8/nz54//w7398+//7///////AP///+fbvYG9vb3/g93dw93dg//j3b+/v93j/4fb3d3d24f/' +
    'gb+/h7+/gf+Bv7+Hv7+//+Pdv7G93eP/vb29gb29vf/j9/f39/fj//H7+/v7u8f/vbu3j7e7vf+/v7+/v7+B/72ZpaW9' +
    'vb3/vZ2ttbm9vf/n2729vdvn/4O9vYO/v7//59u9vbXb5f+Dvb2Dt7u9/8O9v8P9vcP/wff39/f39/+9vb29vb3D/729' +
    'vdvb5+f/vb29paWZvf+9vdvn2729/93d3eP39/f/gf3759+/gf/39/f3APf391+vX69fr1+v9/f39/f39/czM8zMMzPM' +
    'zDOZzGYzmcxm//////////8PDw8PDw8PD/////8AAAAAAP//////////////////AH9/f39/f39/VapVqlWqVar+/v7+' +
    '/v7+/v////9VqlWqZsyZM2bMmTP8/Pz8/Pz8/Pf39/fw9/f3//////Dw8PD39/f38P////////8H9/f3////////AAD/' +
    '////8Pf39/f39/cA/////////wD39/f39/f3B/f39z8/Pz8/Pz8/Hx8fHx8fHx/4+Pj4+Pj4+AAA////////AAAA////' +
    '/////////wAAAP79u7evn7///////w8PDw/w8PDw//////f39/cH////Dw8PD/////8PDw8P8PDw8A==',
}

/**
 * A ROM font and the reversed block that follows it in memory. Seeding 256
 * characters from `upper` gives exactly what a real VIC shows with chargen base
 * `$8000`: codes 128–255 read `$8400`, the reversed block (D16a).
 */
const SETS: Record<RomCharsetName, readonly string[]> = {
  upper: [BLOCKS.upper, BLOCKS.upperReversed],
  lower: [BLOCKS.lower, BLOCKS.lowerReversed],
}

export const ROM_CHARSET_LABELS: Record<RomCharsetName, string> = {
  upper: 'Uppercase / graphics',
  lower: 'Lowercase / uppercase',
}

/** base64 → bytes, without assuming Node's Buffer or a DOM `atob` shim. */
function decodeBase64(base64: string): number[] {
  const binary = atob(base64)
  return Array.from({ length: binary.length }, (_, i) => binary.charCodeAt(i))
}

/** One block's 128 patterns of 8 bytes. */
function decodeBlock(base64: string): CharPattern[] {
  const bytes = decodeBase64(base64)
  return Array.from({ length: CHARS_PER_BLOCK }, (_, char) =>
    bytes.slice(char * ROM_CHAR_HEIGHT, (char + 1) * ROM_CHAR_HEIGHT),
  )
}

/**
 * `count` characters of ROM font `name`, as fresh mutable patterns: the first
 * 64 or 128 of the block, or the block followed by its reversed pair at 256
 * (D16a). The ROM is an 8×8 font, so every pattern is 8 bytes tall —
 * callers wanting 16-tall characters start blank instead (D16b).
 */
export function romCharset(name: RomCharsetName, count: number): Charset {
  const patterns = SETS[name].flatMap(decodeBlock)
  return patterns.slice(0, count).map((pattern) => [...pattern])
}
