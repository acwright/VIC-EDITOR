<script setup lang="ts">
import AppDialog from '@/components/base/AppDialog.vue'
import { keyLabels, shortcutSections } from '@/utils/shortcuts'

/**
 * The keyboard map, on screen (PLAN.md Phase 11). Both views open it, because
 * both have keys of their own and neither is a place to hunt for a README.
 *
 * The list is `shortcutSections()`, not a copy of it: a key documented here and
 * nowhere else, or bound and never documented, is the failure this dialog
 * exists to prevent.
 */
const open = defineModel<boolean>({ required: true })

const sections = shortcutSections()
</script>

<template>
  <AppDialog v-model="open" title="Keyboard &amp; Pointer" size="xl">
    <div class="flex max-h-[70dvh] flex-col gap-5 overflow-y-auto">
      <section v-for="section in sections" :key="section.title" class="flex flex-col gap-1">
        <h3 class="font-display text-lg tracking-wider">{{ section.title }}</h3>
        <ul class="flex flex-col">
          <li
            v-for="shortcut in section.shortcuts"
            :key="shortcut.action"
            class="flex items-baseline justify-between gap-4 border-b border-ink-850 py-1 last:border-0"
          >
            <span class="text-sm text-ink-300">{{ shortcut.description }}</span>
            <span class="flex shrink-0 gap-1">
              <kbd
                v-for="key in keyLabels(shortcut)"
                :key="key"
                class="rounded-xs border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-mono text-xs text-ink-200"
              >
                {{ key }}
              </kbd>
            </span>
          </li>
        </ul>
      </section>

      <section class="flex flex-col gap-1">
        <h3 class="font-display text-lg tracking-wider">Pointer &amp; touch</h3>
        <ul class="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-300">
          <li>
            Left button (or a finger) paints; the right button paints the empty value — the screen
            color in the pixel grid, and whichever layers the brush covers on the screen.
          </li>
          <li>
            In the pixel grid, pressing a pixel that already holds the brush value clears it back to
            the screen color.
          </li>
          <li>
            On the palette, the right button always fills the screen color, whichever slot the
            swatches are targeting.
          </li>
          <li>Drags are one undo entry, however many cells they cross.</li>
        </ul>
      </section>
    </div>
  </AppDialog>
</template>
