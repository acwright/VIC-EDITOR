<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy } from 'lucide-vue-next'
import AppButton from '@/components/base/AppButton.vue'
import { REGISTERS, formatRegisterDump, registerLabel } from '@/domain/vic'

/**
 * The live `$9000–$900F` block (D14): sixteen bytes in hex, each explaining
 * itself on hover, copyable as a hex dump. This is the readout that makes the
 * settings dialog a VIC control panel rather than a form — every field above
 * it changes a byte here as you touch it.
 *
 * The unmodeled registers (raster, light pen, paddles, sound) are shown at
 * zero rather than hidden: a sixteen-byte block with gaps in it would be
 * harder to match against a monitor dump, which is what this is for.
 */
const props = defineProps<{ bytes: number[] }>()

const cells = computed(() =>
  REGISTERS.map((register, index) => ({
    index,
    label: registerLabel(index),
    name: register.name,
    hex: (props.bytes[index] ?? 0).toString(16).toUpperCase().padStart(2, '0'),
    title: `${registerLabel(index)} ${register.name} — ${register.description}`,
  })),
)

const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  await navigator.clipboard.writeText(formatRegisterDump(props.bytes))
  copied.value = true
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <section class="flex flex-col gap-1.5" aria-label="VIC registers">
    <div class="flex items-center justify-between gap-3">
      <h3 class="font-display text-lg tracking-wider">Registers</h3>
      <AppButton label="Copy Registers" show-label @click="copy">
        <Check v-if="copied" class="size-4 text-ok" />
        <Copy v-else class="size-4" />
      </AppButton>
    </div>
    <p class="text-xs text-ink-500">
      What the settings above poke into the VIC. Hover a byte for the fields it carries.
    </p>

    <div class="grid grid-cols-8 gap-1 rounded-sm border border-ink-700 bg-ink-850 p-2">
      <div
        v-for="cell in cells"
        :key="cell.index"
        class="flex flex-col items-center rounded-xs border border-ink-700 bg-ink-900 py-1 transition-colors hover:border-ink-500"
        :title="cell.title"
        :aria-label="cell.title"
      >
        <span class="font-mono text-[0.625rem] leading-none text-ink-500">{{ cell.label }}</span>
        <span class="font-mono text-sm leading-tight text-ink-100">{{ cell.hex }}</span>
      </div>
    </div>
  </section>
</template>
