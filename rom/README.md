# ROM source data

    rom/chargen.bin    4096 bytes, raw binary

The VIC-20 character generator ROM, revision **901460-03**. Present in this
folder, copied from a local VICE 3.10 install:

    /opt/homebrew/share/vice/VIC20/chargen-901460-03.bin

Build-time input only. `scripts/generate-charset.mjs` reads it and emits
`src/renderer/src/domain/romCharset.ts`; the binary is never imported by the app and never
reaches the bundle.

## Identity

|        |                                            |
|--------|--------------------------------------------|
| Size   | 4096 bytes                                 |
| MD5    | `d390e340e94e1bef0f2fdfe9fa850993`         |
| SHA-1  | `4fd85ab6647ee2ac7ba40f729323f2472d35b9b4` |

## Layout

Four 1 KB blocks, each 128 characters x 8 bytes, MSB = leftmost pixel:

| Offset          | Block                          |
|-----------------|--------------------------------|
| `$0000`–`$03FF` | Uppercase / graphics           |
| `$0400`–`$07FF` | Uppercase / graphics, reversed |
| `$0800`–`$0BFF` | Lowercase / uppercase          |
| `$0C00`–`$0FFF` | Lowercase / uppercase, reversed |

Characters are indexed by **screen code**, not PETSCII: code 0 is `@`, code 1
is `A`, code 30 is an up-arrow.

## Verification

`scripts/generate-charset.mjs` must refuse to emit unless all of these hold:

- Size is exactly 4096 bytes.
- Screen code 0 (`@`) at offset `$000` is `1C 22 4A 56 4C 20 1E 00`.
- Screen code 1 (`A`) at offset `$008` is `18 24 42 7E 42 42 42 00`.
- Block 2 is the exact bitwise complement of block 1, and block 4 of block 3.
- Block 3 is not identical to block 1.

### Do not use C64 glyph values here

The C64 chargen ROM is also 4096 bytes with this same four-block structure, so
a wrong-machine dump passes every structural check and renders plausible
glyphs. Only the byte fixtures catch it.

The two fonts differ in stroke weight — the VIC-20's is 1 pixel, the C64's is
2. Compare screen code 1:

    VIC-20  18 24 42 7E 42 42 42 00      C64  18 3C 66 7E 66 66 66 00
      ...##...                             ...##...
      ..#..#..                             ..####..
      .#....#.                             .##..##.
      .######.                             .#######
      .#....#.                             .##..##.
      .#....#.                             .##..##.
      .#....#.                             .##..##.
      ........                             ........

## Revisions

VICE also ships `chargen-901460-02.bin`. It is a genuine VIC-20 ROM but an
earlier revision, differing from `-03` in **1098 bytes** across the letter and
graphics glyphs — a visible difference, not a cosmetic one. This project
standardises on `-03`, the later revision and VICE's default. If the font ever
looks subtly wrong, check the MD5 above first.
