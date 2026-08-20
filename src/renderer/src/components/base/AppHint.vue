<script setup lang="ts">
import { CircleHelp } from 'lucide-vue-next'
import AppTooltip from './AppTooltip.vue'

/**
 * A `?` marker carrying one sentence of explanation.
 *
 * The editor has a handful of facts about the hardware worth stating once — why
 * half the palette is grayed, what switching a character's rendering does — and
 * they used to sit as standing paragraphs under the controls they explain. On a
 * phone that cost a line of the character set for a sentence you read once, so
 * they live here instead: on hover, on focus, and as a `title` for anything that
 * reads neither.
 *
 * It is a real button so the keyboard can reach it — `AppTooltip` opens on
 * `focusin` — and its accessible name *is* the sentence, so a screen reader gets
 * the text rather than an unexplained "help".
 */
withDefaults(defineProps<{ text: string; placement?: 'top' | 'bottom' }>(), { placement: 'top' })
</script>

<template>
  <AppTooltip :label="text" :placement="placement">
    <button
      type="button"
      class="inline-flex size-5 items-center justify-center rounded-xs text-ink-500 transition-colors hover:text-ink-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink-300"
      :aria-label="text"
      :title="text"
    >
      <CircleHelp class="size-3.5" />
    </button>
  </AppTooltip>
</template>
