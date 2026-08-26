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

/**
 * What the field is pointed at. Read from the store rather than from the
 * `bytes` prop, because the two do not move at the same moment: clicking
 * another character selects it during `pointerdown`, which runs *before* this
 * field's blur, while the new prop does not reach this component until the
 * next render. A commit that asked the prop whether anything had moved would
 * always be told no.
 */
const target = computed(() => `char:${editor.selectedChar}`)

// `draft` mirrors the formatted bytes except while the field is being edited,
// so external changes (drawing, undo, char switch) keep it in sync.
const draft = ref(formatted.value)
const editing = ref(false)
/** The `target` the in-progress edit began against; null when none is. */
let editingTarget: string | null = null
const invalid = ref(false)
let invalidTimer: ReturnType<typeof setTimeout> | undefined

watch(formatted, (value) => {
  if (!editing.value) draft.value = value
})

/**
 * Typing or pasting starts an edit — **focus alone does not**. Selecting the
 * text to read or copy it is not a change to commit, and treating it as one is
 * what used to stamp the character you were looking at onto the next one you
 * clicked: the click selected that character, then the blur committed a draft
 * belonging to the old one.
 */
function beginEdit() {
  if (!editing.value) editingTarget = target.value
  editing.value = true
}

function toggleRadix() {
  radix.value = radix.value === 'hex' ? 'dec' : 'hex'
}

/** Paste replaces the field, then commits once the browser has inserted it. */
function onPaste() {
  beginEdit()
  setTimeout(commit, 0)
}

/** Parse the draft and, if it's the right run of clean bytes, apply it. */
function commit() {
  const edited = editing.value
  const from = editingTarget
  editing.value = false
  editingTarget = null
  // Nothing was typed, or the selection moved out from under what was — either
  // way there is nothing this field may write. Snapping the draft back is
  // enough; if the prop has yet to catch up, the watch above finishes the job.
  if (!edited || from !== target.value) {
    draft.value = formatted.value
    return
  }
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
      @input="
        () => {
          beginEdit()
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
