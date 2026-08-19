<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { Columns2, Download, Grid3x3, List, Settings2 } from 'lucide-vue-next'
import AppButton from '@/components/base/AppButton.vue'
import AppTooltip from '@/components/base/AppTooltip.vue'
import CharsetGrid from './CharsetGrid.vue'
import CharsetList from './CharsetList.vue'
import ExportDialog from './ExportDialog.vue'
import { loadPreferences, savePreferences } from '@/persistence/preferences'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'
import { CHARSET_VIEWS, type CharsetView } from '@/utils/charsetView'

const projects = useProjectsStore()
const editor = useEditorStore()

const showExport = ref(false)

const emit = defineEmits<{ openSettings: [] }>()

/** Characters per grid; 256 splits into the two halves the VIC itself uses. */
const GRID_MAX = 128

/** Glyphs a row in the scrolling grid — the VIC's own 8, and a readable size. */
const SCROLL_COLUMNS = 8

const charCount = computed(() => projects.current?.settings.charCount ?? 256)

/**
 * One grid per 128 characters, so a 64-character project shows a single short
 * grid rather than 192 empty slots (D4).
 */
const grids = computed(() => {
  const blocks: { startCode: number; count: number }[] = []
  for (let startCode = 0; startCode < charCount.value; startCode += GRID_MAX) {
    blocks.push({ startCode, count: Math.min(GRID_MAX, charCount.value - startCode) })
  }
  return blocks
})

/**
 * The layout, remembered across sessions. Blocks scales the set to the space it
 * has, which stops being readable on a short window; the other two keep the
 * glyphs at a fixed size and scroll instead (`utils/charsetView.ts`).
 */
const view = ref<CharsetView>(loadPreferences().charsetView)

function setView(next: CharsetView): void {
  view.value = next
  savePreferences({ charsetView: next })
}

const VIEW_ICONS = { blocks: Columns2, grid: Grid3x3, list: List }

// --- Keeping the selection visible ---

const scroller = useTemplateRef('scroller')

/**
 * The scrolling grid is one canvas, so there is no element to scroll to: the
 * selected character's row is arithmetic. Without this, `[` / `]` walk the set
 * behind the top edge of the viewport.
 */
watch([() => editor.selectedChar, view], ([code]) => {
  const el = scroller.value
  if (!el || view.value !== 'grid') return
  const rows = Math.ceil(charCount.value / SCROLL_COLUMNS)
  const rowHeight = el.scrollHeight / rows
  const top = Math.floor(code / SCROLL_COLUMNS) * rowHeight
  if (top < el.scrollTop) el.scrollTo({ top })
  else if (top + rowHeight > el.scrollTop + el.clientHeight) {
    el.scrollTo({ top: top + rowHeight - el.clientHeight })
  }
})
</script>

<template>
  <!-- flex-1 to take the space the character panel leaves, but with a floor: as
       `min-h-0` this was crushed to a few pixels on a short window — the column
       around it scrolls, so there was never a reason to squeeze it that far. -->
  <section class="flex min-h-64 flex-1 flex-col gap-2 pb-4" aria-label="Character set picker">
    <div class="flex items-center gap-2">
      <h2 class="text-xl">Character Set</h2>
      <div class="ml-auto flex items-center gap-1">
        <!-- Layout: which of the three arrangements suits this window -->
        <div class="flex gap-1" role="radiogroup" aria-label="Character set layout">
          <AppTooltip
            v-for="option in CHARSET_VIEWS"
            :key="option.view"
            :label="option.hint"
            placement="bottom"
          >
            <button
              type="button"
              class="inline-flex h-9 min-w-9 items-center justify-center rounded-sm border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300 pointer-coarse:h-10 pointer-coarse:min-w-10"
              :class="
                view === option.view
                  ? 'border-ink-300 bg-ink-100 text-ink-950'
                  : 'border-ink-700 bg-ink-850 text-ink-200 hover:border-ink-500 hover:bg-ink-800'
              "
              role="radio"
              :aria-checked="view === option.view"
              :aria-label="option.hint"
              @click="setView(option.view)"
            >
              <component :is="VIEW_ICONS[option.view]" class="size-4" />
            </button>
          </AppTooltip>
        </div>

        <div class="mx-0.5 h-6 w-px bg-ink-800" />

        <AppButton label="Project Settings" @click="emit('openSettings')">
          <Settings2 class="size-4" />
        </AppButton>
        <AppButton label="Export Character Set" @click="showExport = true">
          <Download class="size-4" />
        </AppButton>
      </div>
    </div>

    <ExportDialog v-model="showExport" scope="charset" />

    <!-- Blocks: halves side by side, centered, scaling to fit. The scroll is a
         floor, not a feature — below the grids' minimum height this scrolls
         rather than clipping them mid-glyph. -->
    <div
      v-if="view === 'blocks'"
      class="flex min-h-0 flex-1 items-center justify-center gap-3 overflow-auto"
    >
      <CharsetGrid
        v-for="grid in grids"
        :key="grid.startCode"
        :start-code="grid.startCode"
        :count="grid.count"
      />
    </div>

    <!-- Grid: eight a row at the column's width, running as tall as it needs -->
    <div v-else-if="view === 'grid'" ref="scroller" class="min-h-0 flex-1 overflow-y-auto">
      <CharsetGrid :start-code="0" :count="charCount" fit="width" />
    </div>

    <CharsetList v-else />
  </section>
</template>
