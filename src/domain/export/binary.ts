/**
 * Raw byte output — the selected segments concatenated in order, either bare
 * (the interchange format other tools import) or behind the two-byte
 * little-endian load address that makes a file a Commodore `PRG` (PLAN.md D12).
 *
 * Labels are dropped; only the bytes remain.
 */

import type { ByteSegment } from './tables'

/** Concatenate all segment bytes into one `Uint8Array`. */
export function segmentsToBinary(segments: ByteSegment[]): Uint8Array {
  const total = segments.reduce((sum, seg) => sum + seg.bytes.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const seg of segments) {
    out.set(seg.bytes, offset)
    offset += seg.bytes.length
  }
  return out
}

/**
 * Where a PRG built from `segments` loads: the first segment's address. A PRG
 * is one contiguous block, so the rest follow it in file order whether or not
 * that is where they live on the machine — selecting a screen and its color
 * RAM together gets one file loading at the video matrix, and the loader in the
 * BASIC export is the way to place both.
 */
export function prgLoadAddress(segments: ByteSegment[]): number {
  return segments[0]?.loadAddress ?? 0
}

/** Prefix the concatenated bytes with a 2-byte little-endian load address. */
export function segmentsToPrg(
  segments: ByteSegment[],
  loadAddress: number = prgLoadAddress(segments),
): Uint8Array {
  const body = segmentsToBinary(segments)
  const out = new Uint8Array(body.length + 2)
  out[0] = loadAddress & 0xff
  out[1] = (loadAddress >> 8) & 0xff
  out.set(body, 2)
  return out
}
