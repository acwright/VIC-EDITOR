# VIC-20 Character & Screen Editor — Conversion Plan

Converting the TMS9918 Character & Screen Editor (v1.4.1) into a **VIC-20 (MOS 6560/6561
"VIC-I") character and screen editor**, keeping the same shape of application: browser-based,
client-side, project-manager → editor, undo/redo, localStorage autosave, share links, and
multi-format export.

This document **replaces** the original TMS9918 plan. This is a fresh project folder seeded
with a copy of the TMS9918 source; nothing needs to be preserved for compatibility. There is
no migration path, no legacy file format to read, and no versioning obligation to the old app.

---

## Current Status

**Phase 11 (Keyboard, Responsive & Polish) — complete. Phase 10 (Shape Mode, optional) was
skipped and can still be cut; Phase 12 (README, Screenshot & Release) is next.**

The stack is unchanged from the seed (`tms9918-editor@1.4.1`): Vue 3.5 + TypeScript + Pinia +
Vue Router + Tailwind 4 + Vite 8, Vitest for tests, with the layering the conversion preserves:
`domain/` (pure logic, no Vue) → `persistence/` → `stores/` → `components/` + `views/`.

Phase 1 rebranded and stripped the app back to a compiling skeleton (package `vic20-editor`,
no sprites or TMS modes, `vic20-editor:*` storage keys, `.vic20.json` downloads, share param
`v`, `AnimationPanel` / `FrameStrip` parked in `src/components/parked/` for Phase 10).

Phase 2 replaced that skeleton's placeholder domain with the real one:

- The §4 model throughout — three project types, programmable geometry, per-cell color RAM,
  `charModes` in `mixed`, one `charset` of `charCount` patterns of `charHeight` bytes.
- The VIC's 16 colors with slot-aware ranges (`palette.ts`), color resolution per cell
  (`colors.ts`), and `vic.ts` owning the register block, memory map and geometry budget.
- `charOps` takes a `CellShape` (`{ width, height, bpp }`) rather than four positional
  arguments; `screenOps` operates on a `{ cells, colors }` pair and gained `resize`.
- Exhaustive schema validation, and screen exports that emit color RAM beside the name table.

It left the UI carried across mechanically: it still drew 8 × 8 hires characters, because
nothing in it could create any other kind of project. The charset export had lost its
now-meaningless global color byte, and the settings dialog read out the real settings; Phases
4–6 still rewrite those surfaces properly.

Phase 3 rebuilt the character half of the editor on that model:

- `PixelEditor.vue` takes a `CellShape` and pixel _values_ rather than booleans, so it draws
  8 × 8 and 8 × 16 hires cells and 4 × 8 and 4 × 16 multicolor ones — the latter double-wide in
  the same 8-pixel box the VIC gives them (D10).
- Left click paints the active color slot, right click the screen color, and left-clicking a
  pixel that already holds the active value clears it. `Fill` follows the brush too: in a
  multicolor cell the highest pixel value is the auxiliary color, no more "filled" than the
  other three.
- The active slot lives in the editor store, taken from the cell (two slots hires, four
  multicolor) and ordered by pixel value. Reverse mode makes the character color value `0`, so
  `domain/colors.ts` gained `cellSlots` as the single place that ordering is decided.
- `CharsetGrid` / `CharsetPicker` honor `charCount` — one grid per 128 characters, so a 64-char
  project shows one short grid — and badge every multicolor character in `mixed`.
- Transform buttons the cell shape forbids now say why in their tooltip rather than being
  silently dead.
- `mixed` projects get a per-character hires/multicolor toggle: an undoable command that leaves
  the pattern bytes alone, with the one-line explanation beside it (D2).

One change fell outside the phase's file list and is noted rather than hidden: the New Project
dialog now offers type, character height and character count, because nothing in the app could
otherwise create a multicolor, `mixed` or 16-tall project and the phase's work would have been
unreachable. Phase 8 still owns the rest of that form — the ROM charset seed.

Phase 4 made the color model the VIC's, and visible:

- The picker rail lists the slots the selected cell actually draws with, in pixel-value order,
  and mirrors the screen and border registers in beside them — in a multicolor cell those two
  _are_ drawing colors, and reaching them shouldn't mean opening a dialog.
- Which slot the swatches fill is now separate from which slot the brush paints (`targetSlot`
  vs `activeSlot` in the editor store). Targeting the border from a hires cell edits the
  register without pointing the brush at a pixel value the cell has no room for.
- All 16 colors stay on screen for every slot; the 8 a 3-bit field cannot hold are grayed,
  and both the swatch tooltip and a line under the palette say which register is refusing them
  and why (D5). `palette.ts` owns that sentence as `slotRangeNote`.
- The settings dialog gained the three global color registers and the reverse-mode toggle as
  editable, undoable controls (D6) — a `ColorSlotField` per register. The rest of that dialog
  is still a readout until Phase 6.
- Live re-render is checked rather than assumed: `liveRecolor.spec.ts` mounts the charset grid,
  the screen canvas and the pixel editor against a recording canvas context and asserts that a
  border, auxiliary or reverse change repaints all three.

Phase 5 made the screen half of the editor paint color RAM as well as characters:

- A **brush mode** — Character / Color / Both (D7) — decides which layer a stroke writes.
  `ScreenCanvas` no longer paints a character code; it paints the store's `brushPaint`, and the
  right button paints `erasePaint`, the same fields at their empty values. So a right-drag in
  Color mode resets color RAM without disturbing the characters under it, and the recolor
  pass VIC artists actually make is one mode away rather than impossible.
- Fill and clear follow the brush for the same reason, and say so: in Color mode the buttons
  read _Fill Screen with Selected Color_ and _Reset Every Cell to the Default Color_. The undo
  entry names what happened — `Recolor Cell`, `Paint Cell`, `Fill Colors` — rather than always
  claiming a character was placed.
- Geometry became editable, a phase before the settings dialog is rewritten around it, because
  "geometry changes resize every screen" is a Phase 5 promise. `setGeometry` re-fits **every**
  screen in one undoable command (D8), refuses anything the registers or the 512-cell color RAM
  cannot carry (D9), and the dialog's new Geometry section shows the budget live, blocks
  over-budget values, and confirms before a crop — quoting how many characters would be lost.
  The rest of that dialog is still Phase 6's.
- `ScreenCanvas.spec.ts` drives the canvas through real pointer events against a stubbed rect:
  all three brush modes, right-drag erase per mode, one undo entry per drag, and presses outside
  the grid ignored.

Phase 6 turned the settings dialog into the project's control panel:

- Every remaining register field is editable and undoable — char height and count, video
  standard, expansion, chargen base and video-matrix base — through one `executeSettingsChange`
  in the store, so they all undo the same way. Char height and char count reshape the charset
  too, so those are commands of their own: growing pads (blank rows, blank glyphs), shrinking
  truncates, and `charHeightLoss` / `charCountLoss` say what a shrink would cost before it
  happens. All three destructive changes — geometry crop, shorter character, smaller set — go
  through one confirmation dialog that quotes the number of characters at stake.
- Shrinking the character set deliberately leaves screens alone: a screen code is a full byte
  whatever the set holds (D4), so the glyphs disappear from the picker rather than being
  rewritten out of the screens that use them.
- Memory is a section rather than a readout: the expansion preset, all sixteen chargen blocks
  with their addresses (the four that land in I/O disabled, since a character set cannot live
  there), the sixteen 512-byte-granular RAM screen bases each labeled with the color RAM it
  implies, and the derived color-RAM address. Changing the expansion moves _nothing_ on its own
  — the conventional layout for the fitted expansion appears as an offer with a `Use Preset`
  button, which is also how a hand-placed base announces itself as unconventional.
- `RegisterReadout.vue` is the `$9000–$900F` block (D14): sixteen bytes in hex, each explaining
  its fields on hover, copyable as an addressed dump. The unmodeled registers are shown at zero
  rather than hidden, so it can be matched against a monitor dump byte for byte.
- The display origins stay derived from the video standard and are shown, not typed: §4's schema
  has no origin fields, and the phase's bar is "every register the model covers". Making them
  editable is a schema change, and belongs with whatever needs it.
- 29 test specs, 395 tests; `type-check`, `lint`, `test:unit` and `build` all pass.

Phase 7 made the export layer emit things that assemble, run, or load:

- Every segment now carries the **address it belongs at** — charset at the chargen base, screen
  at the video matrix, color RAM at the $9400/$9600 the matrix A9 bit implies, registers at
  $9000. That one field is what lets PRG fill its header and the BASIC loader poke each block
  home, so it is required rather than optional: a segment with no address is a segment nothing
  can place.
- Assembly gained ACME (`!byte`) and DASM (`dc.b`) beside ca65/64tass (`.byte`), differing in
  nothing but the directive and the extension the toolchain expects (D12). The chosen dialect is
  remembered alongside the label case.
- **BASIC is a real Commodore BASIC 2.0 program, not a DATA dump** (D13). Lines are held to 80
  characters — a whole logical row (one glyph, one screen row) per line while it fits, packed
  greedily when it does not, and `REM` text clipped rather than allowed to overflow, since a long
  project name was the one input with no natural length bound. The optional loader `READ`s each
  segment straight into its own address and pokes the registers **last**, so $9005 is never
  pointed at a chargen block that has not been filled yet. All text is folded to what a PETSCII
  keyboard can type. `basicProgramBytes` reports the tokenised size beside the preview, because
  2 KB of charset `DATA` does not fit in the 3583 bytes an unexpanded VIC has free.
- **PRG** prefixes the bytes with the 2-byte little-endian load address of the first selected
  segment (D12); **Binary** is unchanged. PNG now offers every scale 1×–8×.
- The dialog offers each scope's segments as checkboxes, tracking the ones switched _off_ so a
  screen added while the dialog is open arrives selected. `vic_registers` is offered in both
  scopes and starts unticked — it is an extra, not part of what the scope names.
- **Tests:** whole-file fixtures for ca65 and for both BASIC shapes, the directive and extension
  of all three dialects, the PRG header, color-RAM packing including the multicolor bit, and the
  line-length invariant driven with worst-case input (all-$FF data, five-digit line numbers, a
  74-character title).
- 29 test specs, 426 tests; `type-check`, `lint`, `test:unit` and `build` all pass.

Phase 8 gave a new project something to draw with, and the sample list something to show:

- `scripts/generate-charset.mjs` reads `rom/chargen.bin`, runs every check in `rom/README.md` —
  size, both hashes, the `@` and `A` byte fixtures, and the complement relationship between each
  normal block and its reversed pair — and **refuses to emit** on any mismatch. Verified against
  a truncated dump, a missing file, and a C64-shaped one: 4096 bytes with the same four-block
  structure, which passes every structural test and is caught only by the glyph fixtures (D16c).
  It emits `src/domain/romCharset.ts`, the four 1 KB blocks as base64 with a decoder; the binary
  never reaches the bundle.
- `createProject` takes a **seed** — ROM uppercase, ROM lowercase, or blank — and the New Project
  dialog offers it. At 256 characters the seed is the chosen block followed by its reversed pair,
  because that is what a real VIC reads at chargen base `$8000` (D16a). At `charHeight: 16` the
  ROM options are disabled with the reason on them, and the store-side fallback is blank rather
  than a stretched font (D16b).
- **The empty screen cell is now the space, not code 0.** This falls out of the seed and is not
  hidden: with a ROM charset, code 0 draws `@`, so a "blank" 22 × 23 screen would have been 506 of
  them — and a screen _export_ full of `$00` pokes them onto real hardware too. `EMPTY_CELL` in
  `screenOps` is the one place that says so; clear, erase, resize-pad and rotate-drop all follow
  it, and the existing specs that were written against a blank charset now ask for one explicitly.
- `samples/font.ts` is gone — its 5 × 7 ASCII font existed only to fake a character set — and
  `samples/paint.ts` replaces it with the authoring verbs the four new samples are written in:
  screen codes (not PETSCII), hires and multicolor pattern literals, and a painter that writes a
  character and its color RAM value together.
- Four samples, each naming the feature it exists to show: **Title Screen** (hires, ROM font,
  per-cell color RAM), **Night Landscape** (multicolor, all four slots, mountains drawn in the
  border color so the silhouette and the screen edge change together), **Dungeon** (mixed —
  multicolor tiles under hires text, mode chosen per character), and **Wide Screen** (28 × 16).
- **Tests:** the ROM module re-asserts the VIC/C64 glyph difference against the file that ships;
  every sample is checked for schema validity, in-bounds codes, that it draws every character it
  places, a byte-identical serialization round trip, and a clean export in all three assembly
  dialects plus BASIC, binary and PRG.
- 31 test specs, 473 tests; `type-check`, `lint`, `test:unit` and `build` all pass.

Phase 9 made everything around the editor speak VIC — and measured the one claim in it that
turned out to be false:

- **The project summary carries geometry and character height**, not just the type, because on
  the VIC those are settings rather than consequences of the mode (D3, D8): a `hires` badge alone
  no longer says whether a project is 22 × 23 of 8 × 8 or 28 × 16 of 8 × 16. The manager rows show
  `22×23`, with `8×16` beside it only when the characters are the tall ones, and the full
  sentence on hover.
- Index entries written by an earlier build lack those fields. They are **rebuilt from the
  project rather than dropped** — the guard that discards unrecognized entries once hid every
  saved project of a type it had not heard of, and a stricter summary would have repeated that
  bug with geometry. `list` heals the stored index in place, so the rebuild happens once.
- **A TMS9918 file now says so.** Both apps write `version: 1`, so an upload from the editor this
  one was seeded from used to be reported as "settings must be an object". `tms9918Signature`
  recognizes the shapes that only it produces — a `charsets` list, sprite animations, a
  project-level color table, a mode name that never existed on the VIC — and names the app, the
  giveaway and the `.vic20.json` extension instead (D17). It runs before every other check, and
  the one mode name both chips share (`multicolor`) is identified by shape, not by name.
- **The share-link size check failed, and the threshold was the thing that was wrong.** Measured:
  a default 22 × 23 project with the 256-character ROM set is a **2.5 KB** link, **3.2 KB** with
  every cell drawn, and 3.3 KB with four screens — all far past the seed project's 2 KB warning.
  That figure is the IE-era whole-URL limit, and since Phase 8 every new project carries a 2 KB
  character set, so it would have flagged **every project this editor can produce**. It is now
  8 KB — the request-line limit the rest of the tooling ecosystem is built around — which a
  four-screen project at the widest legal geometry still clears. What exceeds it is
  incompressible data at volume (256 sixteen-row characters of noise across several screens), and
  that is reported as a long link rather than a refused one. The length is shown either way.
- Downloads were already `<name>.vic20.json` (D17) and the storage keys were already renamed
  (D18); Phase 9 verified both rather than rewriting them.
- **Tests:** the phase's bar — save → reload → share → import — is checked as byte-identical
  serialization at each step, on a project with something in every field a round trip could lose
  (16-row patterns, per-character modes, two screens, non-default geometry and colors). Beside
  it: the summary's new fields and their repair path, each TMS9918 signature separately plus a
  guard that a valid VIC project is never caught by it, and the three link-length cases above.
- 31 test specs, 494 tests; `type-check`, `lint`, `test:unit` and `build` all pass.

Phase 11 made the app usable without a mouse, and made its refusals speak:

- **One shortcut map, in `utils/shortcuts.ts`.** The keys were spread across two views' key
  handlers and a dozen hard-coded tooltip strings, which is three places to disagree. Now the
  keys are declared once, the views dispatch on the *action*, and their handler tables are
  `Record<EditorAction, …>` / `Record<ManagerAction, …>` — so a shortcut added to the map
  without a handler is a type error rather than a dead key. Every button's tooltip takes its
  key from the same map, `Mod` renders as `⌘` or `Ctrl` per platform, and `shortcuts.spec.ts`
  holds the README table to the list as well.
- **A help dialog on `?`**, and on a button in both headers — on a tablet, the key that opens
  the shortcut list is the one key there is no way to press. It renders `shortcutSections()`
  rather than a copy of it, and carries what the pointer does too, since the right button's
  meaning changes with the brush mode.
- **Color slot targeting joined the map** (`4`–`7`), the one control in §6 that had no key:
  the brush modes already owned `1`–`3`, so the slots continue the digit row.
- **The canvases take focus and draw from the keyboard.** The screen canvas, the pixel grid and
  each charset block are `tabindex="0"` controls: arrows move a cursor, `Enter`/`Space` paints,
  `Backspace`/`Delete` erases, `Home`/`End` walk the row, `Esc` dismisses the cursor. Each press
  is its own undo entry, and the cell under the cursor is announced through an `aria-live`
  region — pointer hover deliberately does not feed it, since that would announce every cell a
  drag crosses. The keys a canvas consumes are stopped there, so a bare arrow means "move this
  cursor" only while that canvas holds focus and the window-level map never sees it.
- **Disabled controls say why.** `AppButton` gained `disabledReason`, which joins the accessible
  name (and rides along as a `title`, because browsers suppress hover events over a disabled
  control and the tooltip with them). Zoom at its limits, undo with nothing to undo, the first
  and last screen, the last screen that cannot be deleted, an export with nothing ticked, a
  rename with an empty name, and a resize the color RAM refuses now all explain themselves
  rather than reading as bugs. Invert is the one control hidden instead: it sits in a group
  that closes up cleanly, and "a multicolor cell has no complement" is a property of the
  project rather than a state the user can clear.
- **Empty and error states:** a project that arrives with no screens offers one instead of
  showing an empty box; a failed save is a banner in the editor with `Save Now` beside it, not
  just a header stuck on "Unsaved" — autosave is the only writer while the editor is open, so
  a full quota had no surface there at all. Over-budget geometry was already refused with its
  reason (Phase 5) and is left as it was.
- **Three standing explanations became `?` hints** (`AppHint`), which is where the space for
  the character set came from. The brush hint under the screen's mode selector said exactly what
  the three buttons' own tooltips say, so it is simply gone; the mixed-mode sentence (D2) sits on
  a marker beside `Renders as`, and the color-range sentence (D5) on one beside a new `Colors`
  heading — a hint next to the slot rail itself narrowed the chips, and the rail is worth more
  than the sentence. Each shows on hover, on focus, and as a `title`, and the hint's accessible
  name *is* the sentence, so a screen reader gets the text rather than an unexplained "help".
  The settings dialog keeps its prose: a modal has room, and nothing competes with it there.
- **The character-set picker got layouts, and a floor.** It was `flex-1 min-h-0` under a
  character panel that never shrinks, so on a 760px window it was crushed to **16 px** —
  the collapse looked like a rendering fault rather than a lack of room. It now has a
  minimum height and the column around it scrolls, and the layout is a choice: blocks as
  before, a scrolling grid of eight a row at a readable fixed size, or a list carrying each
  character's code, rendering and blank/drawn state. `CharsetGrid` grew a `fit` prop for the
  second (width-driven instead of height-driven, same canvas and the same pointer and key
  handling); the list is a listbox with one roving tab stop, and both keep the selection
  scrolled into view however it moved — including from `[` and `]`.
- **Two rows came out of the left column**, which is where the character set's extra height
  came from: the three standing explanations above, and the fill/clear/invert group, which
  moved into the panel header next to the character stepper. The header still fits inside the
  pixel editor's own width at every cell shape, so it never widens the column.
- **The project's spelling is US English** — `color`, not `colour`, in strings, identifiers,
  comments and this document alike. It had drifted to British prose over the earlier phases while
  the identifiers stayed American, which put both spellings in the same file.
- **The responsive collapse was re-verified rather than assumed**: the two-column → two-tab
  switch is now a real `tablist`, both canvases are driven through touch-typed pointer events in
  the tests, and the project-manager row still splits onto a second line below `sm`.
- **Tests:** the map itself (modifier matching, the punctuation keys whose `event.key` already
  carries Shift, per-scope key uniqueness, both platforms' labels, and the README rows), the
  editor view's dispatch into the store, cursor mode on all three canvases including the
  `defaultPrevented` boundary with the global map, touch strokes, the disabled reasons, the
  no-screens state and the quota banner.
- 33 test specs, 548 tests; `type-check`, `lint`, `test:unit` and `build` all pass.

---

## 1. Product Summary

A browser-based tool for designing **VIC-20 character sets and screens**.

Draw 8×8 (or 8×16) character patterns in either **hires** (1 bit per pixel) or **multicolor**
(2 bits per pixel, double-wide pixels) form, color them with the VIC's 16-color palette under
the chip's real constraints, lay them out on a screen of programmable size, and export the
result as 6502 assembly, Commodore BASIC `DATA` (with an optional POKE loader), a `.prg`, raw
binary, or PNG.

Everything runs client-side. Projects live in `localStorage`, download as JSON, and share as a
single self-contained URL.

### What carries over from the TMS9918 editor

| Kept                                            | Note                                           |
| ----------------------------------------------- | ---------------------------------------------- |
| App shell, routing, project manager             | Rebrand only                                   |
| Undo/redo command layer (`domain/commands.ts`)  | Unchanged                                      |
| Pixel-editor interaction model                  | Extended to variable width/height/bit-depth    |
| Charset picker / grid                           | Extended to variable char count and cell shape |
| Screen painting model                           | Extended with a per-cell color brush          |
| Export dialog structure, label casing, byte box | Formats and segments change                    |
| Share links, persistence, preferences           | Key names change                               |
| Base components (`AppButton`, `AppDialog`, …)   | Unchanged                                      |

### What is deleted

| Removed                                                                                                                                  | Why                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Sprite mode (`domain/sprites.ts`, `spriteOps.ts`, `utils/spriteRender.ts`, `SpritePanel`, `SpriteGrid`, `SpritePicker`, `SpritePreview`) | **The VIC-20 has no sprite hardware.** Phase 10 optionally repurposes the animation UI for character-composed "shapes".          |
| TMS multicolor (`domain/multicolor.ts`)                                                                                                  | The TMS 64×48 chunky-block mode has no VIC equivalent. The word "multicolor" is reused for a _completely different_ VIC feature. |
| Graphics Mode I / II color models (`Graphics1Colors`, `Graphics2Colors`, `colors.ts:resolveRowColors`)                                  | Replaced by per-cell color RAM.                                                                                                 |
| Z80 assembly export                                                                                                                      | The VIC-20 is 6502-only.                                                                                                         |
| `domain/ca65.ts`                                                                                                                         | Folded into the export layer.                                                                                                    |

---

## 2. VIC-20 Hardware Reference

Everything the domain layer must encode. Register addresses are the CPU-visible VIC block at
`$9000–$900F`.

### 2.1 Palette (16 colors, no transparency)

The VIC has **no transparent color** — a major difference from the TMS9918, where index 0 was
transparent. Every pixel resolves to one of these.

| #   | Name         | Hex       | fg (color RAM) | Border | Screen | Auxiliary |
| --- | ------------ | --------- | :-------------: | :----: | :----: | :-------: |
| 0   | Black        | `#000000` |       ✅        |   ✅   |   ✅   |    ✅     |
| 1   | White        | `#FFFFFF` |       ✅        |   ✅   |   ✅   |    ✅     |
| 2   | Red          | `#782922` |       ✅        |   ✅   |   ✅   |    ✅     |
| 3   | Cyan         | `#87D6DD` |       ✅        |   ✅   |   ✅   |    ✅     |
| 4   | Purple       | `#AA5FB6` |       ✅        |   ✅   |   ✅   |    ✅     |
| 5   | Green        | `#55A049` |       ✅        |   ✅   |   ✅   |    ✅     |
| 6   | Blue         | `#40318D` |       ✅        |   ✅   |   ✅   |    ✅     |
| 7   | Yellow       | `#BFCE72` |       ✅        |   ✅   |   ✅   |    ✅     |
| 8   | Orange       | `#AA7449` |       ❌        |   ❌   |   ✅   |    ✅     |
| 9   | Light Orange | `#EAB489` |       ❌        |   ❌   |   ✅   |    ✅     |
| 10  | Light Red    | `#B86962` |       ❌        |   ❌   |   ✅   |    ✅     |
| 11  | Light Cyan   | `#C7FFFF` |       ❌        |   ❌   |   ✅   |    ✅     |
| 12  | Light Purple | `#EA9FF6` |       ❌        |   ❌   |   ✅   |    ✅     |
| 13  | Light Green  | `#94E089` |       ❌        |   ❌   |   ✅   |    ✅     |
| 14  | Light Blue   | `#8080FF` |       ❌        |   ❌   |   ✅   |    ✅     |
| 15  | Light Yellow | `#FFFFC0` |       ❌        |   ❌   |   ✅   |    ✅     |

**The constraint that shapes the UI:** character color and border color are **3-bit fields** —
only colors 0–7. Screen (background) and auxiliary color are **4-bit fields** — all 16. The
color picker must know which slot it is targeting and disable 8–15 accordingly.

Hex values are VICE's default `vic20` palette. They are a rendering choice, not hardware truth
(real output varies by TV and revision); keep them in one table so they can be swapped.

### 2.2 Cell rendering

**Hires cell** — color RAM bit 3 clear. 8 pixels wide, 8 or 16 tall, 1 bit per pixel:

| Bit | Color                             |
| --- | ---------------------------------- |
| `0` | Screen color (`$900F` bits 4–7)   |
| `1` | This cell's color RAM value (0–7) |

**Multicolor cell** — color RAM bit 3 set. **4 pixels wide** (each double-width, so the cell
still occupies 8 screen pixels), 8 or 16 tall, 2 bits per pixel:

| Bits | Color                               |
| ---- | ------------------------------------ |
| `00` | Screen color (`$900F` bits 4–7)     |
| `01` | **Border** color (`$900F` bits 0–2) |
| `10` | This cell's color RAM value (0–7)   |
| `11` | Auxiliary color (`$900E` bits 4–7)  |

That `01` = border is the VIC's signature quirk: the border color does double duty as a screen
color, so changing the border recolors every multicolor cell. The editor must show this live.

**Reverse mode** (`$900F` bit 3) globally swaps 0↔1 in _hires_ cells. Multicolor cells are
unaffected. Note the polarity: the bit is **set for normal** display and **clear for reverse** —
easy to invert by accident, so `domain/vic.ts` owns the conversion and nothing else touches it.

### 2.3 Screen geometry (programmable)

Unlike the TMS9918's fixed grids, VIC screen size is set by registers:

| Field             | Register         | Range                      | Default              |
| ----------------- | ---------------- | -------------------------- | -------------------- |
| Columns           | `$9002` bits 0–6 | 0–127 (only ≤ 31 displays) | 22                   |
| Rows              | `$9003` bits 1–6 | 0–63 (raster-limited)      | 23                   |
| Char height       | `$9003` bit 0    | 0 = 8×8, 1 = 8×16          | 8×8                  |
| Horizontal origin | `$9000` bits 0–6 | 0–127                      | 5 (NTSC) / 12 (PAL)  |
| Vertical origin   | `$9001`          | 0–255                      | 25 (NTSC) / 38 (PAL) |

**The hard limit is 512 cells.** Color RAM is 512 nybbles, and the video matrix base is only
512-byte granular (`$9005` bits 4–7 give A13–A10, `$9002` bit 7 gives A9). The default 22×23 =
506 cells sits just under it.

### 2.4 Memory layout

Color RAM is at **`$9400`** or **`$9600`**, selected by `$9002` bit 7 — the same bit that is
video-matrix A9. It is _not_ freely placeable.

Character generator base — `$9005` bits 0–3:

| Value | Address                      | Value | Address |
| ----- | ---------------------------- | ----- | ------- |
| 0     | `$8000` (uppercase ROM)      | 8     | `$0000` |
| 1     | `$8400` (uppercase reversed) | 9     | `$0400` |
| 2     | `$8800` (lowercase ROM)      | 10    | `$0800` |
| 3     | `$8C00` (lowercase reversed) | 11    | `$0C00` |
| 4     | `$9000`                      | 12    | `$1000` |
| 5     | `$9400`                      | 13    | `$1400` |
| 6     | `$9800`                      | 14    | `$1800` |
| 7     | `$9C00`                      | 15    | `$1C00` |

Because the base is 1 KB granular, a practical custom charset is **64 chars (512 B), 128 chars
(1 KB), or 256 chars (2 KB)** — 4 KB at 8×16.

Memory expansion determines where things sensibly live:

| Expansion        | BASIC start | Screen  | Color RAM | Typical custom charset |
| ---------------- | ----------- | ------- | ---------- | ---------------------- |
| Unexpanded (5 K) | `$1001`     | `$1E00` | `$9600`    | `$1C00` (val 15)       |
| +3 K             | `$0401`     | `$1E00` | `$9600`    | `$1C00`                |
| +8 K and above   | `$1201`     | `$1000` | `$9400`    | `$1400` (val 13)       |

### 2.5 Register block

The editor's configuration maps exactly onto sixteen bytes, which is worth exporting verbatim:

| Addr            | Contents                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| `$9000`         | bit 7 interlace (NTSC), bits 0–6 horizontal origin                             |
| `$9001`         | vertical origin                                                                |
| `$9002`         | bit 7 video-matrix A9 / color-RAM select, bits 0–6 columns                    |
| `$9003`         | bits 1–6 rows, bit 0 8×16 char mode (bit 7 is raster, read-only)               |
| `$9004`         | raster (read-only)                                                             |
| `$9005`         | bits 4–7 video matrix A13–A10, bits 0–3 chargen A13–A10                        |
| `$9006`–`$900D` | light pen, paddles, sound (not modeled)                                       |
| `$900E`         | bits 4–7 auxiliary color, bits 0–3 volume                                     |
| `$900F`         | bits 4–7 screen color, bit 3 **normal**(1)/reverse(0), bits 0–2 border color |

### 2.6 NTSC vs PAL

Affects default origins, the practical maximum row count (PAL allows more), and pixel aspect
ratio. Modeled as a project setting driving defaults and a preview note; **aspect-corrected
rendering is deferred** (§12).

---

## 3. Confirmed Design Decisions

Numbered for reference from phase notes and code comments.

**D1 — Three project types: `hires`, `multicolor`, `mixed`.**
`hires` and `multicolor` lock every cell to one rendering. `mixed` allows both on one screen,
which is what real VIC screens do.

**D2 — In `mixed`, the multicolor flag belongs to the _character_, not the cell.**
The project stores `charModes: boolean[]` (one per character). A screen cell's color-RAM bit 3
is derived from the character it holds. Hardware technically allows the same character code to
render both ways in different cells; the editor deliberately does not, because a character
drawn as 4-wide multicolor is meaningless when read as 8-wide hires. The exporter still emits
the bit _per cell_, so output is hardware-correct.

**D3 — Char height (8 or 16) is a project setting, not a project type.** It is one register bit
and it applies to all three types.

**D4 — Char count is a project setting: 64, 128, or 256 (default 256).** It bounds the charset
grid and the exported pattern-table size. Screen codes remain full bytes; the picker only shows
what exists.

**D5 — No transparent color.** The palette is a flat 16. Slot-aware disabling (0–7 vs 0–15)
replaces the TMS9918's transparency handling everywhere. A refused swatch still owes the user a
reason; since Phase 11 that reason is the swatch's own tooltip plus a `?` beside the slot rail,
rather than a standing line under the palette — the line cost a row of the character set on
every screen to say something read once.

**D6 — Screen color, border color, auxiliary color and reverse mode are project-level**, not
per-screen. They map to two registers that cannot vary per screen anyway.

**D7 — Per-cell foreground color lives in the screen document**, alongside the character code:
`Screen { cells: number[], colors: number[] }`. This is the VIC's color RAM. It replaces the
TMS9918's per-group / per-row color tables entirely.

**D8 — Screen geometry is per project, not per screen.** Columns and rows are registers; two
screens in one project share them. Changing geometry resizes existing screens (crop/pad from
top-left), which is destructive and confirmed via dialog.

**D9 — Geometry limits: columns 1–31, rows 1–32, and `columns × rows ≤ 512`.**
The registers allow more; the display and color RAM do not. The editor blocks over-512 and
warns above 22 columns / 23 rows that the configuration is non-default.

**D10 — Multicolor pixel editing is 4 wide, drawn at 2× horizontal scale**, so the cell always
occupies the same on-screen width as a hires cell. The pixel editor takes a bit-depth, not a
fixed 1bpp assumption.

**D11 — Sprite mode is removed outright.** Phase 10 optionally introduces **Shape mode**: a
rectangular block of characters (e.g. 2×2, 3×3) treated as one movable object, with frame
animation — the software-sprite technique VIC-20 games actually use. It reuses `AnimationPanel`
and `FrameStrip`. It ships only after Phases 1–9 are done and can be dropped without affecting
anything else.

**D12 — Export drops Z80 and adds ACME, plus PRG and color-RAM output.** Assembly dialects:
ca65/64tass (`.byte`), ACME (`!byte`), DASM (`dc.b`).

**D13 — BASIC export targets Commodore BASIC 2.0**, with an 80-character line budget (the
88-character input limit less headroom) and an optional generated POKE loader that sets the VIC
registers and copies the charset into RAM.

**D14 — A "VIC registers" export segment** emits the sixteen configured register bytes, and the
settings dialog shows them live. This is the feature that makes the tool feel VIC-specific.

**D15 — New projects seed from the VIC-20 ROM character set**, not a blank charset, with a
"start blank" option. Both the uppercase/graphics and lowercase/uppercase sets are offered.

**D16 — ROM charset data comes from a real dump, supplied as build-time input.**
`rom/chargen.bin` (4096 bytes, raw) is the `901460-03` character ROM, already in place from a
local VICE 3.10 install and verified (MD5 `d390e340e94e1bef0f2fdfe9fa850993`). A generator
script revalidates it and emits `src/domain/romCharset.ts`; the binary is never imported by the
app. Glyphs are therefore byte-exact, not approximated. See `rom/README.md` for the contract.

**D16c — The project standardizes on revision `-03`.** VICE also ships `901460-02`, a genuine
but earlier VIC-20 ROM differing in 1098 bytes across the letter and graphics glyphs. The
generator pins the `-03` hash so a revision swap cannot happen silently.

**D16a — The 256-character seed is the normal set followed by its reversed block.**
That is not a convenience choice — it is what the hardware does. With chargen base `$8000` and
a 256-character screen, codes 128–255 read `$8400`–`$87FF`, the reversed block. So the ROM
supplies every `charCount` option exactly:

| `charCount` | Seeded from                           |
| ----------- | ------------------------------------- |
| 64          | First 64 characters of the chosen set |
| 128         | The chosen set (one 1 KB block)       |
| 256         | The chosen set + its reversed block   |

**D16b — The ROM seed is offered for 8×8 projects only.** The ROM is an 8×8 font; there is no
defensible automatic promotion to 8×16. Projects with `charHeight: 16` start blank.

**D17 — File extension `.vic20.json`, schema `version: 1`.** No migration from TMS9918 files;
loading one fails validation with a clear message.

**D18 — Storage keys are renamed** (`vic20-editor:projects`, `vic20-editor:prefs`). A TMS9918
editor served from the same origin keeps its data untouched.

---

## 4. Data Model

```ts
type ProjectType = 'hires' | 'multicolor' | 'mixed'
type CharHeight = 8 | 16
type CharCount = 64 | 128 | 256
type VideoStandard = 'ntsc' | 'pal'
type ColorIndex = number // 0–15

interface ProjectSettings {
  /** Screen geometry in cells (D8, D9). */
  columns: number // 1–31, default 22
  rows: number // 1–32, default 23
  charHeight: CharHeight // D3
  charCount: CharCount // D4
  video: VideoStandard

  /** Global colors (D6). */
  screenColor: ColorIndex // 0–15  → $900F bits 4–7
  borderColor: ColorIndex // 0–7   → $900F bits 0–2
  auxColor: ColorIndex // 0–15  → $900E bits 4–7
  reverse: boolean //       → $900F bit 3

  /** Memory layout — drives the loader and the register block. */
  expansion: 'none' | '3k' | '8k' | '16k' | '24k'
  charBase: number // $9005 bits 0–3, 0–15
  screenBase: number // derived-but-overridable video matrix address
}

interface Screen {
  name: string
  /** Character codes, row-major, length = columns × rows. */
  cells: number[]
  /** Color RAM values 0–7, row-major, same length (D7). */
  colors: number[]
}

interface Project {
  version: 1
  id: string
  name: string
  type: ProjectType
  createdAt: string
  modifiedAt: string
  settings: ProjectSettings
  /** One charset. Each pattern is `charHeight` bytes (8 or 16). */
  charset: number[][]
  /** `mixed` only: per-character multicolor flag (D2). Length = charCount. */
  charModes?: boolean[]
  screens: Screen[]
  /** Phase 10 only. */
  shapes?: Shape[]
}
```

Note `charset` is singular — the TMS9918's `charsets: Charset[]` array existed only for
Graphics II's three independent sets, which has no VIC equivalent. Collapsing it removes
`charsetIndex` threading from roughly a dozen call sites.

---

## 5. File Disposition

| Path                                                         | Action                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `src/domain/palette.ts`                                      | **Rewrite** — 16 VIC colors, slot ranges, no transparency              |
| `src/domain/modes.ts`                                        | **Rewrite** — three types, geometry from settings not constants         |
| `src/domain/types.ts`                                        | **Rewrite** — §4 model                                                  |
| `src/domain/factory.ts`                                      | **Rewrite** — VIC defaults, ROM charset seed                            |
| `src/domain/serialization.ts`                                | **Rewrite** — validate the new schema                                   |
| `src/domain/colors.ts`                                       | **Rewrite** — resolve a cell's 2 or 4 color slots                      |
| `src/domain/charOps.ts`                                      | **Extend** — width/height/bit-depth aware                               |
| `src/domain/screenOps.ts`                                    | **Extend** — operate on cells _and_ colors together                    |
| `src/domain/screenStatus.ts`                                 | **Extend** — report color RAM value and cell mode                      |
| `src/domain/bytes.ts`                                        | **Keep**, expected-length becomes `charHeight`                          |
| `src/domain/commands.ts`                                     | **Keep** unchanged                                                      |
| `src/domain/share.ts`                                        | **Keep**, rename payload/param constants                                |
| `src/domain/export/tables.ts`                                | **Rewrite** — pattern / screen / color / register segments             |
| `src/domain/export/assembly.ts`                              | **Extend** — 6502 dialects, drop Z80                                    |
| `src/domain/export/basic.ts`                                 | **Extend** — CBM line budget, POKE loader                               |
| `src/domain/export/binary.ts`                                | **Extend** — PRG load-address header                                    |
| `src/domain/export/labels.ts`                                | **Keep** unchanged                                                      |
| `src/domain/vic.ts`                                          | **New** — register encode/decode, memory map                            |
| `src/domain/multicolor.ts`                                   | **Delete**                                                              |
| `src/domain/sprites.ts`, `spriteOps.ts`, `ca65.ts`           | **Delete**                                                              |
| `src/utils/screenRender.ts`                                  | **Rewrite** — VIC cell rendering                                        |
| `src/utils/spriteRender.ts`                                  | **Delete** (Phase 10 may add `shapeRender.ts`)                          |
| `src/utils/download.ts`, `platform.ts`                       | **Keep**                                                                |
| `src/stores/editor.ts`                                       | **Heavy edit** — drop sprite state, add color brush                    |
| `src/stores/projects.ts`                                     | **Light edit** — key names, type list                                   |
| `src/persistence/*`                                          | **Light edit** — key names                                              |
| `src/components/editor/PixelEditor.vue`                      | **Rewrite** — variable geometry and bit depth                           |
| `src/components/editor/ColorPicker.vue`                      | **Rewrite** — 16 swatches, slot targeting                               |
| `src/components/editor/ColorSlotField.vue`                   | **New** (Phase 4) — one global color register, for the settings dialog |
| `src/components/editor/ScreenPanel.vue`, `ScreenCanvas.vue`  | **Heavy edit** — dual brush                                             |
| `src/components/editor/CharsetGrid.vue`, `CharsetPicker.vue` | **Edit** — variable count/shape                                         |
| `src/components/editor/ProjectSettingsDialog.vue`            | **Rewrite** — geometry, memory, registers                               |
| `src/components/editor/ExportDialog.vue`                     | **Heavy edit** — new formats and scopes                                 |
| `src/components/editor/MulticolorPanel.vue`                  | **Delete**                                                              |
| `src/components/editor/Sprite*.vue`, `WallpaperPreview.vue`  | **Delete**                                                              |
| `src/components/editor/AnimationPanel.vue`, `FrameStrip.vue` | **Park** — Phase 10 or delete                                           |
| `src/components/base/*`                                      | **Keep** unchanged                                                      |
| `src/samples/font.ts`                                        | **Delete** — superseded by the ROM charset                              |
| `src/samples/index.ts`                                       | **Rewrite** — VIC samples                                               |
| `src/domain/romCharset.ts`                                   | **New, generated** from `rom/chargen.bin`                               |
| `src/domain/__tests__/*`                                     | Rewrite alongside their subjects                                        |

---

## 6. UI Layout

Two columns at `lg` and above, two tabs below — same as today.

**Left column — Character**

- Pixel editor: 8×8 / 8×16 hires, or 4×8 / 4×16 multicolor drawn at 2× horizontal scale.
- Transforms frame the grid: shift ×4, flip ×2, rotate ×2 (rotate disabled for non-square
  cells — 8×16 and all multicolor). Fill, clear and invert act on the whole character, so
  since Phase 11 they sit in the panel header beside the character stepper rather than in a
  row of their own — the row they cost was a band of the character set. Invert is hidden
  outright in a multicolor cell rather than greyed: the group closes up, and the rotations
  cannot do the same without leaving a hole in the frame around the grid.
- In `mixed`: a hires/multicolor toggle for the selected character (D2).
- Color picker: 16 swatches. Which slots are selectable depends on the cell mode —
  hires offers screen + character color; multicolor offers all four (screen, border, character,
  auxiliary), with 8–15 disabled while character or border is targeted.
- Byte box: hex or decimal, 8 or 16 bytes.
- Charset picker: 64/128/256 glyphs in true color, in one of three layouts (Phase 11) —
  **blocks** (halves of 128 scaled to the space), **grid** (eight a row at a fixed size,
  scrolling) and **list** (a row per character with its code, the blank slots marked). The
  choice is a preference, not a project setting: it belongs to the screen, not the file.

**Right column — Screen**

- Canvas at 1×–8×, grid overlay, pointer status line.
- **Brush mode selector: Character / Color / Both** — the central new interaction (D7).
- Screen tabs, per-screen transforms, geometry readout.

**Header** — project name, save state, undo/redo, Settings, Export charset, Export screen.

**Settings dialog** — geometry (columns/rows with the 512-cell budget shown live), char height,
char count, video standard, global colors, reverse, memory expansion and bases, and a live
`$9000–$900F` register readout (D14).

---

## 7. Phases

Each phase ends green: `npm run type-check`, `npm run lint`, `npm run test:unit` all pass, and
the app runs. Phases 1–9 are the product; 10–12 are extension and release.

---

### Phase 1 — Rebrand & Strip

**Goal:** a compiling, running skeleton with every TMS9918-specific concept removed. The app
will be _less_ functional at the end of this phase than at the start — that is expected.

- Rename the package to `vic20-editor`, version `0.1.0`. Update `index.html` title, favicon SVG,
  `site.webmanifest`, and `scripts/generate-icons.mjs` source art.
- Delete: `domain/multicolor.ts`, `domain/sprites.ts`, `domain/spriteOps.ts`, `domain/ca65.ts`,
  `utils/spriteRender.ts`, `components/editor/Sprite*.vue`, `MulticolorPanel.vue`,
  `WallpaperPreview.vue`, and their tests.
- Move `AnimationPanel.vue` and `FrameStrip.vue` to `src/components/parked/` with a README note
  (Phase 10 revives them; delete the folder if Phase 10 is dropped).
- Strip sprite and multicolor state from `stores/editor.ts`; strip the sprite/multicolor branches
  from `EditorView.vue` and `ExportDialog.vue`.
- Reduce `ProjectType` to a single placeholder `'hires'` so the app compiles; real types land in
  Phase 2.
- Rename storage keys to `vic20-editor:*` (D18) and the share param.
- Delete `docs/screenshot.png` (regenerated in Phase 12).

**Done when:** the app builds and runs, the project manager creates and opens a project, and no
file mentions TMS9918, sprites, or the old modes.

---

### Phase 2 — VIC Domain Core

**Goal:** the pure-logic foundation. No UI changes.

- `domain/palette.ts` — the 16-color table (§2.1) with `FG_MAX = 7` and helpers
  `isValidColorIndex`, `isValidFgIndex`, and a `ColorSlot = 'screen' | 'border' | 'fg' | 'aux'`
  type with per-slot valid ranges.
- `domain/types.ts` — the §4 model, with narrowing helpers for the three project types.
- `domain/modes.ts` — `MODES` describing each type's bit depth, pixel grid width, and label;
  plus `cellPixelWidth(type, char)`, `patternBytes(charHeight)`, `cellCount(settings)`.
- `domain/vic.ts` (new) — register encoding: `registerBytes(settings): number[]` (16 bytes),
  `charBaseAddress(value)`, `colorRamAddress(screenBase)`, `defaultsForExpansion(expansion)`,
  `defaultOrigins(video)`, and the geometry validator returning
  `{ ok, cells, overBudget, nonDefault }` per D9.
- `domain/factory.ts` — `createProject` with the machine's power-on defaults (22×23, 8×8, 256
  chars, white screen, cyan border, blue foreground, normal video, NTSC, unexpanded).
- `domain/colors.ts` — `resolveCellColors(project, screen, index): string[]`, returning the 2 or
  4 hex colors a cell's pixel values map to, applying reverse mode.
- `domain/serialization.ts` — validate the new schema exhaustively, including
  `cells.length === colors.length === columns × rows`, color ranges per slot, `charModes`
  presence rules, and pattern length vs `charHeight`.
- `domain/charOps.ts` — every op takes the cell's shape (`{ width, height, bpp }`, one object
  rather than three positional arguments); **invert is disabled for multicolor** because four
  unrelated color slots have no complement, and `rotate*` is gated to square 1bpp cells.
- `domain/screenOps.ts` — every op works on a `{ cells, colors }` pair so a transform moves
  color with the character, plus `resize(screen, from, to)` cropping/padding from top-left (D8).

**Tests:** register encoding against the machine's known power-on bytes — `$9002 = $96`
(22 columns, color RAM `$9600`), `$9003 = $2E` (23 rows, 8×8), `$9005 = $F0` (matrix `$1E00`,
chargen `$8000`), `$900F = $1B` (white screen, normal video, cyan border); geometry budget edges
(506 ok, 512 ok, 513 rejected); serialization round-trip for all three types; charOps at 1bpp
and 2bpp, 8 and 16 tall; screenOps keeping cells and colors in step.

---

### Phase 3 — Character & Pixel Editor

**Goal:** draw characters correctly in every combination of type and char height.

- Rewrite `PixelEditor.vue` around `{ width, height, bpp }` derived from the project and, in
  `mixed`, the selected character's flag. Multicolor cells render each pixel at 2× width (D10).
- Left click paints the active color slot; right click paints the "background" slot
  (screen color). At 2bpp the active slot cycles through the four via the color picker.
- `CharsetGrid.vue` / `CharsetPicker.vue` — honor `charCount`, render each glyph in its true
  colors, and mark multicolor characters with a corner badge in `mixed`.
- `CharBytesBox.vue` — expect `charHeight` bytes; keep hex/decimal and paste tolerance.
- `CharacterPanel.vue` — transform buttons, with rotate/invert disabled and tooltipped when the
  cell geometry or bit depth forbids them.
- In `mixed`, a per-character hires/multicolor toggle; flipping it is an undoable command that
  does **not** rewrite pattern bytes (the same bytes simply mean something different), with a
  one-line explanation in the UI.

**Done when:** a 4×8 multicolor character draws, displays, and byte-round-trips correctly, and
an 8×16 hires character does the same.

---

### Phase 4 — Color Model & Picker

**Goal:** VIC color constraints made visible and unbreakable.

- Rewrite `ColorPicker.vue`: 16 swatches in 2×8, a slot selector whose options depend on the
  current cell mode, and colors 8–15 visibly disabled (not hidden) with a tooltip explaining
  the 3-bit field when `fg` or `border` is targeted.
- Add the global color controls (screen / border / auxiliary / reverse) to the settings dialog,
  and mirror screen + border into the picker rail for quick access, since in multicolor they are
  _drawing_ colors, not just chrome.
- Wire live re-render: changing the border color must immediately recolor every multicolor
  cell in the charset picker, pixel editor, and screen canvas — the clearest demonstration of
  the VIC's quirk, and a good manual test.

**Done when:** no interaction can put a value above 7 into a foreground or border slot, and
changing the border repaints multicolor content everywhere at once.

---

### Phase 5 — Screen Editor

**Goal:** paint characters and color RAM on a programmable grid.

- `ScreenCanvas.vue` — render from `settings.columns/rows` and `charHeight`; every cell resolves
  through `resolveCellColors`.
- **Brush mode: Character / Color / Both** (D7), as a segmented control with keyboard
  shortcuts. "Both" paints the selected character _and_ the selected foreground color;
  "Color" recolors without disturbing the character — the recolor pass VIC artists actually
  do.
- Right-drag erases to character 0 (or, in Color mode, to the default fg).
- `screenStatus.ts` — report `X/Y`, pixel origin, character code (hex + decimal), color RAM
  value with its name, and whether the cell is hires or multicolor.
- Screen transforms move cells and colors together.
- Multiple named screens, with the geometry shared project-wide (D8) and a destructive-resize
  confirmation when geometry changes.

**Done when:** a 22×23 default screen paints in all three brush modes, geometry changes resize
every screen consistently, and undo restores both character and color.

---

### Phase 6 — Settings, Geometry & Registers

**Goal:** the settings dialog becomes the project's control panel.

- Rewrite `ProjectSettingsDialog.vue` in sections: **Geometry** (columns, rows, char height,
  live cell budget `506 / 512` with over-budget blocked), **Characters** (char count, with a
  warning that shrinking discards glyphs), **Color** (screen, border, auxiliary, reverse),
  **Video** (NTSC/PAL, origins), **Memory** (expansion preset, char base with its address shown,
  screen base, derived color-RAM address).
- A live `$9000–$900F` readout: sixteen bytes in hex with per-register hover explanation, copy
  to clipboard (D14).
- Changing the expansion preset offers to update char base / screen base to that preset's
  conventional values, rather than silently doing it.
- Destructive changes (geometry shrink, char-count shrink) are confirmed and undoable.

**Done when:** every register in §2.5 that the model covers is reachable from the dialog, and
the readout matches the known defaults for an untouched project.

---

### Phase 7 — Export

**Goal:** output that assembles, runs, or loads without hand-editing.

Segments (`export/tables.ts`):

| Segment         | Contents                                |
| --------------- | --------------------------------------- |
| `char_patterns` | `charCount × charHeight` bytes          |
| `screen_N`      | Character codes, `columns × rows` bytes |
| `colors_N`      | Color RAM bytes: `fg                   | (multicolor ? 8 : 0)` per D2 |
| `vic_registers` | The 16 bytes from `registerBytes`       |

Formats:

- **Assembly** — dialects ca65/64tass (`.byte`), ACME (`!byte`), DASM (`dc.b`) (D12). Label
  casing preserved from the existing `labels.ts`.
- **BASIC** — Commodore BASIC 2.0 `DATA` lines packed to ≤ 80 characters (D13), plus an
  optional generated loader: `POKE` the VIC registers, `READ`/`POKE` the charset into the
  configured base, and a `FOR` loop blitting screen and color RAM. This is the single highest-
  value export for a VIC-20 user; treat the generated program as a deliverable and test that it
  is syntactically well-formed.
- **PRG** — raw bytes prefixed with a 2-byte little-endian load address taken from the target
  (charset → char base, screen → screen base) (D12). Extension `.prg`.
- **Binary** — unchanged concatenation, no header.
- **PNG** — charset sheet and screen, at 1×–8×.

Export scopes reduce to **Charset** and **Screen** (sprite scope gone). Each scope offers the
relevant segments as checkboxes.

**Tests:** byte-exact fixtures for a small known project in every text format; PRG header
correctness; color-RAM packing including the multicolor bit; BASIC line-length invariant.

---

### Phase 8 — Character Set Seed & Samples

**Goal:** a new project is immediately usable, and the sample list shows the VIC off.

- Write `scripts/generate-charset.mjs` (mirroring `generate-icons.mjs`: zero dependencies, run
  by hand, output committed). It reads `rom/chargen.bin`, runs every check in `rom/README.md` —
  size, hash, the `@` and `A` glyph fixtures, and the complement relationship between each
  normal block and its reversed pair — and **fails loudly rather than emitting** on any
  mismatch, so a wrong or corrupt dump can never reach the app silently. The glyph fixtures are
  the checks that matter: the C64 chargen is also 4096 bytes with the same four-block layout and
  passes every structural test.
- The script emits `src/domain/romCharset.ts`: the two normal 1 KB blocks and their reversed
  counterparts as base64, with a decoder returning `number[][]` for a given set and `charCount`
  per D16a. Roughly 5.5 KB of base64 — small enough to inline, large enough that it should not
  be hand-edited, so mark the file generated and check it in.
- Delete `samples/font.ts`. Its 5×7 ASCII font existed only to fake a character set for the
  TMS9918 text sample; the real ROM supersedes it everywhere.
- New Project dialog: add the starting charset (ROM uppercase / ROM lowercase / blank). Type,
  char height and char count landed in Phase 3, which needed them to create a project the
  character editor could exercise.
- Rewrite `samples/index.ts` with four samples:
  1. **Hires title screen** — default geometry, PETSCII-ish text and a border, showing per-cell
     color.
  2. **Multicolor scene** — a game-style backdrop using all four color slots, demonstrating the
     border-color quirk.
  3. **Mixed screen** — multicolor artwork with hires text over it, the real-world pattern.
  4. **Wide screen** — non-default geometry (e.g. 28×16) to prove programmable size works.
- Note in each sample's description which VIC feature it demonstrates.

**Done when:** every sample loads, renders correctly, exports without error, and round-trips
through serialization.

---

### Phase 9 — Persistence, Sharing & Project Manager

**Goal:** everything around the editor speaks VIC.

- `persistence/repository.ts` and `preferences.ts` — the renamed keys from Phase 1, plus the
  project summary carrying type, geometry, and char height.
- Project manager rows: name, type badge, geometry (`22×23`, `8×16` when tall), modified time,
  and the existing rename / duplicate / share / download / delete actions.
- Download as `<name>.vic20.json` (D17). Import rejects TMS9918 files with a message naming the
  problem rather than a generic validation error.
- Share links: unchanged mechanism, new param name; verify the compressed payload of a full
  22×23 project with a 256-char set stays under the length warning threshold, and surface the
  size when it does not.

**Done when:** a project survives save → reload → share → import with byte-identical content.

---

### Phase 10 — Shape Mode _(optional)_

**Goal:** the software-sprite workflow, reusing the parked animation UI (D11).

Only start this after Phases 1–9 ship. If it is cut, delete `src/components/parked/`.

```ts
interface Shape {
  name: string
  /** Block size in characters. */
  width: number
  height: number
  /** Frames; each frame is width × height character codes. */
  frames: number[][]
  /** Per-frame or per-shape color; start with one color per shape. */
  color: ColorIndex
  fps: number
}
```

- A Shapes panel listing shapes, with a grid picker assigning characters to the block.
- Revive `AnimationPanel.vue` and `FrameStrip.vue` to scrub and play frames at 1–30 fps over the
  screen color.
- Export: one segment per shape holding its frames' character codes, plus a header comment
  documenting the block dimensions so runtime code can index it.
- Shapes are a project-level list available in all three types; they compose from the same
  charset.

**Done when:** a 2×2 four-frame walk cycle animates in the panel and exports as a flat table.

---

### Phase 11 — Keyboard, Responsive & Polish

- Shortcut map, documented in the README and a help dialog:
  undo/redo, brush modes, color slot targeting, character navigation, transforms on
  `Alt`+arrows, screen scale, grid toggle.
- Tablet/phone: the two-column → two-tab collapse, touch painting on both canvases, and the
  project-manager row split (all inherited, but re-verified against the new panels).
- Accessibility pass: color swatches carry names, not just color; disabled states explain
  themselves; the canvas has a keyboard cursor mode.
- Empty and error states: no screens, over-budget geometry, storage quota exceeded.

---

### Phase 12 — README, Screenshot & Release

- Rewrite `README.md` for the VIC-20: feature list, the mode/color table from §2, export
  format reference, keyboard map, and a short "VIC-20 memory notes" section covering expansion
  and char base, since that is where users will get stuck.
- New `docs/screenshot.png`.
- Verify `LICENSE` still applies and add an attribution note for the palette values. Decide how
  the derived ROM charset data in `src/domain/romCharset.ts` is described in the README before
  publishing — it is Commodore character ROM data, and the project's own license does not cover
  it. Flagging this as a release-time decision, not a blocker on the build.
- Version `1.0.0`, build, and deploy.

---

## 8. Risks & Open Questions

**Multicolor authoring is genuinely harder than the TMS9918 equivalent.** Four color slots, of
which two are global and one is shared with the border, and half-width pixels. Phase 4's live
re-render is the mitigation; if it still confuses in testing, consider a "color slots" legend
pinned next to the pixel editor.

**D2 (character-owned multicolor flag) trades hardware generality for sanity.** If a user needs
one character rendered both ways, they must duplicate the glyph. Worth revisiting only if it
comes up in practice.

**Geometry limits above the defaults are approximate.** Register ranges are documented; what an
actual 6560 displays past 31 columns depends on timing and the model. The editor caps
conservatively (D9) and says so.

**The generated BASIC loader is the most likely source of bugs**, because correctness means
"runs on a VIC-20", which the test suite cannot check. Keep the generator simple, test its
structure, and validate output in VICE by hand before Phase 12.

---

## 9. Deferred

- Aspect-ratio-corrected preview (VIC pixels are not square).
- Importing an existing `.prg` / charset dump into a project.
- 8×16 rotate support (needs a defined non-square rotation).
- Per-frame color in Shape mode.
- Raster-effect preview (color changes mid-screen).
- Sound registers (`$900A`–`$900E` low nybble) — out of scope for a graphics editor.
