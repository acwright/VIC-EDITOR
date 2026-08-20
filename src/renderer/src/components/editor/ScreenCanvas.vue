<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watchEffect } from 'vue'
import { defaultSettings } from '@/domain/factory'
import { formatScreenStatus, screenStatus, type PointerCell } from '@/domain/screenStatus'
import type { CellPaint } from '@/domain/screenOps'
import { renderScreen, screenPixelSize } from '@/utils/screenRender'
import { BRUSH_MODES, useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'

const props = withDefaults(
  defineProps<{
    /** Display scale, 1–8 (logical pixel → CSS pixels) */
    scale: number
    showGrid: boolean
    /**
     * Horizontal stretch: 1 draws square pixels, ~1.5 the shape a VIC pixel
     * actually has on a 4:3 display. Only the CSS width changes — the canvas
     * still holds one logical pixel per screen pixel, so painting, the grid
     * and the cursor all keep working off the element's proportions.
     */
    aspect?: number
  }>(),
  { aspect: 1 },
)

/** The cell under the pointer, or null once it leaves — drives the status bar. */
const emit = defineEmits<{ hover: [PointerCell | null] }>()

const projects = useProjectsStore()
const editor = useEditorStore()

/** Geometry is a project setting now — columns, rows and char height (D8). */
const geometry = computed(() => projects.current?.settings ?? defaultSettings())
const size = computed(() =>
  projects.current ? screenPixelSize(projects.current) : { width: 0, height: 0 },
)
const logicalWidth = computed(() => size.value.width)
const logicalHeight = computed(() => size.value.height)

const canvas = useTemplateRef('canvas')

watchEffect(
  () => {
    const project = projects.current
    const screen = editor.currentScreen
    const ctx = canvas.value?.getContext('2d')
    if (!project || !screen || !ctx) return
    renderScreen(ctx, project, screen)
  },
  { flush: 'post' },
)

// --- Painting ---
//
// Left paints the brush, right erases — each writing whichever layers the brush
// mode covers: the character, its color RAM value, or both (PLAN.md D7). A
// right-drag in Color mode therefore resets color RAM without touching the
// characters it sits under.

/** The paint the active drag is applying; null when not dragging. */
const painting = ref<CellPaint | null>(null)
let lastCell = -1

function cellAt(event: PointerEvent): { x: number; y: number } | null {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const { columns, rows } = geometry.value
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * columns)
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * rows)
  if (x < 0 || x >= columns || y < 0 || y >= rows) return null
  return { x, y }
}

/** Touch/pen leave no pointer behind, so their strokes end the hover readout. */
let lastPointerType = 'mouse'

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 && event.button !== 2) return
  event.preventDefault()
  lastPointerType = event.pointerType
  const cell = cellAt(event)
  emit('hover', cell)
  if (!cell) return
  // Capture so touch drags keep reporting to the canvas even off its bounds
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  const paint = event.button === 2 ? editor.erasePaint : editor.brushPaint
  painting.value = paint
  lastCell = cell.y * geometry.value.columns + cell.x
  editor.beginStroke(event.button === 2 ? 'Erase' : 'Draw')
  editor.paintCell(cell.x, cell.y, paint)
}

function onPointerMove(event: PointerEvent) {
  lastPointerType = event.pointerType
  const cell = cellAt(event)
  emit('hover', cell)
  if (painting.value === null || !cell) return
  const index = cell.y * geometry.value.columns + cell.x
  if (index === lastCell) return
  lastCell = index
  editor.paintCell(cell.x, cell.y, painting.value)
}

function endStroke() {
  if (painting.value === null) return
  painting.value = null
  lastCell = -1
  editor.endStroke()
  if (lastPointerType !== 'mouse') emit('hover', null)
}

// End the stroke even when the pointer is released outside the canvas
window.addEventListener('pointerup', endStroke)
onBeforeUnmount(() => window.removeEventListener('pointerup', endStroke))

// --- Keyboard cursor ---
//
// The canvas is a control, not a picture, so it takes focus and answers to the
// keyboard (PLAN.md Phase 11): arrows move a cursor cell, Enter/Space paints it
// with the brush, Backspace/Delete erases it. The keys it consumes are stopped
// here so the window-level shortcut map never sees them — arrows mean "move the
// cursor" only while the canvas holds focus.

/** The keyboard cursor's cell, or null before the first arrow press. */
const cursor = ref<PointerCell | null>(null)

function moveCursor(dx: number, dy: number) {
  const { columns, rows } = geometry.value
  const from = cursor.value ?? { x: 0, y: 0 }
  const next = {
    x: Math.max(0, Math.min(columns - 1, from.x + dx)),
    y: Math.max(0, Math.min(rows - 1, from.y + dy)),
  }
  // The first press lands the cursor rather than moving it off the origin
  cursor.value = cursor.value ? next : from
  emit('hover', cursor.value)
}

function paintCursor(paint: CellPaint, label: string) {
  const cell = cursor.value
  if (!cell) return
  // One key press, one undo entry — the same shape a drag has
  editor.beginStroke(label)
  editor.paintCell(cell.x, cell.y, paint)
  editor.endStroke()
}

function onKeydown(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const { columns } = geometry.value
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
      moveCursor(-columns, 0)
      break
    case 'End':
      moveCursor(columns, 0)
      break
    case 'Enter':
    case ' ':
      paintCursor(editor.brushPaint, 'Draw')
      break
    case 'Backspace':
    case 'Delete':
      paintCursor(editor.erasePaint, 'Erase')
      break
    case 'Escape':
      // Only when there is a cursor to dismiss; otherwise Esc still leaves the
      // editor, which is what it does everywhere else.
      if (!cursor.value) return
      cursor.value = null
      emit('hover', null)
      break
    default:
      return
  }
  event.preventDefault()
  event.stopPropagation()
}

/** Outline marking the cursor cell, sized as a share of the grid. */
const cursorStyle = computed(() => {
  const cell = cursor.value
  const { columns, rows } = geometry.value
  if (!cell) return null
  return {
    left: `${(cell.x / columns) * 100}%`,
    top: `${(cell.y / rows) * 100}%`,
    width: `${100 / columns}%`,
    height: `${100 / rows}%`,
  }
})

/**
 * The cursor cell, spelled out for a screen reader. Pointer hover deliberately
 * does not feed this — it would announce every cell crossed — so the live
 * region tracks the keyboard cursor only.
 */
const cursorStatus = computed(() => {
  const project = projects.current
  if (!project || !cursor.value) return ''
  return formatScreenStatus(screenStatus(project, editor.currentScreen, cursor.value))
})

/** Says what the brush is about to do — it changes with the mode. */
const canvasLabel = computed(() => {
  const mode = BRUSH_MODES.find((entry) => entry.mode === editor.brushMode)
  return `Screen editor — brush: ${mode?.label ?? 'Character'}. ${mode?.hint ?? ''} Left-click paints, right-click erases. With the canvas focused, arrow keys move a cursor, Enter paints it and Delete erases it.`
})

const gridStyle = computed(() => ({
  backgroundImage:
    'linear-gradient(to right, rgb(255 255 255 / 0.18) 1px, transparent 1px), ' +
    'linear-gradient(to bottom, rgb(255 255 255 / 0.18) 1px, transparent 1px)',
  backgroundSize: `${100 / geometry.value.columns}% ${100 / geometry.value.rows}%`,
}))
</script>

<template>
  <div class="relative w-fit border border-ink-700">
    <canvas
      ref="canvas"
      :width="logicalWidth"
      :height="logicalHeight"
      class="block cursor-crosshair touch-none [image-rendering:pixelated] select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300"
      :style="{
        width: `${logicalWidth * scale * props.aspect}px`,
        height: `${logicalHeight * scale}px`,
      }"
      tabindex="0"
      role="application"
      :aria-label="canvasLabel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerleave="emit('hover', null)"
      @keydown="onKeydown"
      @contextmenu.prevent
    />
    <div v-if="showGrid" class="pointer-events-none absolute inset-0" :style="gridStyle" />
    <!-- Two rings, light over dark, so the cursor shows over any cell color -->
    <div
      v-if="cursorStyle"
      class="pointer-events-none absolute border-2 border-ink-50 outline outline-black/70"
      :style="cursorStyle"
    />
    <p class="sr-only" aria-live="polite">{{ cursorStatus }}</p>
  </div>
</template>
