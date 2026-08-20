<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-vue-next'
import AppButton from '@/components/base/AppButton.vue'
import AppTooltip from '@/components/base/AppTooltip.vue'
import SpritePreview from './SpritePreview.vue'
import { useEditorStore } from '@/stores/editor'

/**
 * The current animation's frames in order. Each thumbnail is the sprite that
 * frame points at; clicking one moves the playhead there (Decision 31), which
 * is also what the preview above renders.
 */
const editor = useEditorStore()

const frames = computed(() => editor.currentAnimation?.frames ?? [])

function select(index: number) {
  editor.setPlaying(false)
  editor.selectFrame(index)
}

/** Point the selected frame at the sprite currently being edited. */
function retarget() {
  editor.setFrame(editor.selectedFrame, editor.selectedSprite)
}
</script>

<template>
  <div class="flex shrink-0 flex-col gap-2" aria-label="Animation frames">
    <div class="flex items-center gap-2">
      <h3 class="font-display text-sm tracking-wider text-ink-400">Frames</h3>
      <span class="font-mono text-xs text-ink-500">
        {{ frames.length ? `${editor.selectedFrame + 1}/${frames.length}` : '0' }}
      </span>
      <div class="ml-auto flex items-center gap-1">
        <AppButton
          label="Move Frame Left"
          :disabled="editor.selectedFrame <= 0"
          @click="editor.reorderFrame(editor.selectedFrame, editor.selectedFrame - 1)"
        >
          <ChevronLeft class="size-4" />
        </AppButton>
        <AppButton
          label="Move Frame Right"
          :disabled="editor.selectedFrame >= frames.length - 1"
          @click="editor.reorderFrame(editor.selectedFrame, editor.selectedFrame + 1)"
        >
          <ChevronRight class="size-4" />
        </AppButton>
        <AppButton
          :label="`Set Frame to Sprite #${editor.selectedSprite}`"
          :disabled="frames.length === 0"
          @click="retarget"
        >
          <span class="font-display text-sm">=</span>
        </AppButton>
        <AppButton
          :label="`Add Sprite #${editor.selectedSprite} as a Frame`"
          @click="editor.addFrame()"
        >
          <Plus class="size-4" />
        </AppButton>
        <AppButton
          label="Remove Frame"
          :disabled="frames.length === 0"
          @click="editor.removeFrame(editor.selectedFrame)"
        >
          <Trash2 class="size-4" />
        </AppButton>
      </div>
    </div>

    <div
      v-if="frames.length"
      class="flex gap-1.5 overflow-x-auto pb-1"
      role="listbox"
      aria-label="Frames"
    >
      <AppTooltip
        v-for="(slot, index) in frames"
        :key="index"
        :label="`Frame ${index + 1} — Sprite #${slot}`"
        placement="top"
      >
        <button
          type="button"
          class="flex cursor-pointer flex-col items-center gap-0.5 rounded-sm border p-1 transition-colors"
          :class="
            index === editor.selectedFrame
              ? 'border-ink-100 bg-ink-800'
              : 'border-ink-700 hover:border-ink-500'
          "
          role="option"
          :aria-selected="index === editor.selectedFrame"
          @click="select(index)"
        >
          <SpritePreview :sprite-slot="slot" :scale="2" />
          <span class="font-mono text-[10px] text-ink-500">{{ slot }}</span>
        </button>
      </AppTooltip>
    </div>

    <p
      v-else
      class="rounded-sm border border-dashed border-ink-700 px-3 py-4 text-center text-xs text-ink-500"
    >
      No frames yet — add the sprite you're editing with
      <span class="text-ink-300">+</span> to start the animation.
    </p>
  </div>
</template>
