VIC-EDITOR
==========

A browser-based character set and screen editor for the [Commodore VIC-20](https://en.wikipedia.org/wiki/VIC-20)
and its MOS 6560/6561 ("VIC-I") video chip.

> **Status: conversion in progress.** This project was seeded from the TMS9918
> Character & Screen Editor and is being rebuilt for the VIC-20 in the phases set
> out in [PLAN.md](PLAN.md). **Phases 1–9 and 11 are complete**: everything
> specific to the old chip is gone, the VIC's domain model is in place, the
> character editor draws every cell shape the chip has, the color model is the
> VIC's own, the screen editor paints color RAM alongside characters, the
> settings dialog is the project's register-level control panel, export emits
> code that assembles and runs, new projects start from the ROM character set,
> and the keyboard, touch and accessibility pass is done. Phase 10 (Shape mode)
> is optional and not started; this README is rewritten in full at Phase 12.

What works today: create and open projects, draw 8×8, 8×16 hires or 4×8, 4×16
multicolor characters with the pixel editor (fill / clear / invert, wrapping
shifts, flips, rotates — all undoable), paint characters and color RAM onto a
22 × 23 screen at 1×–8× zoom, resize that screen to anything the chip can show,
manage multiple named screens, and export the character set or a screen as 6502
assembly, BASIC `DATA`, raw binary, or PNG. Projects autosave to
`localStorage`, download as `.vic20.json`, and share as a single self-contained
link.

The character set shows as scaled blocks, as a scrolling grid of eight a row, or as a list
with each character's code and whether its slot is still blank — whichever suits the window,
remembered per browser.

Everything is reachable without a mouse: one keyboard map drives the editor (see
[Keyboard](#keyboard) below, or press `?` in the app), and the pixel grid, the
character set and the screen each take focus and paint under a cursor. On a
phone or tablet the two columns become two tabs, and both canvases paint under a
finger.

Color is the VIC's: 16 fixed colors, a per-cell color RAM value, and the
screen, border and auxiliary registers the whole project shares — with the two
3-bit fields (character color and border) refusing colors 8–15, as the hardware
does. Changing a global color repaints every surface at once.

The screen brush writes the character, its color RAM value, or both, so a
recolor pass leaves the drawing underneath alone; the right button erases
whichever of those layers the brush covers. Columns and rows are registers the
whole project shares, so changing them re-fits every screen at once — confirmed
first when it would crop something, and undoable either way.

The settings dialog is where the rest of the chip lives: screen geometry against
the 512-cell color RAM budget, character height and set size, the global color
registers, NTSC or PAL, and the memory layout — expansion, character base and
screen base, with the color RAM address the latter forces. Every field is an
undoable command, the three that discard content say what they would cost and
ask first, and changing the expansion offers its conventional layout rather than
moving memory behind your back. Underneath it all sits a live `$9000–$900F`
readout: sixteen bytes in hex, each explaining its fields on hover, copyable as
an addressed dump.

## Getting started

```sh
npm install
npm run dev
```

| Script                            | Does                                 |
| --------------------------------- | ------------------------------------ |
| `npm run dev`                     | Vite dev server                      |
| `npm run build`                   | Type-check and build to `dist/`      |
| `npm run test:unit`               | Vitest                               |
| `npm run type-check`              | `vue-tsc`                            |
| `npm run lint`                    | oxlint + ESLint                      |
| `npm run format`                  | Prettier over `src/`                 |
| `node scripts/generate-icons.mjs` | Regenerate the icon set in `public/` |

## Layout

```
src/domain/       pure logic — no Vue (types, charOps, screenOps, export, serialization)
src/persistence/  localStorage repository and preferences
src/stores/       Pinia stores (projects, editor + undo history)
src/components/   base/ + editor/ + projects/ components
src/components/parked/  shelved for PLAN.md Phase 10 (Shape mode); nothing imports it
src/views/        project manager and editor views
rom/              VIC-20 character ROM dump, build-time input for Phase 8
```

## Keyboard

Every key below is also listed in the app: the **Keyboard Shortcuts** button in
either header — or `?` — opens the same map, taken from the same source as this
table. On Apple platforms `Ctrl/Cmd` is `⌘`, `Alt` is `⌥` and `Shift` is `⇧`.

The character grid, the character set and the screen each take focus and answer
to a cursor: arrows move it, `Enter` paints, `Backspace` clears, and the cell
under it is announced for a screen reader.

### Project

| Key                | Action                   |
| ------------------ | ------------------------ |
| `Ctrl/Cmd+Z`       | Undo                     |
| `Shift+Ctrl/Cmd+Z` | Redo                     |
| `Ctrl/Cmd+S`       | Save now                 |
| `?`                | Keyboard shortcuts       |
| `Esc`              | Back to the project list |

### Character

| Key       | Action                  |
| --------- | ----------------------- |
| `[`       | Previous character      |
| `]`       | Next character          |
| `F`       | Fill the character      |
| `C`       | Clear the character     |
| `I`       | Invert the character    |
| `H`       | Flip horizontal         |
| `V`       | Flip vertical           |
| `R`       | Rotate right            |
| `Shift+R` | Rotate left             |
| `Alt+←`   | Shift the pattern left  |
| `Alt+→`   | Shift the pattern right |
| `Alt+↑`   | Shift the pattern up    |
| `Alt+↓`   | Shift the pattern down  |

### Color

| Key | Action                     |
| --- | -------------------------- |
| `4` | Target the screen color    |
| `5` | Target the border color    |
| `6` | Target the character color |
| `7` | Target the auxiliary color |

### Screen

| Key       | Action           |
| --------- | ---------------- |
| `1`       | Brush: character |
| `2`       | Brush: color     |
| `3`       | Brush: both      |
| `,`       | Previous screen  |
| `.`       | Next screen      |
| `+` / `=` | Zoom in          |
| `-`       | Zoom out         |
| `G`       | Grid overlay     |

### Canvas cursor

| Key                    | Action                                                 |
| ---------------------- | ------------------------------------------------------ |
| `Tab`                  | Focus the pixel grid, the character set, or the screen |
| `←` / `→` / `↑` / `↓`  | Move the cursor                                        |
| `Home` / `End`         | First or last cell of the row                          |
| `Enter` / `Space`      | Paint the cursor cell                                  |
| `Backspace` / `Delete` | Erase the cursor cell                                  |
| `Esc`                  | Hide the cursor                                        |

### Project list

| Key | Action             |
| --- | ------------------ |
| `N` | New project        |
| `?` | Keyboard shortcuts |

## License

MIT — see [LICENSE](LICENSE).
