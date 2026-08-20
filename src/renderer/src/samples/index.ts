/**
 * Bundled sample projects, loadable from the project manager. Each builder
 * returns a fresh Project (new id + timestamps) so loading a sample twice makes
 * two independent projects.
 *
 * Four of them, and each one is here to show a different thing the VIC does
 * that the TMS9918 did not: per-cell color RAM, the four-slot multicolor cell
 * with its border-color quirk, per-character mode selection on one screen, and
 * register-programmable geometry (PLAN.md Phase 8). The description on each
 * card names the feature, because a sample nobody can read is decoration.
 */

import type { Project } from '@/domain/types'
import { createProject } from '@/domain/factory'
import { G, multicolorPattern, painter, screenCode } from './paint'

export interface Sample {
  id: string
  name: string
  description: string
  build: () => Project
}

// Color RAM values, 0–7 — the 3-bit field a cell's own color comes from.
const BLACK = 0
const WHITE = 1
const RED = 2
const CYAN = 3
const PURPLE = 4
const GREEN = 5
const BLUE = 6
const YELLOW = 7

// --- 1. Hires title screen ----------------------------------------------------

/**
 * The default 22 × 23 screen in hires, seeded from the ROM uppercase set. Every
 * line of text and every swatch carries its own color RAM value, which is the
 * whole point: on the VIC color is per cell, not per row or per group (D7).
 */
function titleScreen(): Project {
  const project = createProject({ name: 'Sample — Title Screen', type: 'hires' })
  project.settings.screenColor = BLACK
  project.settings.borderColor = BLUE

  const p = painter(project)
  p.recolor(0, 0, 22, 23, BLUE)
  p.frame(0, 0, 22, 23, CYAN)

  p.center(2, 'VIC-20', YELLOW)
  p.center(4, 'CHARACTER &', WHITE)
  p.center(5, 'SCREEN EDITOR', WHITE)
  p.fill(2, 7, 18, 1, G.hLine, BLUE)

  p.center(9, 'COLOR RAM', CYAN)
  p.center(10, 'IS PER CELL', CYAN)

  // Colors 1–7 as a bar: black is a color RAM value too, but on a black
  // screen it would be an eight-cell gap, so the bar starts at white.
  for (let color = WHITE; color <= YELLOW; color++) {
    const x = 4 + (color - 1) * 2
    p.fill(x, 12, 2, 2, G.solid, color)
  }
  p.center(15, '3 BITS: 0-7', GREEN)

  const symbols = [G.spade, G.heart, G.club, G.diamond, G.disc, G.circle, G.cross, G.dither]
  p.row(7, 17, symbols)
  symbols.forEach((_, i) => p.recolor(7 + i, 17, 1, 1, (i % 7) + 1))

  p.center(19, 'ROM CHARACTER SET', PURPLE)
  p.center(21, '22 X 23 CELLS', YELLOW)
  return project
}

// --- 2. Multicolor scene ------------------------------------------------------

/**
 * Tiles for the multicolor scene. Each row is four double-wide pixels naming a
 * color *slot*: `0` screen, `1` border, `2` the cell's color RAM, `3`
 * auxiliary. The mountains are drawn in slot 1 deliberately — that slot is the
 * border register, so the silhouette and the screen's edge are the same color
 * and change together (PLAN.md §2.2).
 */
const SCENE = {
  star: 1,
  moonLeft: 2,
  moonRight: 3,
  slopeLeft: 4,
  slopeRight: 5,
  peak: 6,
  rock: 7,
  grass: 8,
  soil: 9,
  soilRocks: 10,
  roofLeft: 11,
  roofRight: 12,
  wallWindow: 13,
  wallDoor: 14,
} as const

const SCENE_TILES: Record<number, string[]> = {
  [SCENE.star]: ['0000', '0000', '0300', '3330', '0300', '0000', '0000', '0000'],
  [SCENE.moonLeft]: ['0033', '0333', '3333', '3333', '3333', '3333', '0333', '0033'],
  [SCENE.moonRight]: ['3300', '3330', '3333', '3333', '3333', '3333', '3330', '3300'],
  [SCENE.slopeLeft]: ['0000', '0000', '0001', '0011', '0111', '1111', '1111', '1111'],
  [SCENE.slopeRight]: ['0000', '0000', '1000', '1100', '1110', '1111', '1111', '1111'],
  [SCENE.peak]: ['0000', '0330', '1331', '1221', '1221', '1221', '1221', '1221'],
  [SCENE.rock]: ['1111', '1111', '1111', '1111', '1111', '1111', '1111', '1111'],
  [SCENE.grass]: ['0202', '2222', '2222', '2222', '2222', '2222', '2222', '2222'],
  [SCENE.soil]: ['2222', '2222', '2222', '2222', '2222', '2222', '2222', '2222'],
  [SCENE.soilRocks]: ['2222', '2212', '2222', '2122', '2222', '2212', '2222', '2122'],
  [SCENE.roofLeft]: ['0000', '0000', '0001', '0011', '0111', '1111', '1111', '1111'],
  [SCENE.roofRight]: ['0000', '0000', '1000', '1100', '1110', '1111', '1111', '1111'],
  [SCENE.wallWindow]: ['2222', '2332', '2332', '2222', '2222', '2222', '2222', '2222'],
  [SCENE.wallDoor]: ['2222', '2112', '2112', '2112', '2112', '2112', '2112', '2112'],
}

/** A three-row mountain, apex at `x`, its base one row above `baseline`. */
function mountain(p: ReturnType<typeof painter>, x: number, baseline: number): void {
  p.poke(x, baseline - 3, SCENE.peak, PURPLE)
  for (let step = 1; step <= 2; step++) {
    const y = baseline - 3 + step
    p.poke(x - step, y, SCENE.slopeLeft, PURPLE)
    p.fill(x - step + 1, y, step * 2 - 1, 1, SCENE.rock, PURPLE)
    p.poke(x + step, y, SCENE.slopeRight, PURPLE)
  }
}

function multicolorScene(): Project {
  const project = createProject({
    name: 'Sample — Night Landscape',
    type: 'multicolor',
    settings: { charCount: 64 },
    seed: 'blank',
  })
  project.settings.screenColor = BLUE // slot 00 — the sky
  project.settings.borderColor = BLACK // slot 01 — silhouettes *and* the border
  project.settings.auxColor = 1 // slot 11 — White: the moon, snow, lit windows

  for (const [code, art] of Object.entries(SCENE_TILES)) {
    project.charset[Number(code)] = multicolorPattern(art)
  }

  const p = painter(project)

  for (const [x, y] of [
    [2, 1],
    [7, 3],
    [13, 2],
    [19, 5],
    [4, 6],
    [16, 7],
    [10, 4],
  ] as const) {
    p.poke(x, y, SCENE.star, WHITE)
  }
  p.poke(17, 1, SCENE.moonLeft, WHITE)
  p.poke(18, 1, SCENE.moonRight, WHITE)

  mountain(p, 5, 13)
  mountain(p, 13, 13)

  // House: roof in the border color, walls in color RAM, windows in auxiliary
  // — one cell reaching three different registers plus the screen color.
  p.poke(18, 11, SCENE.roofLeft, RED)
  p.poke(19, 11, SCENE.roofRight, RED)
  p.poke(18, 12, SCENE.wallWindow, RED)
  p.poke(19, 12, SCENE.wallDoor, RED)

  p.fill(0, 13, 22, 1, SCENE.grass, GREEN)
  p.fill(0, 14, 22, 9, SCENE.soil, GREEN)
  for (const [x, y] of [
    [3, 16],
    [9, 15],
    [14, 18],
    [20, 17],
    [6, 20],
    [17, 21],
  ] as const) {
    p.poke(x, y, SCENE.soilRocks, GREEN)
  }
  return project
}

// --- 3. Mixed screen ----------------------------------------------------------

/**
 * Multicolor artwork with hires text over it — the arrangement real VIC games
 * use, and the reason `mixed` exists (D1, D2). The ROM font stays hires so the
 * status text is 8 pixels wide and readable; the tiles below are marked
 * multicolor per character, high in the set where the reversed block sits.
 */
const DUNGEON = {
  brick: 192,
  brickCracked: 193,
  floor: 194,
  torch: 195,
  water: 196,
  gem: 197,
} as const

const DUNGEON_TILES: Record<number, string[]> = {
  [DUNGEON.brick]: ['2212', '2212', '1111', '2122', '2122', '1111', '2212', '2212'],
  [DUNGEON.brickCracked]: ['2212', '2012', '1111', '2122', '2102', '1111', '2212', '2012'],
  [DUNGEON.floor]: ['1111', '2222', '2222', '2222', '2222', '2222', '2222', '2222'],
  [DUNGEON.torch]: ['0330', '0330', '0230', '0220', '0220', '0110', '0110', '0110'],
  [DUNGEON.water]: ['0000', '0000', '0000', '2222', '3333', '2222', '2222', '3333'],
  [DUNGEON.gem]: ['0000', '0330', '3333', '3333', '0330', '0330', '0030', '0000'],
}

function mixedScreen(): Project {
  const project = createProject({ name: 'Sample — Dungeon', type: 'mixed' })
  project.settings.screenColor = BLACK // slot 00 in the tiles; behind the text
  project.settings.borderColor = BLUE // slot 01 — mortar and torch handles
  project.settings.auxColor = 7 // slot 11 — Yellow: flame, gems, water glints

  // `createProject` gives every `mixed` project a charModes array (D2).
  const modes = project.charModes ?? []
  for (const [code, art] of Object.entries(DUNGEON_TILES)) {
    project.charset[Number(code)] = multicolorPattern(art)
    modes[Number(code)] = true
  }

  const p = painter(project)

  // Hires status text — ROM glyphs, one color RAM value per cell.
  p.text(1, 1, 'SCORE', CYAN)
  p.text(7, 1, '001250', WHITE)
  p.text(14, 1, 'KEYS', CYAN)
  p.row(19, 1, [G.diamond, G.diamond], YELLOW)
  p.fill(1, 2, 20, 1, G.hLine, BLUE)

  // Multicolor artwork below it.
  p.fill(0, 4, 22, 9, DUNGEON.brick, RED)
  for (const [x, y] of [
    [3, 5],
    [11, 4],
    [17, 7],
    [7, 10],
    [20, 11],
  ] as const) {
    p.poke(x, y, DUNGEON.brickCracked, RED)
  }
  p.poke(4, 6, DUNGEON.torch, WHITE)
  p.poke(16, 6, DUNGEON.torch, WHITE)
  p.poke(9, 8, DUNGEON.gem, CYAN)
  p.poke(13, 9, DUNGEON.gem, PURPLE)

  p.fill(0, 13, 22, 1, DUNGEON.floor, GREEN)
  p.fill(0, 14, 22, 3, DUNGEON.water, CYAN)

  // Hires text again, over the artwork rather than beside it.
  p.center(18, 'HIRES TEXT OVER', WHITE)
  p.center(19, 'MULTICOLOR TILES', WHITE)
  p.center(21, 'ONE SCREEN, BOTH', GREEN)
  return project
}

// --- 4. Wide screen -----------------------------------------------------------

/**
 * 28 × 16 rather than 22 × 23. Geometry is two registers, not a mode, so a
 * project can be any shape the 512-cell color RAM affords (D8, D9) — this one
 * spends 448 of them.
 */
function wideScreen(): Project {
  const project = createProject({
    name: 'Sample — Wide Screen',
    type: 'hires',
    settings: { columns: 28, rows: 16 },
  })
  project.settings.screenColor = WHITE
  project.settings.borderColor = CYAN

  const p = painter(project)
  p.recolor(0, 0, 28, 16, BLUE)
  p.frame(0, 0, 28, 16, RED)

  p.center(2, '28 X 16 CELLS', BLUE)
  p.center(4, 'COLUMNS AND ROWS ARE', BLACK)
  p.center(5, 'REGISTERS, NOT A MODE', BLACK)

  // A ruler numbering the columns it covers — inside the frame, so it counts
  // 1 to 26 rather than painting over the border at 0 and 27.
  p.fill(1, 7, 26, 1, G.hLine, CYAN)
  for (let x = 1; x <= 26; x++) {
    p.poke(x, 8, screenCode(String(Math.floor(x / 10))), PURPLE)
    p.poke(x, 9, screenCode(String(x % 10)), GREEN)
  }
  p.fill(1, 10, 26, 1, G.hLine, CYAN)

  p.center(12, '448 OF 512 COLOR', RED)
  p.center(13, 'RAM CELLS IN USE', RED)
  return project
}

export const SAMPLES: readonly Sample[] = [
  {
    id: 'title-screen',
    name: 'Title Screen',
    description:
      'Hires text from the ROM character set on the default 22 × 23 screen. Shows color RAM: every cell carries its own color.',
    build: titleScreen,
  },
  {
    id: 'night-landscape',
    name: 'Night Landscape',
    description:
      'A multicolor backdrop using all four color slots. The mountains are drawn in the border color — change it and the silhouette changes with the screen edge.',
    build: multicolorScene,
  },
  {
    id: 'dungeon',
    name: 'Dungeon',
    description:
      'A mixed project: multicolor tiles and hires text on one screen, with the mode chosen per character.',
    build: mixedScreen,
  },
  {
    id: 'wide-screen',
    name: 'Wide Screen',
    description:
      'Programmable geometry — 28 × 16 cells instead of 22 × 23, well inside the 512-cell color RAM budget.',
    build: wideScreen,
  },
]
