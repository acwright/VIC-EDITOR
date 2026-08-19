/**
 * Editor store — selection state and the project-wide undo history. Every
 * mutation of the open project goes through the command layer here; commands
 * capture the target character so undo/redo applies to the right slot even
 * after the selection moves on.
 *
 * Drag strokes on the pixel editor are wrapped in beginStroke/endStroke so a
 * whole stroke undoes as one entry.
 */

import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  CharCount,
  CharHeight,
  CharPattern,
  Charset,
  Expansion,
  ProjectSettings,
  Screen,
  VideoStandard,
} from '@/domain/types'
import * as charOps from '@/domain/charOps'
import * as screenOps from '@/domain/screenOps'
import type { CellPaint, Geometry, ScreenData } from '@/domain/screenOps'
import { CommandHistory } from '@/domain/commands'
import { cellShape, isCharMulticolor, type CellShape } from '@/domain/modes'
import { cellSlots } from '@/domain/colors'
import { blankPattern, blankScreen } from '@/domain/factory'
import {
  SCREEN_BASE_GRANULARITY,
  defaultsForExpansion,
  registerBytes,
  validateGeometry,
  type ExpansionDefaults,
} from '@/domain/vic'
import {
  DEFAULT_FG,
  HIRES_SLOTS,
  SLOT_LABELS,
  isValidSlotIndex,
  type ColorSlot,
} from '@/domain/palette'
import { useProjectsStore } from './projects'

export type { ColorSlot } from '@/domain/palette'

/**
 * Character transforms, named once so every caller — panel buttons and the
 * keyboard map — refers to the same set. `invert` and the rotations are
 * meaningless for some cell shapes; `transformEnabled` reports which, and the
 * ops themselves return the pattern unchanged rather than inventing a result.
 */
export type TransformName =
  | 'fill'
  | 'clear'
  | 'invert'
  | 'shiftLeft'
  | 'shiftRight'
  | 'shiftUp'
  | 'shiftDown'
  | 'flipH'
  | 'flipV'
  | 'rotateLeft'
  | 'rotateRight'

type CharTransform = (pattern: CharPattern, shape: CellShape) => CharPattern

const TRANSFORMS: Record<TransformName, { label: string; char: CharTransform }> = {
  fill: { label: 'Fill', char: (_pattern, shape) => charOps.fill(shape) },
  clear: { label: 'Clear', char: (_pattern, shape) => charOps.clear(shape) },
  invert: { label: 'Invert', char: charOps.invert },
  shiftLeft: { label: 'Shift Left', char: charOps.shiftLeft },
  shiftRight: { label: 'Shift Right', char: charOps.shiftRight },
  shiftUp: { label: 'Shift Up', char: charOps.shiftUp },
  shiftDown: { label: 'Shift Down', char: charOps.shiftDown },
  flipH: { label: 'Flip Horizontal', char: charOps.flipH },
  flipV: { label: 'Flip Vertical', char: charOps.flipV },
  rotateLeft: { label: 'Rotate Left', char: charOps.rotateLeft },
  rotateRight: { label: 'Rotate Right', char: charOps.rotateRight },
}

/** Which transforms the cell's shape and bit depth allow (PLAN.md Phase 2). */
export function transformEnabled(name: TransformName, shape: CellShape | null): boolean {
  if (!shape) return false
  if (name === 'invert') return charOps.canInvert(shape)
  if (name === 'rotateLeft' || name === 'rotateRight') return charOps.canRotate(shape)
  return true
}

/**
 * Why a transform is unavailable for this cell, for the button's tooltip —
 * null when it is available. A disabled control that cannot say why reads as a
 * bug; these two are refusals, not omissions (PLAN.md Phase 3).
 */
export function transformReason(name: TransformName, shape: CellShape | null): string | null {
  if (transformEnabled(name, shape)) return null
  if (!shape) return 'No character selected'
  if (name === 'invert') return 'Hires only — a multicolor cell has no complement'
  return shape.bpp === 2
    ? 'Hires only — multicolor pixels are double-wide'
    : `Square characters only — this one is ${shape.width} × ${shape.height}`
}

/**
 * What a stroke on the screen canvas writes (PLAN.md D7). Color RAM is a
 * second layer over the same grid, and recoloring without disturbing the
 * characters underneath is a pass VIC artists actually make, so the two are
 * paintable together or apart rather than always as a pair.
 */
export type BrushMode = 'char' | 'color' | 'both'

export interface BrushModeInfo {
  mode: BrushMode
  label: string
  hint: string
}

/**
 * The three brush modes in presentation order. The keys that select them live
 * in `utils/shortcuts.ts` with every other shortcut, so the tooltip here and
 * the handler that acts on the key cannot disagree.
 */
export const BRUSH_MODES: readonly BrushModeInfo[] = [
  {
    mode: 'char',
    label: 'Character',
    hint: 'Places the selected character, leaving color RAM alone',
  },
  {
    mode: 'color',
    label: 'Color',
    hint: 'Recolors cells, leaving the characters alone',
  },
  {
    mode: 'both',
    label: 'Both',
    hint: 'Places the selected character in the selected color',
  },
]

/** The paint one brush mode writes for a given character code and color. */
function brushPaintFor(mode: BrushMode, code: number, color: number): CellPaint {
  if (mode === 'char') return { code }
  if (mode === 'color') return { color }
  return { code, color }
}

/** What an edit writes, for the undo entry's label. */
function paintLabel(paint: CellPaint): string {
  if (paint.code === undefined) return 'Recolor Cell'
  if (paint.code === screenOps.EMPTY_CELL) return 'Erase Cell'
  return paint.color === undefined ? 'Place Character' : 'Paint Cell'
}

export const useEditorStore = defineStore('editor', () => {
  const projects = useProjectsStore()

  /** Character code, bounded by the project's char count. */
  const selectedChar = ref(0)

  const history = reactive(new CommandHistory())

  const canUndo = computed(() => history.canUndo)
  const canRedo = computed(() => history.canRedo)
  const undoLabel = computed(() => history.undoLabel)
  const redoLabel = computed(() => history.redoLabel)

  const currentPattern = computed<CharPattern | null>(
    () => projects.current?.charset[selectedChar.value] ?? null,
  )

  /** Pixel grid of the selected character: width, height and bit depth. */
  const currentShape = computed<CellShape | null>(() => {
    const project = projects.current
    return project ? cellShape(project, selectedChar.value) : null
  })

  /** Screen index within the project. */
  const selectedScreen = ref(0)

  // --- Screen view state (not persisted) ---
  const screenScale = ref(3)
  /** What a screen stroke writes: character, color RAM, or both (D7). */
  const brushMode = ref<BrushMode>('char')
  const showGrid = ref(true)
  /** True once the user zooms manually; auto-fit pauses until the next project. */
  const screenZoomedManually = ref(false)

  function zoomScreen(delta: number): void {
    screenZoomedManually.value = true
    screenScale.value = Math.max(1, Math.min(8, screenScale.value + delta))
  }

  /** Auto-fit path — sets the scale without marking it manual. */
  function fitScreenScale(value: number): void {
    screenScale.value = Math.max(1, Math.min(8, Math.floor(value)))
  }

  function toggleGrid(): void {
    showGrid.value = !showGrid.value
  }

  function setBrushMode(mode: BrushMode): void {
    brushMode.value = mode
  }

  /** Reset selection and history — call when a (different) project opens. */
  function reset(): void {
    selectedChar.value = 0
    selectedScreen.value = 0
    screenZoomedManually.value = false
    brushMode.value = 'char'
    fgColor.value = DEFAULT_FG
    targetSlotRef.value = 'fg'
    history.clear()
  }

  function selectChar(code: number): void {
    const count = projects.current?.settings.charCount ?? 256
    selectedChar.value = ((code % count) + count) % count
  }

  /** Replace one character's pattern as an undoable command. */
  function executePatternChange(label: string, charCode: number, next: CharPattern): void {
    const prev = projects.current?.charset[charCode]
    if (!prev || (prev.length === next.length && prev.every((b, i) => b === next[i]))) return
    const apply = (pattern: CharPattern) => {
      const charset = projects.current?.charset
      if (!charset) return
      charset[charCode] = pattern
      projects.markDirty()
    }
    history.execute({ label, do: () => apply(next), undo: () => apply(prev) })
  }

  /** Apply a pure transform (charOps) to the selected character. */
  function transform(label: string, fn: CharTransform): void {
    const pattern = currentPattern.value
    const shape = currentShape.value
    if (!pattern || !shape) return
    executePatternChange(label, selectedChar.value, fn(pattern, shape))
  }

  /** Apply a named transform to the selected character. */
  function applyTransform(name: TransformName): void {
    if (!transformEnabled(name, currentShape.value)) return
    // Fill uses the brush, not the highest pixel value: in a multicolor cell
    // the highest value is the auxiliary color, which is no more "filled"
    // than the other three.
    if (name === 'fill') {
      transform('Fill', (_pattern, shape) => charOps.fill(shape, activeValue.value))
      return
    }
    const entry = TRANSFORMS[name]
    transform(entry.label, entry.char)
  }

  /** Overwrite the selected character's pattern (e.g. pasted bytes). */
  function setCharPattern(bytes: CharPattern): void {
    const pattern = currentPattern.value
    if (!pattern || bytes.length !== pattern.length) return
    executePatternChange('Set Bytes', selectedChar.value, bytes.slice())
  }

  // --- Pixel strokes ---

  function beginStroke(label: string): void {
    history.beginBatch(label)
  }

  function endStroke(): void {
    history.endBatch()
  }

  /**
   * Set one pixel of the selected character to a pixel *value* — 0/1 in a hires
   * cell, 0–3 in a multicolor one. No-op if it already holds that value.
   */
  function paintPixel(x: number, y: number, value: number): void {
    const pattern = currentPattern.value
    const shape = currentShape.value
    if (!pattern || !shape || charOps.getPixel(pattern, shape, x, y) === value) return
    executePatternChange(
      value === 0 ? 'Erase pixel' : 'Draw pixel',
      selectedChar.value,
      charOps.setPixel(pattern, shape, x, y, value),
    )
  }

  // --- Colors ---

  /**
   * The color brush: the color RAM value painting writes, and the color the
   * character editor previews with. It is tool state, not project state — a
   * character has no color of its own; the cell it sits in does (PLAN.md D7).
   */
  const fgColor = ref(DEFAULT_FG)

  /**
   * The slot the color picker's swatches fill. Usually it is also the pixel
   * brush, but not always: the picker mirrors the screen and border registers
   * for quick access, and a hires cell draws with neither the border nor the
   * auxiliary color (PLAN.md Phase 4). Targeting one of those edits the
   * register without pointing the brush at a slot the cell cannot draw.
   */
  const targetSlotRef = ref<ColorSlot>('fg')

  /** Color slots in pixel-value order for the selected character's cell. */
  const currentSlots = computed<ColorSlot[]>(() => {
    const project = projects.current
    if (!project) return [...HIRES_SLOTS]
    return cellSlots(project, isCharMulticolor(project, selectedChar.value))
  })

  /** Which slot the swatches fill — any of the four, drawn by this cell or not. */
  const targetSlot = computed<ColorSlot>(() => targetSlotRef.value)

  /**
   * Which slot the pixel brush paints. It follows the target while the cell has
   * that slot and falls back to the character color otherwise, rather than
   * leaving the brush pointed at nothing.
   */
  const activeSlot = computed<ColorSlot>(() =>
    currentSlots.value.includes(targetSlotRef.value) ? targetSlotRef.value : 'fg',
  )

  function setActiveSlot(slot: ColorSlot): void {
    targetSlotRef.value = slot
  }

  /**
   * The pixel value the brush writes — the active slot's position in the cell.
   * Under reverse mode that is 0, not 1, because reverse swaps which value
   * reads color RAM (PLAN.md §2.2).
   */
  const activeValue = computed(() => currentSlots.value.indexOf(activeSlot.value))

  /** The pixel value that shows the screen color — what right-click paints. */
  const backgroundValue = computed(() => currentSlots.value.indexOf('screen'))

  /** True when the selected character renders as multicolor (D2). */
  const currentMulticolor = computed(() => {
    const project = projects.current
    return project ? isCharMulticolor(project, selectedChar.value) : false
  })

  /**
   * Flip a character between hires and multicolor in a `mixed` project (D2).
   * Deliberately does **not** rewrite the pattern: the same bytes are simply
   * read differently, and rewriting them would destroy the drawing the user is
   * reinterpreting.
   */
  function setCharMode(code: number, multicolor: boolean): void {
    const project = projects.current
    if (project?.type !== 'mixed' || project.charModes?.[code] === multicolor) return
    const apply = (value: boolean) => {
      const modes = projects.current?.charModes
      if (!modes) return
      modes[code] = value
      projects.markDirty()
    }
    history.execute({
      label: multicolor ? 'Set Multicolor' : 'Set Hires',
      do: () => apply(multicolor),
      undo: () => apply(!multicolor),
    })
  }

  /** Current index of every color slot, for the picker's badges. */
  const slotColors = computed<Record<ColorSlot, number>>(() => {
    const settings = projects.current?.settings
    return {
      screen: settings?.screenColor ?? 1,
      border: settings?.borderColor ?? 3,
      fg: fgColor.value,
      aux: settings?.auxColor ?? 0,
    }
  })

  /**
   * Point a color slot at a palette index. `fg` moves the brush; the other
   * three are project registers and change as undoable commands (D6).
   */
  function setColor(slot: ColorSlot, index: number): void {
    if (!isValidSlotIndex(slot, index)) return
    if (slot === 'fg') {
      fgColor.value = index
      return
    }
    const settings = projects.current?.settings
    const key = slot === 'screen' ? 'screenColor' : slot === 'border' ? 'borderColor' : 'auxColor'
    if (!settings || settings[key] === index) return
    const prev = settings[key]
    const apply = (value: number) => {
      const s = projects.current?.settings
      if (!s) return
      s[key] = value
      projects.markDirty()
    }
    history.execute({
      label: `Set ${SLOT_LABELS[slot]} Color`,
      do: () => apply(index),
      undo: () => apply(prev),
    })
  }

  /** True when reverse mode is on — $900F bit 3 *clear* (PLAN.md §2.2). */
  const reverse = computed(() => projects.current?.settings.reverse ?? false)

  /**
   * Turn reverse mode on or off. It swaps the two colors of every hires cell
   * at once, which makes it a project-wide edit like the color registers, and
   * undoable for the same reason (D6).
   */
  function setReverse(value: boolean): void {
    const settings = projects.current?.settings
    if (!settings || settings.reverse === value) return
    const apply = (next: boolean) => {
      const s = projects.current?.settings
      if (!s) return
      s.reverse = next
      projects.markDirty()
    }
    history.execute({
      label: value ? 'Enable Reverse' : 'Disable Reverse',
      do: () => apply(value),
      undo: () => apply(!value),
    })
  }

  // --- Screens ---

  const currentScreen = computed<Screen | null>(
    () => projects.current?.screens[selectedScreen.value] ?? null,
  )

  const screenCount = computed(() => projects.current?.screens.length ?? 0)

  function selectScreen(index: number): void {
    selectedScreen.value = Math.max(0, Math.min(screenCount.value - 1, index))
  }

  /** Replace one screen's cells and color RAM as an undoable command. */
  function executeScreenChange(label: string, screenIndex: number, next: ScreenData): void {
    const screen = projects.current?.screens[screenIndex]
    if (!screen) return
    const prev: ScreenData = { cells: screen.cells, colors: screen.colors }
    const apply = (data: ScreenData) => {
      const target = projects.current?.screens[screenIndex]
      if (!target) return
      target.cells = data.cells
      target.colors = data.colors
      projects.markDirty()
    }
    history.execute({ label, do: () => apply(next), undo: () => apply(prev) })
  }

  /** Apply a pure transform (screenOps) to the selected screen. */
  function screenTransform(
    label: string,
    fn: (data: ScreenData, columns: number) => ScreenData,
  ): void {
    const project = projects.current
    const screen = currentScreen.value
    if (!project || !screen) return
    executeScreenChange(
      label,
      selectedScreen.value,
      fn({ cells: screen.cells, colors: screen.colors }, project.settings.columns),
    )
  }

  /**
   * What a left stroke writes: the selected character, the brush color, or
   * both, depending on the brush mode (D7).
   */
  const brushPaint = computed<CellPaint>(() =>
    brushPaintFor(brushMode.value, selectedChar.value, fgColor.value),
  )

  /**
   * What a right stroke writes — the same fields the brush would, at their
   * empty values: character 0, and color RAM's power-on value.
   */
  const erasePaint = computed<CellPaint>(() =>
    brushPaintFor(brushMode.value, screenOps.EMPTY_CELL, DEFAULT_FG),
  )

  /** Paint one cell of the selected screen; no-op if it already reads that way. */
  function paintCell(x: number, y: number, paint: CellPaint): void {
    const project = projects.current
    const screen = currentScreen.value
    if (!project || !screen) return
    const { columns } = project.settings
    const data: ScreenData = { cells: screen.cells, colors: screen.colors }
    const current = screenOps.getCell(data, columns, x, y)
    const sameCode = paint.code === undefined || paint.code === current.code
    const sameColor = paint.color === undefined || paint.color === current.color
    if (sameCode && sameColor) return
    executeScreenChange(
      paintLabel(paint),
      selectedScreen.value,
      screenOps.setCell(data, columns, x, y, paint),
    )
  }

  /** Flood the screen with the brush — whichever layers it writes. */
  function fillScreen(): void {
    const paint = brushPaint.value
    screenTransform(paint.code === undefined ? 'Fill Colors' : 'Fill Screen', (data) =>
      screenOps.fill(data, paint),
    )
  }

  /** Empty the layers the brush writes: characters, color RAM, or both. */
  function clearScreen(): void {
    const paint = erasePaint.value
    screenTransform(paint.code === undefined ? 'Reset Colors' : 'Clear Screen', (data) =>
      screenOps.fill(data, paint),
    )
  }

  // --- Geometry (project-wide, D8) ---

  /** The project's current screen geometry in cells. */
  const geometry = computed<Geometry>(() => ({
    columns: projects.current?.settings.columns ?? 0,
    rows: projects.current?.settings.rows ?? 0,
  }))

  /**
   * Characters a resize to `to` would crop, across every screen — the number
   * the confirmation quotes before going ahead (D8).
   */
  function resizeLoss(to: Geometry): number {
    const project = projects.current
    if (!project) return 0
    const from = geometry.value
    return project.screens.reduce(
      (lost, screen) =>
        lost + screenOps.croppedCells({ cells: screen.cells, colors: screen.colors }, from, to),
      0,
    )
  }

  /**
   * Re-fit every screen to a new geometry as one undoable command: columns and
   * rows are registers, so the whole project shares them, and a screen left at
   * the old size would simply be wrong (D8). Content outside the new bounds is
   * cropped — callers confirm first. Returns false when the geometry is one the
   * chip cannot show (D9) or nothing would change.
   */
  function setGeometry(to: Geometry): boolean {
    const project = projects.current
    const from = geometry.value
    if (!project || !validateGeometry(to).ok) return false
    if (to.columns === from.columns && to.rows === from.rows) return false

    const before = project.screens.map<ScreenData>((screen) => ({
      cells: screen.cells,
      colors: screen.colors,
    }))
    const after = before.map((data) => screenOps.resize(data, from, to))
    const apply = (size: Geometry, data: ScreenData[]) => {
      const p = projects.current
      if (!p) return
      p.settings.columns = size.columns
      p.settings.rows = size.rows
      p.screens.forEach((screen, index) => {
        const next = data[index]
        if (!next) return
        screen.cells = next.cells
        screen.colors = next.colors
      })
      projects.markDirty()
    }
    history.execute({
      label: 'Resize Screens',
      do: () => apply(to, after),
      undo: () => apply(from, before),
    })
    return true
  }

  // --- Project settings (Phase 6) ---

  /**
   * Apply a patch to the project's settings as one undoable command. The
   * dialog's register-shaped fields all go through here so they undo alike;
   * the two that also reshape the charset are commands of their own below.
   */
  function executeSettingsChange(label: string, patch: Partial<ProjectSettings>): boolean {
    const settings = projects.current?.settings
    const keys = Object.keys(patch) as (keyof ProjectSettings)[]
    if (!settings || keys.every((key) => settings[key] === patch[key])) return false
    const prev = Object.fromEntries(keys.map((key) => [key, settings[key]])) as Partial<
      typeof settings
    >
    const apply = (values: Partial<ProjectSettings>) => {
      const s = projects.current?.settings
      if (!s) return
      Object.assign(s, values)
      projects.markDirty()
    }
    history.execute({ label, do: () => apply(patch), undo: () => apply(prev) })
    return true
  }

  /** The sixteen register bytes the settings currently describe (D14). */
  const registers = computed<number[]>(() => {
    const settings = projects.current?.settings
    return settings ? registerBytes(settings) : []
  })

  /**
   * NTSC or PAL. It moves the display origins and the practical row count
   * rather than anything in the project's data, so it is a plain setting.
   */
  function setVideo(video: VideoStandard): boolean {
    return executeSettingsChange('Set Video Standard', { video })
  }

  /** Chargen base, $9005 bits 0–3 — a 1 KB-granular selector, not an address. */
  function setCharBase(value: number): boolean {
    if (!Number.isInteger(value) || value < 0 || value > 15) return false
    return executeSettingsChange('Set Character Memory', { charBase: value })
  }

  /** Video matrix base. 512-byte granular, and it drags color RAM with it. */
  function setScreenBase(address: number): boolean {
    if (!Number.isInteger(address) || address < 0 || address % SCREEN_BASE_GRANULARITY) return false
    return executeSettingsChange('Set Screen Memory', { screenBase: address })
  }

  /**
   * Fit an expansion. Deliberately *only* the expansion: where the screen and
   * charset conventionally live for it is offered as a separate command, since
   * silently moving memory the user placed by hand is the surprising half
   * (PLAN.md Phase 6).
   */
  function setExpansion(expansion: Expansion): boolean {
    return executeSettingsChange('Set Expansion', { expansion })
  }

  /** Where the fitted expansion conventionally puts BASIC, screen and charset. */
  const memoryPreset = computed<ExpansionDefaults>(() =>
    defaultsForExpansion(projects.current?.settings.expansion ?? 'none'),
  )

  /** True when the bases already match the preset — nothing to offer. */
  const memoryIsPreset = computed(() => {
    const settings = projects.current?.settings
    if (!settings) return true
    return (
      settings.charBase === memoryPreset.value.charBase &&
      settings.screenBase === memoryPreset.value.screenBase
    )
  })

  /** Take the fitted expansion's conventional bases, in one undoable step. */
  function applyMemoryPreset(): boolean {
    const { charBase, screenBase } = memoryPreset.value
    return executeSettingsChange('Apply Memory Preset', { charBase, screenBase })
  }

  /** Glyphs that would lose drawn rows if the character height shrank (D3). */
  function charHeightLoss(height: CharHeight): number {
    const charset = projects.current?.charset ?? []
    return charset.filter((pattern) => charOps.drawnBelow(pattern, height)).length
  }

  /**
   * Set the character height. It is one register bit, so it applies to every
   * glyph at once: growing pads the new rows blank, shrinking drops them.
   * Callers confirm a shrink first — `charHeightLoss` says how much it costs.
   */
  function setCharHeight(height: CharHeight): boolean {
    const project = projects.current
    if (!project || project.settings.charHeight === height) return false
    const from = project.settings.charHeight
    const before = project.charset.map((pattern) => pattern.slice())
    const after = before.map((pattern) => charOps.setHeight(pattern, height))
    const apply = (value: CharHeight, charset: Charset) => {
      const p = projects.current
      if (!p) return
      p.settings.charHeight = value
      p.charset = charset.map((pattern) => pattern.slice())
      projects.markDirty()
    }
    history.execute({
      label: 'Set Character Height',
      do: () => apply(height, after),
      undo: () => apply(from, before),
    })
    return true
  }

  /** Drawn glyphs a shrink to `count` characters would discard (D4). */
  function charCountLoss(count: CharCount): number {
    const charset = projects.current?.charset ?? []
    return charset.slice(count).filter((pattern) => !charOps.isBlank(pattern)).length
  }

  /**
   * Resize the character set (D4). Screens are left alone: a screen code is a
   * full byte whatever the set holds, so shrinking hides characters from the
   * picker rather than rewriting the screens that use them.
   */
  function setCharCount(count: CharCount): boolean {
    const project = projects.current
    if (!project || project.settings.charCount === count) return false
    const from = project.settings.charCount
    const height = project.settings.charHeight
    const before = project.charset.map((pattern) => pattern.slice())
    const beforeModes = project.charModes?.slice()
    const after: Charset = Array.from(
      { length: count },
      (_, code) => before[code]?.slice() ?? blankPattern(height),
    )
    const afterModes = beforeModes
      ? Array.from({ length: count }, (_, code) => beforeModes[code] ?? false)
      : undefined
    const apply = (value: CharCount, charset: Charset, modes: boolean[] | undefined) => {
      const p = projects.current
      if (!p) return
      p.settings.charCount = value
      p.charset = charset.map((pattern) => pattern.slice())
      if (modes) p.charModes = modes.slice()
      selectedChar.value = Math.min(selectedChar.value, value - 1)
      projects.markDirty()
    }
    history.execute({
      label: 'Set Character Count',
      do: () => apply(count, after, afterModes),
      undo: () => apply(from, before, beforeModes),
    })
    return true
  }

  function addScreen(): void {
    const project = projects.current
    if (!project) return
    const index = project.screens.length
    const screen = blankScreen(`Screen ${index + 1}`, project.settings)
    const apply = (insert: boolean) => {
      const p = projects.current
      if (!p) return
      if (insert) {
        p.screens.splice(index, 0, screen)
        selectedScreen.value = index
      } else {
        p.screens.splice(index, 1)
        selectScreen(selectedScreen.value)
      }
      projects.markDirty()
    }
    history.execute({ label: 'Add Screen', do: () => apply(true), undo: () => apply(false) })
  }

  /** Remove a screen (callers confirm first). The last screen cannot be removed. */
  function removeScreen(index: number): void {
    const project = projects.current
    const screen = project?.screens[index]
    if (!project || !screen || project.screens.length <= 1) return
    const apply = (restore: boolean) => {
      const p = projects.current
      if (!p) return
      if (restore) {
        p.screens.splice(index, 0, screen)
        selectedScreen.value = index
      } else {
        p.screens.splice(index, 1)
        selectScreen(selectedScreen.value)
      }
      projects.markDirty()
    }
    history.execute({ label: 'Delete Screen', do: () => apply(false), undo: () => apply(true) })
  }

  function renameScreen(index: number, name: string): void {
    const screen = projects.current?.screens[index]
    if (!screen || !name || screen.name === name) return
    const prev = screen.name
    const apply = (value: string) => {
      const s = projects.current?.screens[index]
      if (!s) return
      s.name = value
      projects.markDirty()
    }
    history.execute({ label: 'Rename Screen', do: () => apply(name), undo: () => apply(prev) })
  }

  // --- Undo / redo ---

  function undo(): string | null {
    return history.undo()
  }

  function redo(): string | null {
    return history.redo()
  }

  return {
    selectedChar,
    selectedScreen,
    screenScale,
    showGrid,
    brushMode,
    brushPaint,
    erasePaint,
    geometry,
    screenZoomedManually,
    currentPattern,
    currentShape,
    currentScreen,
    screenCount,
    fgColor,
    slotColors,
    activeSlot,
    targetSlot,
    currentSlots,
    reverse,
    activeValue,
    backgroundValue,
    currentMulticolor,
    setActiveSlot,
    setCharMode,
    zoomScreen,
    fitScreenScale,
    toggleGrid,
    setBrushMode,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    reset,
    selectChar,
    selectScreen,
    setColor,
    setReverse,
    transform,
    applyTransform,
    transformEnabled,
    transformReason,
    setCharPattern,
    beginStroke,
    endStroke,
    paintPixel,
    screenTransform,
    paintCell,
    fillScreen,
    clearScreen,
    resizeLoss,
    setGeometry,
    registers,
    memoryPreset,
    memoryIsPreset,
    applyMemoryPreset,
    setVideo,
    setExpansion,
    setCharBase,
    setScreenBase,
    charHeightLoss,
    setCharHeight,
    charCountLoss,
    setCharCount,
    addScreen,
    removeScreen,
    renameScreen,
    undo,
    redo,
  }
})
