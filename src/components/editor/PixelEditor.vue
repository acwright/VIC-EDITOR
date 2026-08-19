<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { CELL_SCREEN_WIDTH, type CellShape } from '@/domain/modes'

/**
 * A character's pixel grid, at whatever shape the project gives it: 8 × 8 or
 * 8 × 16 hires, 4 × 8 or 4 × 16 multicolor (PLAN.md D3, D10). The grid always
 * fills the same box, so a multicolor cell's four pixels each come out double
 * width — exactly what the VIC does to them on screen.
 *
 * Purely presentational: the parent supplies the pixel *values* and the color
 * each value draws, and receives `paint` events carrying the new value. Left
 * click paints `activeValue`, right click `backgroundValue` (the screen
 * color), and left-clicking a pixel that already holds the active value clears
 * it — the toggle that makes single-color drawing feel like a pencil.
 */
const props = defineProps<{
  /** Pixel values, row-major, `shape.width × shape.height` entries. */
  values: number[]
  shape: CellShape
  /** Hex color of each pixel value, in value order (2 or 4 entries). */
  palette: string[]
  /** Pixel value a left click paints. */
  activeValue: number
  /** Pixel value a right click paints, and a left click toggles back to. */
  backgroundValue: number
}>()

const emit = defineEmits<{
  strokeStart: []
  paint: [x: number, y: number, value: number]
  strokeEnd: []
}>()

const cells = computed(() =>
  Array.from({ length: props.shape.width * props.shape.height }, (_, i) => ({
    x: i % props.shape.width,
    y: Math.floor(i / props.shape.width),
  })),
)

// The box is 8 screen pixels wide whatever the bit depth; the rows stretch to
// fill it, so 4-wide multicolor pixels land at 2× the width of hires ones.
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${props.shape.width}, minmax(0, 1fr))`,
  gridTemplateRows: `repeat(${props.shape.height}, minmax(0, 1fr))`,
  aspectRatio: `${CELL_SCREEN_WIDTH} / ${props.shape.height}`,
}))

const grid = useTemplateRef('grid')

/** Pixel value currently being painted by a drag; null when not dragging. */
const painting = ref<number | null>(null)
let lastCell = -1

function valueAt(x: number, y: number): number {
  return props.values[y * props.shape.width + x] ?? 0
}

// Pointer position → cell. Computed from the grid rect so it works for both
// mouse and touch drags (touch fires pointermove on the capturing element
// only, so per-cell pointerenter can't drive touch strokes).
function cellAt(event: PointerEvent): { x: number; y: number } | null {
  const rect = grid.value?.getBoundingClientRect()
  if (!rect) return null
  const { width, height } = props.shape
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * width)
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * height)
  if (x < 0 || x >= width || y < 0 || y >= height) return null
  return { x, y }
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 && event.button !== 2) return
  const cell = cellAt(event)
  if (!cell) return
  event.preventDefault()
  grid.value?.setPointerCapture(event.pointerId)
  const held = valueAt(cell.x, cell.y)
  const value =
    event.button === 2 || held === props.activeValue ? props.backgroundValue : props.activeValue
  painting.value = value
  lastCell = cell.y * props.shape.width + cell.x
  emit('strokeStart')
  emit('paint', cell.x, cell.y, value)
}

function onPointerMove(event: PointerEvent) {
  if (painting.value === null) return
  const cell = cellAt(event)
  if (!cell) return
  const index = cell.y * props.shape.width + cell.x
  if (index === lastCell) return
  lastCell = index
  emit('paint', cell.x, cell.y, painting.value)
}

function endStroke() {
  if (painting.value === null) return
  painting.value = null
  lastCell = -1
  emit('strokeEnd')
}

// End the stroke even when the pointer is released outside the grid
window.addEventListener('pointerup', endStroke)
onBeforeUnmount(() => window.removeEventListener('pointerup', endStroke))

function cellStyle(x: number, y: number): { backgroundColor: string } {
  const value = valueAt(x, y)
  return { backgroundColor: props.palette[value] ?? props.palette[0] ?? '#000000' }
}

// --- Keyboard cursor ---
//
// The grid takes focus and draws from the keyboard as well as the pointer
// (PLAN.md Phase 11): arrows move a cursor pixel, Enter/Space paints it with
// the same toggle a click has, Backspace/Delete puts the screen color back.
// Consumed keys stop here so the editor's window-level map never sees them.

const cursor = ref<{ x: number; y: number } | null>(null)

function moveCursor(dx: number, dy: number) {
  const { width, height } = props.shape
  const from = cursor.value ?? { x: 0, y: 0 }
  cursor.value = cursor.value
    ? {
        x: Math.max(0, Math.min(width - 1, from.x + dx)),
        y: Math.max(0, Math.min(height - 1, from.y + dy)),
      }
    : from
}

/** Paint the cursor pixel as its own undo entry. */
function paintCursor(value: number) {
  const cell = cursor.value
  if (!cell) return
  emit('strokeStart')
  emit('paint', cell.x, cell.y, value)
  emit('strokeEnd')
}

function onKeydown(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const { width } = props.shape
  switch (event.key) {
    case 'ArrowLeft':
      moveCursor(-1, 0)
      break
    case 'ArrowRight':
      moveCursor(1, 0)
      break
    case 'ArrowUp':
      moveCursor(0, -1)
      break
    case 'ArrowDown':
      moveCursor(0, 1)
      break
    case 'Home':
      moveCursor(-width, 0)
      break
    case 'End':
      moveCursor(width, 0)
      break
    case 'Enter':
    case ' ': {
      const cell = cursor.value
      if (!cell) break
      // The click's toggle: pressing the value already held clears it
      const held = valueAt(cell.x, cell.y)
      paintCursor(held === props.activeValue ? props.backgroundValue : props.activeValue)
      break
    }
    case 'Backspace':
    case 'Delete':
      paintCursor(props.backgroundValue)
      break
    case 'Escape':
      if (!cursor.value) return
      cursor.value = null
      break
    default:
      return
  }
  event.preventDefault()
  event.stopPropagation()
}

/** True for the pixel the cursor is on, which gets the marker ring. */
function isCursor(x: number, y: number): boolean {
  return cursor.value?.x === x && cursor.value?.y === y
}

/** The cursor pixel, spelled out for a screen reader. */
const cursorStatus = computed(() => {
  const cell = cursor.value
  if (!cell) return ''
  return `X ${cell.x}, Y ${cell.y} — pixel value ${valueAt(cell.x, cell.y)}`
})

/** A cell shorter than the cursor's reach is no place to leave it. */
watch(
  () => props.shape,
  () => (cursor.value = null),
)
</script>

<template>
  <!-- Wrapper so the live region is not a child of the grid — every child of
       the grid is a pixel -->
  <div class="relative w-full">
    <div
      ref="grid"
      class="relative grid w-full cursor-crosshair gap-px border border-ink-700 bg-ink-700 touch-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300"
      :style="gridStyle"
      tabindex="0"
      role="application"
      aria-label="Pixel editor — draw to toggle pixels. With the grid focused, arrow keys move a cursor, Enter paints it and Delete clears it."
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @keydown="onKeydown"
      @contextmenu.prevent
    >
      <div
        v-for="cell in cells"
        :key="`${cell.x},${cell.y}`"
        class="pointer-events-none relative"
        :style="cellStyle(cell.x, cell.y)"
      >
        <!-- Two rings, light over dark, so the cursor shows over any pixel color -->
        <span
          v-if="isCursor(cell.x, cell.y)"
          class="absolute inset-0 border-2 border-ink-50 outline outline-black/70"
        />
      </div>
    </div>
    <p class="sr-only" aria-live="polite">{{ cursorStatus }}</p>
  </div>
</template>
