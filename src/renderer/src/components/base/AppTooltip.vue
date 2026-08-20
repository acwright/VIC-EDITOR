<script setup lang="ts">
import { onBeforeUnmount, ref, useTemplateRef } from 'vue'

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

const anchor = useTemplateRef('anchor')

// Teleported to <body> so it escapes panel overflow clipping; driven purely by
// `visible` so it can never get stuck open (unlike a manual popover).
const visible = ref(false)
const position = ref({ left: '0px', top: '0px' })
let showTimer: ReturnType<typeof setTimeout> | undefined

function show() {
  clearTimeout(showTimer)
  showTimer = setTimeout(() => {
    const rect = anchor.value?.getBoundingClientRect()
    if (!rect) return
    position.value = {
      left: `${rect.left + rect.width / 2}px`,
      top: props.placement === 'top' ? `${rect.top - 6}px` : `${rect.bottom + 6}px`,
    }
    visible.value = true
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
