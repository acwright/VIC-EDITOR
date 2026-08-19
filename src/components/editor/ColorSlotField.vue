<script setup lang="ts">
import { computed } from 'vue'
import {
  PALETTE,
  SLOT_LABELS,
  isValidSlotIndex,
  slotRangeNote,
  type ColorSlot,
} from '@/domain/palette'
import { useEditorStore } from '@/stores/editor'

/**
 * One global color register, as a labeled row of the full palette (D6). The
 * out-of-range half is grayed rather than dropped, so the 3-bit border field
 * explains itself here exactly as it does in the picker (D5).
 *
 * `fg` is deliberately not offered: the character color is the brush, tool
 * state rather than project state, and belongs to the picker (D7).
 */
const props = defineProps<{
  /** Named `colorSlot`, not `slot`: `slot` is a reserved attribute name. */
  colorSlot: Exclude<ColorSlot, 'fg'>
  /** What this register does, in one line. */
  hint: string
}>()

const editor = useEditorStore()

const label = computed(() => SLOT_LABELS[props.colorSlot])
const current = computed(() => editor.slotColors[props.colorSlot])
const note = computed(() => slotRangeNote(props.colorSlot))

function allowed(index: number): boolean {
  return isValidSlotIndex(props.colorSlot, index)
}

function name(index: number): string {
  return PALETTE[index]?.name ?? '?'
}
</script>

<template>
  <div class="flex flex-col gap-1.5 rounded-sm border border-ink-700 bg-ink-850 px-3 py-2">
    <div class="flex items-baseline justify-between gap-3">
      <span class="font-display text-base tracking-wider">{{ label }} Color</span>
      <span class="font-mono text-xs text-ink-400">{{ current }} {{ name(current) }}</span>
    </div>

    <div class="grid grid-cols-8 gap-1" role="radiogroup" :aria-label="`${label} color`">
      <button
        v-for="entry in PALETTE"
        :key="entry.index"
        type="button"
        class="h-6 rounded-xs border transition-[border-color] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink-300"
        :class="[
          allowed(entry.index)
            ? 'cursor-pointer hover:border-ink-300'
            : 'cursor-not-allowed border-ink-800 opacity-30',
          current === entry.index && allowed(entry.index) ? 'border-ink-50' : 'border-ink-600',
        ]"
        :style="{ backgroundColor: entry.hex }"
        :disabled="!allowed(entry.index)"
        role="radio"
        :aria-checked="current === entry.index"
        :aria-label="allowed(entry.index) ? entry.name : `${entry.name} — ${note}`"
        :title="allowed(entry.index) ? entry.name : `${entry.name} — ${note}`"
        @click="editor.setColor(colorSlot, entry.index)"
      />
    </div>

    <p class="text-xs text-ink-500">
      {{ hint }}<template v-if="note"> — {{ note }}</template>
    </p>
  </div>
</template>
