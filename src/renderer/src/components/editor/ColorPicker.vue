<script setup lang="ts">
import { computed } from 'vue'
import { Pencil } from 'lucide-vue-next'
import AppHint from '@/components/base/AppHint.vue'
import AppTooltip from '@/components/base/AppTooltip.vue'
import {
  PALETTE,
  SLOT_LABELS,
  isValidSlotIndex,
  slotRangeNote,
  type ColorSlot,
} from '@/domain/palette'
import { useEditorStore } from '@/stores/editor'

/**
 * The VIC's four color slots and the sixteen swatches that fill them
 * (PLAN.md Phase 4).
 *
 * A cell draws with two of the slots or all four, depending on its bit depth,
 * and the rail lists those in pixel-value order so it reads like the grid. The
 * screen and border registers are mirrored in beside them even when the cell
 * does not draw with them: in a multicolor cell they *are* drawing colors, and
 * reaching them shouldn't mean opening the settings dialog.
 *
 * Selecting a slot points the swatches at it, and points the pixel brush at it
 * too when the cell has it — a hires cell has no border pixel to paint, but its
 * border color is still worth changing from here.
 */
const editor = useEditorStore()

/** One letter per slot, small enough to sit on a swatch. */
const SLOT_BADGES: Record<ColorSlot, string> = {
  screen: 'S',
  border: 'B',
  fg: 'C',
  aux: 'A',
}

/** Slots reachable from the rail even when this cell cannot draw with them. */
const MIRRORED_SLOTS: readonly ColorSlot[] = ['screen', 'border']

interface Chip {
  slot: ColorSlot
  label: string
  hex: string
  /** Pixel value this slot draws, or null when the cell has no such pixel. */
  value: number | null
  tooltip: string
}

/**
 * Drawing slots first, in pixel-value order, then the mirrored registers this
 * cell does not draw with.
 */
const chips = computed<Chip[]>(() => {
  const drawn = editor.currentSlots
  const order = [...drawn, ...MIRRORED_SLOTS.filter((slot) => !drawn.includes(slot))]
  return order.map((slot) => {
    const value = drawn.indexOf(slot)
    return {
      slot,
      label: SLOT_LABELS[slot],
      hex: PALETTE[editor.slotColors[slot]]?.hex ?? '#000000',
      value: value === -1 ? null : value,
      tooltip: chipTooltip(slot, value),
    }
  })
})

/** Pixel value as the bits the cell actually holds: `01` at 2bpp, `1` at 1bpp. */
function valueLabel(value: number): string {
  return editor.currentMulticolor ? value.toString(2).padStart(2, '0') : String(value)
}

function chipTooltip(slot: ColorSlot, value: number): string {
  const name = `${SLOT_LABELS[slot]} color`
  if (value === -1) return `${name} — a register this cell doesn’t draw with; set it here`
  return `${name} — pixel value ${valueLabel(value)}`
}

/** The slot the swatches fill; the brush follows it when the cell has it. */
const target = computed(() => editor.targetSlot)

/** Colors 8–15 cannot go in a 3-bit field — the picker grays them out (D5). */
function allowed(index: number): boolean {
  return isValidSlotIndex(target.value, index)
}

/** Set beneath the swatches whenever half of them are unreachable. */
const rangeNote = computed(() => slotRangeNote(target.value))

function onSwatch(event: PointerEvent, index: number) {
  if (event.button !== 0 && event.button !== 2) return
  event.preventDefault()
  // Right-click always fills the screen color — the one slot you reach for
  // constantly and never want to retarget the swatches for.
  editor.setColor(event.button === 2 ? 'screen' : target.value, index)
}

/** Letters of every slot in the rail currently holding this color, e.g. `CS`. */
function badge(index: number): string | null {
  const held = chips.value.filter((chip) => editor.slotColors[chip.slot] === index)
  return held.length ? held.map((chip) => SLOT_BADGES[chip.slot]).join('') : null
}

/** Dark badge text on light swatches, light on dark. */
function badgeClass(index: number): string {
  const hex = PALETTE[index]?.hex
  if (!hex) return 'text-black'
  const luminance =
    0.299 * parseInt(hex.slice(1, 3), 16) +
    0.587 * parseInt(hex.slice(3, 5), 16) +
    0.114 * parseInt(hex.slice(5, 7), 16)
  return luminance > 140 ? 'text-black' : 'text-white'
}

function swatchLabel(index: number): string {
  const name = PALETTE[index]?.name ?? '?'
  return allowed(index) ? name : `${name} — ${rangeNote.value}`
}

/**
 * A refused swatch is inert for both buttons, so it must not promise either.
 * Right-click still fills the screen color, which reaches all sixteen — but
 * only from a swatch the target slot has left clickable.
 */
function swatchAction(index: number): string {
  if (!allowed(index)) return swatchLabel(index)
  return `${swatchLabel(index)} — left-click ${SLOT_LABELS[target.value].toLowerCase()}, right-click screen`
}
</script>

<template>
  <section class="flex flex-col gap-1.5" aria-label="Color picker">
    <!-- The header carries the one thing worth explaining, so the rail below it
         keeps the full width of the panel (the hint used to sit beside the
         chips and squeeze them) -->
    <div class="flex items-center gap-1.5">
      <span class="font-display text-base tracking-wider text-ink-300">Colors</span>
      <AppHint v-if="rangeNote" :text="rangeNote" placement="bottom" />
    </div>

    <!-- Which slot the swatches fill, and which of them the brush paints -->
    <div class="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Color slot">
      <AppTooltip
        v-for="chip in chips"
        :key="chip.slot"
        :label="chip.tooltip"
        placement="top"
        class="w-full"
      >
        <button
          type="button"
          class="flex w-full items-center gap-1.5 rounded-sm border px-1.5 py-1 transition-colors"
          :class="
            target === chip.slot
              ? 'border-ink-300 bg-ink-100 text-ink-950'
              : 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-500'
          "
          role="radio"
          :aria-checked="target === chip.slot"
          :aria-label="chip.tooltip"
          @click="editor.setActiveSlot(chip.slot)"
        >
          <span
            class="size-4 shrink-0 rounded-xs border border-ink-600"
            :style="{ backgroundColor: chip.hex }"
          />
          <span class="font-display truncate text-sm tracking-wider">{{ chip.label }}</span>
          <!-- The pencil marks the slot a left click in the pixel grid paints -->
          <Pencil v-if="editor.activeSlot === chip.slot" class="ml-auto size-3 shrink-0" />
          <span
            v-else-if="chip.value !== null"
            class="ml-auto shrink-0 font-mono text-[10px] opacity-70"
          >
            {{ valueLabel(chip.value) }}
          </span>
          <span v-else class="ml-auto shrink-0 font-mono text-[10px] opacity-70">—</span>
        </button>
      </AppTooltip>
    </div>

    <!-- 2×8 palette (PLAN.md §6) -->
    <div class="grid grid-cols-8 gap-1" role="group" aria-label="Palette" @contextmenu.prevent>
      <AppTooltip
        v-for="entry in PALETTE"
        :key="entry.index"
        :label="swatchLabel(entry.index)"
        :placement="entry.index < 8 ? 'top' : 'bottom'"
      >
        <button
          type="button"
          class="relative h-9 w-full rounded-sm border transition-[border-color] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink-300"
          :class="
            allowed(entry.index)
              ? 'cursor-pointer border-ink-600 hover:border-ink-300'
              : 'cursor-not-allowed border-ink-800 opacity-30'
          "
          :style="{ backgroundColor: entry.hex }"
          :disabled="!allowed(entry.index)"
          :aria-label="swatchAction(entry.index)"
          :aria-disabled="!allowed(entry.index)"
          @pointerdown="onSwatch($event, entry.index)"
        >
          <span
            v-if="badge(entry.index)"
            class="font-display absolute inset-0 flex items-center justify-center text-sm tracking-wider"
            :class="badgeClass(entry.index)"
          >
            {{ badge(entry.index) }}
          </span>
        </button>
      </AppTooltip>
    </div>
  </section>
</template>
