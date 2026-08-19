<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  SkipBack,
  SkipForward,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-vue-next'
import AppButton from '@/components/base/AppButton.vue'
import AppDialog from '@/components/base/AppDialog.vue'
import AppTextInput from '@/components/base/AppTextInput.vue'
import FrameStrip from './FrameStrip.vue'
import SpritePreview from './SpritePreview.vue'
import { MAX_FPS, MIN_FPS, spritePixelSize } from '@/domain/sprites'
import { useEditorStore } from '@/stores/editor'
import { modLabel, shiftModLabel } from '@/utils/platform'

const editor = useEditorStore()

const MAGS = [1, 2] as const

// --- Playback (Decision 31) ---
// A rAF loop rather than setInterval so it pauses with the tab and never drifts
// past a repaint. It advances the store's playhead; nothing here is undoable.
let raf = 0
let lastAdvance = 0

function tick(now: number) {
  if (!editor.playing) return
  const interval = 1000 / Math.max(MIN_FPS, editor.currentAnimation?.fps ?? MIN_FPS)
  if (now - lastAdvance >= interval) {
    lastAdvance = now
    editor.stepFrame(1)
  }
  raf = requestAnimationFrame(tick)
}

function stop() {
  cancelAnimationFrame(raf)
  raf = 0
}

watch(
  () => editor.playing,
  (playing) => {
    stop()
    if (!playing) return
    lastAdvance = performance.now()
    raf = requestAnimationFrame(tick)
  },
)

// Never leave a loop (or playback state) running behind us.
onBeforeUnmount(() => {
  stop()
  editor.setPlaying(false)
})

/** Stepping is a manual action, so it pauses first. */
function step(delta: number) {
  editor.setPlaying(false)
  editor.stepFrame(delta)
}

const canPlay = computed(() => editor.frameCount > 1)

const pageLabel = computed(() => `${editor.selectedAnimation + 1}/${editor.animationCount}`)

const fps = computed(() => editor.currentAnimation?.fps ?? 8)

function setFps(value: number) {
  editor.setAnimationFps(editor.selectedAnimation, value)
}

// --- Animation management dialogs ---
const showRename = ref(false)
const renameValue = ref('')

function startRename() {
  renameValue.value = editor.currentAnimation?.name ?? ''
  showRename.value = true
}

function confirmRename() {
  const name = renameValue.value.trim()
  if (!name) return
  editor.renameAnimation(editor.selectedAnimation, name)
  showRename.value = false
}

const showDelete = ref(false)

function confirmDelete() {
  editor.removeAnimation(editor.selectedAnimation)
  showDelete.value = false
}
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-1 flex-col gap-3" aria-label="Animation">
    <!-- Toolbar, following the screen toolbar's ordering conventions -->
    <div class="flex flex-wrap items-center justify-center gap-1">
      <AppButton
        label="Zoom Out"
        shortcut="−"
        :disabled="editor.previewScale <= 1"
        @click="editor.zoomPreview(-1)"
      >
        <ZoomOut class="size-4" />
      </AppButton>
      <span class="w-7 text-center font-mono text-xs text-ink-400">{{ editor.previewScale }}×</span>
      <AppButton
        label="Zoom In"
        shortcut="+"
        :disabled="editor.previewScale >= 12"
        @click="editor.zoomPreview(1)"
      >
        <ZoomIn class="size-4" />
      </AppButton>

      <div class="mx-1.5 h-6 w-px bg-ink-800" />

      <!-- Magnification is a hardware register bit, so it is an undoable project change -->
      <div class="flex items-center gap-1" role="radiogroup" aria-label="Sprite magnification">
        <AppButton
          v-for="mag in MAGS"
          :key="mag"
          :label="`Magnification ${mag}× (VDP register 1)`"
          :active="editor.spriteMag === mag"
          @click="editor.setSpriteMag(mag)"
        >
          <span class="font-display text-sm">{{ mag }}×</span>
        </AppButton>
      </div>

      <div class="mx-1.5 h-6 w-px bg-ink-800" />

      <AppButton label="Previous Frame" :disabled="editor.frameCount === 0" @click="step(-1)">
        <SkipBack class="size-4" />
      </AppButton>
      <AppButton
        :label="editor.playing ? 'Pause' : 'Play'"
        shortcut="Space"
        :active="editor.playing"
        :disabled="!canPlay"
        @click="editor.togglePlaying()"
      >
        <Pause v-if="editor.playing" class="size-4" />
        <Play v-else class="size-4" />
      </AppButton>
      <AppButton label="Next Frame" :disabled="editor.frameCount === 0" @click="step(1)">
        <SkipForward class="size-4" />
      </AppButton>

      <div class="mx-1.5 h-6 w-px bg-ink-800" />

      <AppButton label="Slower" :disabled="fps <= MIN_FPS" @click="setFps(fps - 1)">
        <span class="font-display text-sm">−</span>
      </AppButton>
      <span class="w-12 text-center font-mono text-xs text-ink-400">{{ fps }} fps</span>
      <AppButton label="Faster" :disabled="fps >= MAX_FPS" @click="setFps(fps + 1)">
        <span class="font-display text-sm">+</span>
      </AppButton>

      <div class="mx-1.5 h-6 w-px bg-ink-800" />

      <AppButton
        label="Undo"
        :shortcut="modLabel('Z')"
        :disabled="!editor.canUndo"
        @click="editor.undo()"
      >
        <Undo2 class="size-4" />
      </AppButton>
      <AppButton
        label="Redo"
        :shortcut="shiftModLabel('Z')"
        :disabled="!editor.canRedo"
        @click="editor.redo()"
      >
        <Redo2 class="size-4" />
      </AppButton>

      <div class="mx-1.5 h-6 w-px bg-ink-800" />

      <AppButton
        label="Previous Animation"
        shortcut=","
        :disabled="editor.selectedAnimation === 0"
        @click="editor.selectAnimation(editor.selectedAnimation - 1)"
      >
        <ChevronLeft class="size-4" />
      </AppButton>
      <span class="w-8 text-center font-mono text-xs text-ink-400">{{ pageLabel }}</span>
      <AppButton
        label="Next Animation"
        shortcut="."
        :disabled="editor.selectedAnimation >= editor.animationCount - 1"
        @click="editor.selectAnimation(editor.selectedAnimation + 1)"
      >
        <ChevronRight class="size-4" />
      </AppButton>
      <AppButton label="Rename Animation" @click="startRename">
        <Pencil class="size-4" />
      </AppButton>
      <AppButton label="Add Animation" @click="editor.addAnimation()">
        <Plus class="size-4" />
      </AppButton>
      <AppButton
        label="Delete Animation"
        :disabled="editor.animationCount <= 1"
        @click="showDelete = true"
      >
        <Trash2 class="size-4" />
      </AppButton>
    </div>

    <p class="text-center font-mono text-xs text-ink-500">{{ editor.currentAnimation?.name }}</p>

    <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
      <SpritePreview
        :sprite-slot="editor.previewSlot"
        :mag="editor.spriteMag"
        :scale="editor.previewScale"
      />
      <p class="font-mono text-xs text-ink-500">
        {{ editor.spriteSize }}×{{ editor.spriteSize }} pattern ·
        {{ spritePixelSize(editor.spriteSize, editor.spriteMag) }}×{{
          spritePixelSize(editor.spriteSize, editor.spriteMag)
        }}
        on screen
        <template v-if="editor.frameCount === 0"> · showing the edited sprite</template>
      </p>
    </div>

    <FrameStrip />

    <AppDialog v-model="showRename" title="Rename Animation">
      <form @submit.prevent="confirmRename">
        <AppTextInput v-model="renameValue" label="Name" autofocus />
      </form>
      <template #footer>
        <AppButton
          label="Rename"
          show-label
          :disabled="renameValue.trim().length === 0"
          @click="confirmRename"
        >
          <Pencil class="size-4" />
        </AppButton>
      </template>
    </AppDialog>

    <AppDialog v-model="showDelete" title="Delete Animation">
      <p class="text-sm text-ink-300">
        Delete <strong class="text-ink-100">{{ editor.currentAnimation?.name }}</strong
        >? You can undo this while the project is open.
      </p>
      <template #footer>
        <AppButton label="Cancel" show-label @click="showDelete = false" />
        <AppButton label="Delete" show-label @click="confirmDelete">
          <Trash2 class="size-4" />
        </AppButton>
      </template>
    </AppDialog>
  </section>
</template>
