<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Tooltip text */
    label: string
    /** Keyboard shortcut, shown as a key cap (e.g. "Ctrl+Z") */
    shortcut?: string
    /** Placement relative to the wrapped element */
    placement?: 'top' | 'bottom'
  }>(),
  { placement: 'top' },
)

// Two root nodes (anchor + teleport) mean fallthrough class/attrs can't be
// auto-inherited — forward them onto the anchor span explicitly.
defineOptions({ inheritAttrs: false })

/** Clear space kept between the tooltip and the viewport edge when clamping. */
const EDGE_GAP = 8

const anchor = useTemplateRef('anchor')
const tip = useTemplateRef('tip')

// Teleported to <body> so it escapes panel overflow clipping; driven purely by
// `visible` so it can never get stuck open (unlike a manual popover).
const visible = ref(false)
const position = ref({ left: '0px', top: '0px' })
let showTimer: ReturnType<typeof setTimeout> | undefined

function show() {
  clearTimeout(showTimer)
  showTimer = setTimeout(async () => {
    const rect = anchor.value?.getBoundingClientRect()
    if (!rect) return
    const centre = rect.left + rect.width / 2
    position.value = {
      left: `${centre}px`,
      top: props.placement === 'top' ? `${rect.top - 6}px` : `${rect.bottom + 6}px`,
    }
    visible.value = true

    // The tooltip is centred on its anchor, so one near a screen edge would
    // hang off it — and its width is only knowable once it is in the DOM. Hence
    // the second pass. Both `left` writes land in the same microtask batch, so
    // the unclamped one is never painted.
    await nextTick()
    if (!tip.value) return
    const half = tip.value.getBoundingClientRect().width / 2
    // Order matters: a tooltip too wide to fit at all pins to the left edge and
    // overflows right, rather than the other way round.
    const clamped = Math.max(EDGE_GAP + half, Math.min(centre, window.innerWidth - EDGE_GAP - half))
    position.value = { ...position.value, left: `${clamped}px` }
  }, 100)
}

function hide() {
  clearTimeout(showTimer)
  visible.value = false
}

onBeforeUnmount(() => clearTimeout(showTimer))
</script>

<template>
  <span
    ref="anchor"
    class="inline-flex"
    v-bind="$attrs"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
    @pointerdown="hide"
  >
    <slot />
  </span>
  <Teleport to="body">
    <span
      v-if="visible"
      ref="tip"
      role="tooltip"
      class="pointer-events-none fixed z-100 flex -translate-x-1/2 items-center gap-1.5 rounded-sm border border-ink-700 bg-ink-850 px-2 py-1 text-xs whitespace-nowrap text-ink-200 shadow-lg"
      :class="placement === 'top' ? '-translate-y-full' : ''"
      :style="position"
    >
      {{ label }}
      <kbd
        v-if="shortcut"
        class="rounded-xs border border-ink-600 bg-ink-800 px-1 font-mono text-[10px] text-ink-300"
      >
        {{ shortcut }}
      </kbd>
    </span>
  </Teleport>
</template>
