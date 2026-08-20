<script setup lang="ts">
import { useTemplateRef, watch, onMounted } from 'vue'
import { X } from 'lucide-vue-next'
import AppButton from './AppButton.vue'

const props = withDefaults(defineProps<{ title: string; size?: 'md' | 'lg' | 'xl' }>(), {
  size: 'md',
})
const open = defineModel<boolean>({ required: true })

const SIZES = { md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' } as const

const dialog = useTemplateRef('dialog')

function sync() {
  if (!dialog.value) return
  if (open.value && !dialog.value.open) dialog.value.showModal()
  else if (!open.value && dialog.value.open) dialog.value.close()
}

onMounted(sync)
watch(open, sync)

// Native <dialog> closes itself on Esc — reflect that back into the model
function onClose() {
  open.value = false
}
</script>

<template>
  <dialog
    ref="dialog"
    class="fixed inset-0 m-auto w-full rounded-md border border-ink-700 bg-ink-900 p-0 text-ink-100 shadow-2xl backdrop:bg-black/60"
    :class="SIZES[props.size]"
    @close="onClose"
  >
    <header class="flex items-center justify-between border-b border-ink-800 py-2 pr-2 pl-4">
      <h2 class="text-xl">{{ props.title }}</h2>
      <AppButton label="Close" shortcut="Esc" placement="bottom" @click="open = false">
        <X class="size-4" />
      </AppButton>
    </header>
    <div class="p-4">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="flex justify-end gap-2 border-t border-ink-800 p-3">
      <slot name="footer" />
    </footer>
  </dialog>
</template>
