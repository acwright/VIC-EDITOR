<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import CharsetListRow from './CharsetListRow.vue'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'

/**
 * The character set as a list: one glyph a row beside its code, scrolling.
 *
 * The other two views are pictures of the whole set — good for picking a glyph
 * you can see, useless for "what is at $2A". This one is the index: the code in
 * both bases, the rendering a `mixed` project gives that character, and which
 * slots are still blank, which is how you find room for a new one.
 *
 * A listbox rather than 256 tab stops: one roving `tabindex`, arrows move the
 * selection, and the selected row is scrolled into view however the selection
 * changed — including from `[` and `]` outside this component.
 */
const projects = useProjectsStore()
const editor = useEditorStore()

const codes = computed(() =>
  Array.from({ length: projects.current?.settings.charCount ?? 0 }, (_, code) => code),
)

const list = useTemplateRef('list')

function move(delta: number): void {
  const last = codes.value.length - 1
  editor.selectChar(Math.max(0, Math.min(last, editor.selectedChar + delta)))
}

function onKeydown(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  switch (event.key) {
    case 'ArrowDown':
      move(1)
      break
    case 'ArrowUp':
      move(-1)
      break
    case 'PageDown':
      move(8)
      break
    case 'PageUp':
      move(-8)
      break
    case 'Home':
      editor.selectChar(0)
      break
    case 'End':
      editor.selectChar(codes.value.length - 1)
      break
    default:
      return
  }
  event.preventDefault()
  event.stopPropagation()
}

/**
 * Keep the selection visible. `nearest` so a selection already on screen —
 * which is most clicks — doesn't jerk the list around it.
 */
watch(
  () => editor.selectedChar,
  (code) => {
    const row = list.value?.querySelector(`[data-code="${code}"]`)
    row?.scrollIntoView({ block: 'nearest' })
    // Follow the selection with focus only while the list already has it,
    // so clicking a glyph elsewhere doesn't steal it.
    if (list.value?.contains(document.activeElement)) (row as HTMLElement | null)?.focus()
  },
)
</script>

<template>
  <div
    ref="list"
    class="min-h-0 flex-1 overflow-y-auto rounded-sm border border-ink-800"
    role="listbox"
    aria-label="Character set"
    @keydown="onKeydown"
  >
    <CharsetListRow v-for="code in codes" :key="code" :code="code" />
  </div>
</template>
