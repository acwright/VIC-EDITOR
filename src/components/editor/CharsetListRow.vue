<script setup lang="ts">
import { computed, useTemplateRef, watchEffect } from 'vue'
import { cellColorHexes, colorHex } from '@/domain/colors'
import { CELL_SCREEN_WIDTH, cellShape, isCharMulticolor } from '@/domain/modes'
import { drawCell } from '@/utils/screenRender'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'

/**
 * One row of the list view: the glyph, its code in both bases, and the two
 * facts the picture cannot show — whether the character is drawn at all, and
 * which way a `mixed` project renders it (D2).
 */
const props = defineProps<{ code: number }>()

const projects = useProjectsStore()
const editor = useEditorStore()

/** Rendered at 3×, the size the blocks view caps at, so glyphs read the same. */
const SCALE = 3

const charHeight = computed(() => projects.current?.settings.charHeight ?? 8)
const pattern = computed(() => projects.current?.charset[props.code])
const multicolor = computed(() =>
  projects.current ? isCharMulticolor(projects.current, props.code) : false,
)
const perCharMode = computed(() => projects.current?.type === 'mixed')

/** A glyph with no bits set draws nothing — worth saying, since it is a free slot. */
const blank = computed(() => pattern.value?.every((byte) => byte === 0) ?? false)

const selected = computed(() => editor.selectedChar === props.code)

const canvas = useTemplateRef('canvas')

watchEffect(
  () => {
    const project = projects.current
    const ctx = canvas.value?.getContext('2d')
    if (!project || !ctx || !pattern.value) return
    ctx.fillStyle = colorHex(project.settings.screenColor)
    ctx.fillRect(0, 0, CELL_SCREEN_WIDTH, charHeight.value)
    drawCell(
      ctx,
      pattern.value,
      cellShape(project, props.code),
      cellColorHexes(project, editor.fgColor, multicolor.value),
      0,
      0,
    )
  },
  { flush: 'post' },
)

const label = computed(
  () =>
    `Character ${props.code}, $${props.code.toString(16).toUpperCase().padStart(2, '0')}` +
    (perCharMode.value ? `, ${multicolor.value ? 'multicolor' : 'hires'}` : '') +
    (blank.value ? ', blank' : ''),
)
</script>

<template>
  <button
    type="button"
    class="flex w-full cursor-pointer items-center gap-3 border-b border-ink-850 px-2 py-1 text-left transition-colors last:border-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink-300"
    :class="selected ? 'bg-ink-100 text-ink-950' : 'text-ink-300 hover:bg-ink-850'"
    role="option"
    :data-code="code"
    :aria-selected="selected"
    :aria-label="label"
    :tabindex="selected ? 0 : -1"
    @click="editor.selectChar(code)"
  >
    <canvas
      ref="canvas"
      :width="CELL_SCREEN_WIDTH"
      :height="charHeight"
      class="shrink-0 rounded-xs border border-ink-700 [image-rendering:pixelated]"
      :style="{ width: `${CELL_SCREEN_WIDTH * SCALE}px`, height: `${charHeight * SCALE}px` }"
    />
    <span class="font-mono text-xs [font-variant-numeric:tabular-nums]">
      #{{ code }} · ${{ code.toString(16).toUpperCase().padStart(2, '0') }}
    </span>
    <span
      v-if="perCharMode && multicolor"
      class="rounded-xs border border-ink-600 px-1 py-0.5 text-[10px] tracking-wider uppercase"
      :class="selected ? 'border-ink-700' : 'text-ink-400'"
    >
      Multicolor
    </span>
    <span v-if="blank" class="ml-auto text-[10px] tracking-wider uppercase opacity-60">Blank</span>
  </button>
</template>
