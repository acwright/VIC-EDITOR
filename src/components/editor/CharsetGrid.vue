<script setup lang="ts">
import { computed, useTemplateRef, watchEffect } from 'vue'
import { cellColorHexes, colorHex } from '@/domain/colors'
import { CELL_SCREEN_WIDTH, cellShape, isCharMulticolor } from '@/domain/modes'
import { drawCell } from '@/utils/screenRender'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'

const props = withDefaults(
  defineProps<{
    /** First character code in this grid (0 or 128). */
    startCode: number
    /** How many characters this grid shows — the project's char count, or half of it. */
    count: number
    /**
     * Which axis the glyphs are sized from. `height` scales the block to the
     * space it is given (the Blocks view); `width` fixes it to the column and
     * lets it run as tall as it needs, for a caller that scrolls it.
     */
    fit?: 'height' | 'width'
  }>(),
  { fit: 'height' },
)

const projects = useProjectsStore()
const editor = useEditorStore()

const COLUMNS = 8
/**
 * Widest a glyph gets in the width-fitted view. Without it a wide column
 * stretches eight glyphs across it at ten times life size, which is a lot of
 * scrolling for a set you are trying to see.
 */
const MAX_CELL_PX = 48
const SCALE = 3

const rows = computed(() => Math.ceil(props.count / COLUMNS))

/** Cell height follows the project's char height (8 or 16 rows). */
const cellHeight = computed(() => projects.current?.settings.charHeight ?? 8)
const logicalWidth = COLUMNS * CELL_SCREEN_WIDTH
const logicalHeight = computed(() => rows.value * cellHeight.value)

const canvas = useTemplateRef('canvas')

// Full re-render — cheap enough (≤128 chars) and tracks every pattern/color read
watchEffect(
  () => {
    const project = projects.current
    const ctx = canvas.value?.getContext('2d')
    if (!project || !ctx) return
    ctx.fillStyle = colorHex(project.settings.screenColor)
    ctx.fillRect(0, 0, logicalWidth, logicalHeight.value)
    for (let i = 0; i < props.count; i++) {
      const code = props.startCode + i
      const pattern = project.charset[code]
      if (!pattern) continue
      const shape = cellShape(project, code)
      // Glyphs have no color of their own; preview them in the brush color.
      const colors = cellColorHexes(project, editor.fgColor, isCharMulticolor(project, code))
      drawCell(
        ctx,
        pattern,
        shape,
        colors,
        (i % COLUMNS) * CELL_SCREEN_WIDTH,
        Math.floor(i / COLUMNS) * shape.height,
      )
    }
  },
  { flush: 'post' },
)

function onPointerDown(event: PointerEvent) {
  // The canvas scales with the viewport — derive cell size from its rendered rect
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const col = Math.floor(((event.clientX - rect.left) / rect.width) * COLUMNS)
  const row = Math.floor(((event.clientY - rect.top) / rect.height) * rows.value)
  if (col < 0 || col >= COLUMNS || row < 0 || row >= rows.value) return
  const index = row * COLUMNS + col
  if (index >= props.count) return
  editor.selectChar(props.startCode + index)
}

// --- Keyboard selection ---
//
// The picker is a canvas, so it has no buttons to tab through: it takes focus
// as one control and moves the selection with the arrows (PLAN.md Phase 11).
// `[` and `]` still walk the whole set from anywhere; these keys walk this
// grid, which is what a 128-glyph block of them is for.
function onKeydown(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const index = editor.selectedChar - props.startCode
  const inGrid = index >= 0 && index < props.count
  let next: number
  switch (event.key) {
    case 'ArrowLeft':
      next = index - 1
      break
    case 'ArrowRight':
      next = index + 1
      break
    case 'ArrowUp':
      next = index - COLUMNS
      break
    case 'ArrowDown':
      next = index + COLUMNS
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = props.count - 1
      break
    default:
      return
  }
  event.preventDefault()
  event.stopPropagation()
  // The selection lives in the other block: the first press claims it here
  // rather than stepping off from a code this grid doesn't show.
  if (!inGrid) next = 0
  // Clamped to this grid — the neighboring block has its own focus stop
  editor.selectChar(props.startCode + Math.max(0, Math.min(props.count - 1, next)))
}

const hasSelection = computed(
  () =>
    editor.selectedChar >= props.startCode && editor.selectedChar < props.startCode + props.count,
)

// Overlays are percentage-positioned so they track the scaled canvas
const gridStyle = computed(() => ({
  backgroundImage:
    'linear-gradient(to right, rgb(255 255 255 / 0.14) 1px, transparent 1px), ' +
    'linear-gradient(to bottom, rgb(255 255 255 / 0.14) 1px, transparent 1px)',
  backgroundSize: `${100 / COLUMNS}% ${100 / rows.value}%`,
}))

function cellRect(index: number) {
  return {
    left: `${((index % COLUMNS) / COLUMNS) * 100}%`,
    top: `${(Math.floor(index / COLUMNS) / rows.value) * 100}%`,
    width: `${100 / COLUMNS}%`,
    height: `${100 / rows.value}%`,
  }
}

const ringStyle = computed(() => cellRect(editor.selectedChar - props.startCode))

/**
 * Corner badges marking the multicolor characters of a `mixed` project (D2).
 * The glyph itself often can't say which it is — a 4-wide drawing read as
 * 8 one-bit pixels is still a picture, just the wrong one.
 */
const multicolorBadges = computed(() => {
  const project = projects.current
  if (project?.type !== 'mixed') return []
  const badges: { code: number; style: Record<string, string> }[] = []
  for (let i = 0; i < props.count; i++) {
    const code = props.startCode + i
    if (isCharMulticolor(project, code)) badges.push({ code, style: cellRect(i) })
  }
  return badges
})
</script>

<template>
  <!-- Height-driven: shrinks with the available space, capped at ×3 scale.
       Width-driven: fills the column, as tall as the glyphs make it. -->
  <div
    class="relative rounded-sm border border-ink-700"
    :class="fit === 'height' ? 'h-full min-h-32 w-fit' : 'mx-auto w-full'"
    :style="
      fit === 'height'
        ? { maxHeight: `${logicalHeight * SCALE}px` }
        : { maxWidth: `${COLUMNS * MAX_CELL_PX}px` }
    "
  >
    <canvas
      ref="canvas"
      :width="logicalWidth"
      :height="logicalHeight"
      class="block cursor-pointer [image-rendering:pixelated] select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300"
      :class="fit === 'height' ? 'h-full w-auto' : 'h-auto w-full'"
      tabindex="0"
      role="application"
      :aria-label="`Characters ${startCode}–${startCode + count - 1} — click to select, or focus this grid and use the arrow keys`"
      @pointerdown="onPointerDown"
      @keydown="onKeydown"
      @contextmenu.prevent
    />
    <!-- Per-cell grid overlay -->
    <div class="pointer-events-none absolute inset-0" :style="gridStyle" />
    <div
      v-for="badge in multicolorBadges"
      :key="badge.code"
      class="pointer-events-none absolute"
      :style="badge.style"
      :title="`Character ${badge.code} is multicolor`"
    >
      <!-- A notched top-right corner: unmistakable at 24px, unobtrusive at 8px -->
      <div
        class="absolute top-0 right-0 size-1/4 bg-warn"
        style="clip-path: polygon(100% 0, 0 0, 100% 100%)"
      />
    </div>
    <div
      v-if="hasSelection"
      class="pointer-events-none absolute border-2 border-ink-50 outline outline-black/70"
      :style="ringStyle"
    />
  </div>
</template>
