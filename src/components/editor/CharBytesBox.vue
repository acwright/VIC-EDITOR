<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Copy } from 'lucide-vue-next'
import AppButton from '@/components/base/AppButton.vue'
import { formatBytes, parseBytes, type ByteRadix } from '@/domain/bytes'
import { useEditorStore } from '@/stores/editor'

/**
 * The selected character's pattern bytes — 8 of them, or 16 for a tall
 * character (PLAN.md D3). Paste must supply the same count, so `bytes.length`
 * is the parse target; the field scrolls rather than wraps when 16 bytes are
 * wider than the column.
 */
const props = defineProps<{ bytes: number[] }>()

const editor = useEditorStore()

// Display radix is local view state; paste-parsing infers its own radix.
const radix = ref<ByteRadix>('hex')
const formatted = computed(() => formatBytes(props.bytes, radix.value))

// `draft` mirrors the formatted bytes except while the field is being edited,
// so external changes (drawing, undo, char switch) keep it in sync.
const draft = ref(formatted.value)
const editing = ref(false)
const invalid = ref(false)
let invalidTimer: ReturnType<typeof setTimeout> | undefined

watch(formatted, (value) => {
  if (!editing.value) draft.value = value
})

function toggleRadix() {
  radix.value = radix.value === 'hex' ? 'dec' : 'hex'
}

/** Paste replaces the field, then commits once the browser has inserted it. */
function onPaste() {
  editing.value = true
  setTimeout(commit, 0)
}

/** Parse the draft and, if it's the right run of clean bytes, apply it. */
function commit() {
  editing.value = false
  const bytes = parseBytes(draft.value, props.bytes.length)
  if (bytes) {
    editor.setCharPattern(bytes)
    invalid.value = false
  } else {
    invalid.value = true
    clearTimeout(invalidTimer)
    invalidTimer = setTimeout(() => (invalid.value = false), 1800)
  }
  draft.value = formatted.value // snap back to a valid rendering either way
}

const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  await navigator.clipboard.writeText(formatted.value)
  copied.value = true
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <AppButton :label="radix === 'hex' ? 'Show as Decimal' : 'Show as Hex'" @click="toggleRadix">
      <span class="font-mono text-sm">{{ radix === 'hex' ? '$' : '#' }}</span>
    </AppButton>
    <input
      v-model="draft"
      type="text"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      aria-label="Pattern bytes — paste hex or decimal to overwrite"
      class="h-9 min-w-0 flex-1 rounded-sm border bg-ink-900 px-2 font-mono text-[11px] whitespace-nowrap text-ink-300 transition-colors focus:outline-none"
      :class="
        invalid
          ? 'border-alert-bright text-alert-bright'
          : 'border-ink-700 hover:border-ink-500 focus:border-ink-300'
      "
      @focus="editing = true"
      @input="
        () => {
          editing = true
          invalid = false
        }
      "
      @paste="onPaste"
      @keydown.enter.prevent="commit"
      @blur="commit"
    />
    <AppButton :label="copied ? 'Copied!' : 'Copy Bytes'" @click="copy">
      <Check v-if="copied" class="size-4 text-ok" />
      <Copy v-else class="size-4" />
    </AppButton>
  </div>
</template>
