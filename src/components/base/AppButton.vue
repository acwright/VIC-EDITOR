<script setup lang="ts">
import { computed } from 'vue'
import AppTooltip from './AppTooltip.vue'

const props = withDefaults(
  defineProps<{
    /** Accessible name + tooltip text */
    label: string
    /** Keyboard shortcut shown in the tooltip (e.g. "Ctrl+Z") */
    shortcut?: string
    /** Toggled/selected state (e.g. grid overlay on) */
    active?: boolean
    disabled?: boolean
    /**
     * Why the button is disabled, in a few words. A grayed control that cannot
     * say why reads as a bug, so the reason joins the accessible name while it
     * applies (PLAN.md Phase 11) — and rides along as a `title`, since browsers
     * suppress hover events over a disabled control and the tooltip with them.
     */
    disabledReason?: string
    /** Tooltip placement */
    placement?: 'top' | 'bottom'
    /** Show the label text next to the icon */
    showLabel?: boolean
  }>(),
  { placement: 'top', active: false, disabled: false, showLabel: false },
)

defineEmits<{ click: [event: MouseEvent] }>()

const name = computed(() =>
  props.disabled && props.disabledReason ? `${props.label} — ${props.disabledReason}` : props.label,
)
</script>

<template>
  <AppTooltip
    :label="name"
    :shortcut="shortcut"
    :placement="placement"
    :title="disabled && disabledReason ? name : undefined"
  >
    <button
      type="button"
      class="inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-sm border px-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300 disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:h-10 pointer-coarse:min-w-10"
      :class="
        active
          ? 'border-ink-300 bg-ink-100 text-ink-950 hover:bg-ink-200'
          : 'border-ink-700 bg-ink-850 text-ink-200 hover:border-ink-500 hover:bg-ink-800 hover:text-ink-50'
      "
      :aria-label="name"
      :aria-pressed="active || undefined"
      :disabled="disabled"
      @click="$emit('click', $event)"
    >
      <slot />
      <span v-if="showLabel" class="font-display px-0.5 text-sm tracking-wider">{{ label }}</span>
    </button>
  </AppTooltip>
</template>
