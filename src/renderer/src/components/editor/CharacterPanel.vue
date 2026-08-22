<script setup lang="ts">
import { computed } from 'vue'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Contrast,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  PaintBucket,
  RotateCcw,
  RotateCw,
} from 'lucide-vue-next'
import AppButton from '@/components/base/AppButton.vue'
import AppHint from '@/components/base/AppHint.vue'
import CharBytesBox from './CharBytesBox.vue'
import ColorPicker from './ColorPicker.vue'
import PixelEditor from './PixelEditor.vue'
import * as charOps from '@/domain/charOps'
import { cellColorHexes } from '@/domain/colors'
import { CELL_SCREEN_WIDTH } from '@/domain/modes'
import { useEditorStore, type TransformName } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'
import { shortcutLabel } from '@/utils/shortcuts'

const projects = useProjectsStore()
const editor = useEditorStore()

/** Pixel grid of the selected character: 8 or 4 wide, 8 or 16 tall (D3, D10). */
const shape = computed(() => editor.currentShape)

/** True in a `mixed` project, where each character picks its own rendering (D2). */
const perCharMode = computed(() => projects.current?.type === 'mixed')

/**
 * The color each pixel *value* draws, in value order. The character itself has
 * no color — this is the brush color over the screen color, the pair (or
 * quartet) a cell holding it would resolve to (PLAN.md D7).
 */
const palette = computed(() => {
  const project = projects.current
  if (!project) return []
  return cellColorHexes(project, editor.fgColor, editor.currentMulticolor)
})

/** Pixel values of the selected character, row-major. */
const values = computed(() => {
  const pattern = editor.currentPattern
  const cell = shape.value
  if (!pattern || !cell) return []
  return Array.from({ length: cell.width * cell.height }, (_, i) =>
    charOps.getPixel(pattern, cell, i % cell.width, Math.floor(i / cell.width)),
  )
})

/**
 * The editor box, in rem. A tall character keeps the cell's real 8 : height
 * proportions rather than stretching, so it gets narrower instead of taller
 * than the column allows.
 */
const MAX_WIDTH_REM = 20
const MAX_HEIGHT_REM = 24

const editorStyle = computed(() => {
  const height = shape.value?.height ?? 8
  const width = Math.min(MAX_WIDTH_REM, (MAX_HEIGHT_REM * CELL_SCREEN_WIDTH) / height)
  return { width: `${width}rem` }
})

/** Button label, carrying the reason when the cell forbids the transform. */
function transformLabel(name: TransformName, label: string): string {
  const reason = editor.transformReason(name, shape.value)
  return reason ? `${label} — ${reason}` : label
}

const charLabel = computed(() => {
  const code = editor.selectedChar
  return `#${code} · $${code.toString(16).toUpperCase().padStart(2, '0')}`
})
</script>

<template>
  <section
    v-if="editor.currentPattern"
    class="flex w-full flex-col gap-3 lg:w-fit"
    aria-label="Character editor"
  >
    <!-- Whole-character actions sit in the header beside the stepper: they were
         a row of their own under the palette, and that row is a band of the
         character set below. -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-xl">Character</h2>
      <!-- ml-auto keeps the controls right-aligned on the line of their own they
           take on a phone, where they and the heading don't fit side by side -->
      <div class="ml-auto flex flex-wrap items-center justify-end gap-1.5">
        <div class="flex gap-1">
          <AppButton
            label="Fill"
            :shortcut="shortcutLabel('fill')"
            @click="editor.applyTransform('fill')"
          >
            <PaintBucket class="size-4" />
          </AppButton>
          <AppButton
            label="Clear"
            :shortcut="shortcutLabel('clear')"
            @click="editor.applyTransform('clear')"
          >
            <Eraser class="size-4" />
          </AppButton>
          <!-- Hidden rather than greyed where the cell has no complement: the
               rotations sit in the grid frame and would leave a hole, but this
               group just closes up (the `I` key is inert there either way). -->
          <AppButton
            v-if="editor.transformEnabled('invert', shape)"
            label="Invert"
            :shortcut="shortcutLabel('invert')"
            @click="editor.applyTransform('invert')"
          >
            <Contrast class="size-4" />
          </AppButton>
        </div>
        <div class="mx-0.5 h-6 w-px bg-ink-800" />
        <AppButton
          label="Previous Character"
          :shortcut="shortcutLabel('prevChar')"
          @click="editor.selectChar(editor.selectedChar - 1)"
        >
          <ChevronLeft class="size-4" />
        </AppButton>
        <span class="w-20 text-center font-mono text-xs text-ink-300">{{ charLabel }}</span>
        <AppButton
          label="Next Character"
          :shortcut="shortcutLabel('nextChar')"
          @click="editor.selectChar(editor.selectedChar + 1)"
        >
          <ChevronRight class="size-4" />
        </AppButton>
      </div>
    </div>

    <!-- The editor stack keeps its own width and centres in the column, while
         the heading row above spans it: that is the shape of the picker below,
         whose title sits at the column's left edge and whose grid is centred. -->
    <div class="mx-auto flex w-fit flex-col gap-3">
      <!-- Directional transforms frame the grid: shifts on each side,
           rotates flanking shift-up, flips flanking shift-down.
           mx-auto keeps the editor centerd if anything below it ends up wider. -->
      <div class="mx-auto grid w-fit grid-cols-[auto_auto_auto] items-center gap-2">
        <AppButton
          :label="transformLabel('rotateLeft', 'Rotate Left')"
          :shortcut="shortcutLabel('rotateLeft')"
          :disabled="!editor.transformEnabled('rotateLeft', shape)"
          @click="editor.applyTransform('rotateLeft')"
        >
          <RotateCcw class="size-4" />
        </AppButton>
        <div class="flex justify-center">
          <AppButton
            label="Shift Up"
            :shortcut="shortcutLabel('shiftUp')"
            @click="editor.applyTransform('shiftUp')"
          >
            <ArrowUp class="size-4" />
          </AppButton>
        </div>
        <div class="flex justify-end">
          <AppButton
            :label="transformLabel('rotateRight', 'Rotate Right')"
            :shortcut="shortcutLabel('rotateRight')"
            :disabled="!editor.transformEnabled('rotateRight', shape)"
            @click="editor.applyTransform('rotateRight')"
          >
            <RotateCw class="size-4" />
          </AppButton>
        </div>

        <AppButton
          label="Shift Left"
          :shortcut="shortcutLabel('shiftLeft')"
          @click="editor.applyTransform('shiftLeft')"
        >
          <ArrowLeft class="size-4" />
        </AppButton>
        <!-- Centerd so the shift buttons keep their places as the box narrows -->
        <div class="flex min-w-0 justify-center">
          <!-- max-w-full is what lets w-fit above clamp to a phone: the rem width
               alone pinned the row wider than the screen and the shift and flip
               buttons went under the edge, with the column's overflow-x-hidden
               leaving no way to scroll to them -->
          <div class="max-w-full min-w-0" :style="editorStyle">
            <PixelEditor
              v-if="shape"
              :values="values"
              :shape="shape"
              :palette="palette"
              :active-value="editor.activeValue"
              :background-value="editor.backgroundValue"
              @stroke-start="editor.beginStroke('Draw')"
              @paint="(x, y, value) => editor.paintPixel(x, y, value)"
              @stroke-end="editor.endStroke()"
            />
          </div>
        </div>
        <div class="flex justify-end">
          <AppButton
            label="Shift Right"
            :shortcut="shortcutLabel('shiftRight')"
            @click="editor.applyTransform('shiftRight')"
          >
            <ArrowRight class="size-4" />
          </AppButton>
        </div>

        <AppButton
          label="Flip Horizontal"
          :shortcut="shortcutLabel('flipH')"
          @click="editor.applyTransform('flipH')"
        >
          <FlipHorizontal2 class="size-4" />
        </AppButton>
        <div class="flex justify-center">
          <AppButton
            label="Shift Down"
            :shortcut="shortcutLabel('shiftDown')"
            @click="editor.applyTransform('shiftDown')"
          >
            <ArrowDown class="size-4" />
          </AppButton>
        </div>
        <div class="flex justify-end">
          <AppButton
            label="Flip Vertical"
            :shortcut="shortcutLabel('flipV')"
            @click="editor.applyTransform('flipV')"
          >
            <FlipVertical2 class="size-4" />
          </AppButton>
        </div>
      </div>

      <!-- `mixed` only: the character's own rendering, color RAM bit 3 (D2).
           The explanation is a hint rather than a standing line: it is read once,
           and a line of it here is a line off the character set below. -->
      <div v-if="perCharMode" class="flex items-center gap-1.5">
        <span class="font-display text-base tracking-wider text-ink-300">Renders as</span>
        <AppHint
          text="Switching re-reads the same bytes — 8 one-bit pixels or 4 two-bit ones. Nothing is rewritten."
        />
        <div class="ml-auto flex gap-1" role="radiogroup" aria-label="Character rendering">
          <button
            v-for="option in [
              { multicolor: false, label: 'Hires' },
              { multicolor: true, label: 'Multicolor' },
            ]"
            :key="option.label"
            type="button"
            class="font-display rounded-sm border px-2 py-1 text-sm tracking-wider transition-colors"
            :class="
              editor.currentMulticolor === option.multicolor
                ? 'border-ink-300 bg-ink-100 text-ink-950'
                : 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-500'
            "
            role="radio"
            :aria-checked="editor.currentMulticolor === option.multicolor"
            :aria-label="`Render as ${option.label}`"
            @click="editor.setCharMode(editor.selectedChar, option.multicolor)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <ColorPicker />

      <CharBytesBox :bytes="editor.currentPattern" />
    </div>
  </section>
</template>
