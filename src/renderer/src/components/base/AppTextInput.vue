<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    placeholder?: string
    /** Autofocus when rendered (e.g. the primary field of a dialog) */
    autofocus?: boolean
  }>(),
  { placeholder: '', autofocus: false },
)

const model = defineModel<string>({ required: true })
</script>

<template>
  <label class="block">
    <span class="font-display mb-1 block text-sm tracking-wider text-ink-400">{{ label }}</span>
    <input
      v-model="model"
      type="text"
      :placeholder="placeholder"
      :autofocus="autofocus"
      class="h-9 w-full rounded-sm border border-ink-700 bg-ink-850 px-2.5 text-sm text-ink-100 transition-colors placeholder:text-ink-600 hover:border-ink-500 focus:border-ink-300 focus:outline-none"
    />
  </label>
</template>
