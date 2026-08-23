<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, Keyboard, X } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import AppButton from '@/components/base/AppButton.vue'
import HelpDialog from '@/components/HelpDialog.vue'
import CharacterPanel from '@/components/editor/CharacterPanel.vue'
import CharsetPicker from '@/components/editor/CharsetPicker.vue'
import ProjectSettingsDialog from '@/components/editor/ProjectSettingsDialog.vue'
import ScreenPanel from '@/components/editor/ScreenPanel.vue'
import { MODES } from '@/domain/modes'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'
import { editorMenuContext, onMenuAction, reportMenuContext } from '@/utils/menu'
import { matchEditorShortcut, shortcutLabel, type EditorAction } from '@/utils/shortcuts'

const props = defineProps<{ projectId: string }>()

const router = useRouter()
const store = useProjectsStore()
const editor = useEditorStore()

/**
 * Opening is async now that storage is (PLAN.md D1), so the view has three
 * states rather than two: it is loading, it has a project, or the project
 * could not be read. Without the first, the missing-project panel flashes on
 * every navigation while the load is in flight.
 */
type OpenState = 'loading' | 'ready' | 'missing'
const openState = ref<OpenState>('loading')

watch(
  () => props.projectId,
  async (id) => {
    openState.value = 'loading'
    const project = await store.open(id)
    // A newer navigation can land mid-load. The store already drops the stale
    // result; this drops the stale view state that would follow it.
    if (id !== props.projectId) return
    openState.value = project ? 'ready' : 'missing'
    editor.reset()
  },
  { immediate: true },
)
onBeforeUnmount(() => void store.close())

const SAVE_STATE_LABEL = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved' } as const

const showSettings = ref(false)
const showHelp = ref(false)

// Below lg the two columns become tabs (side by side at lg+ regardless)
const activeTab = ref<'character' | 'screen'>('character')

const TAB_LABELS = { character: 'Character', screen: 'Screen' } as const

/**
 * What each shortcut does. Keyed by action rather than by key, and exhaustive
 * over `EditorAction`, so a shortcut added to the map without a handler here
 * fails the type-check instead of doing nothing (`utils/shortcuts.ts`).
 */
const ACTIONS: Record<EditorAction, () => void> = {
  undo: () => editor.undo(),
  redo: () => editor.redo(),
  save: () => store.saveCurrent(),
  help: () => (showHelp.value = true),
  back: () => router.push('/'),

  prevChar: () => editor.selectChar(editor.selectedChar - 1),
  nextChar: () => editor.selectChar(editor.selectedChar + 1),
  fill: () => editor.applyTransform('fill'),
  clear: () => editor.applyTransform('clear'),
  invert: () => editor.applyTransform('invert'),
  flipH: () => editor.applyTransform('flipH'),
  flipV: () => editor.applyTransform('flipV'),
  rotateRight: () => editor.applyTransform('rotateRight'),
  rotateLeft: () => editor.applyTransform('rotateLeft'),
  shiftLeft: () => editor.applyTransform('shiftLeft'),
  shiftRight: () => editor.applyTransform('shiftRight'),
  shiftUp: () => editor.applyTransform('shiftUp'),
  shiftDown: () => editor.applyTransform('shiftDown'),

  slotScreen: () => editor.setActiveSlot('screen'),
  slotBorder: () => editor.setActiveSlot('border'),
  slotChar: () => editor.setActiveSlot('fg'),
  slotAux: () => editor.setActiveSlot('aux'),

  brushChar: () => editor.setBrushMode('char'),
  brushColor: () => editor.setBrushMode('color'),
  brushBoth: () => editor.setBrushMode('both'),
  prevScreen: () => editor.selectScreen(editor.selectedScreen - 1),
  nextScreen: () => editor.selectScreen(editor.selectedScreen + 1),
  zoomIn: () => editor.zoomScreen(1),
  zoomOut: () => editor.zoomScreen(-1),
  toggleGrid: () => editor.toggleGrid(),
  toggleAspect: () => editor.toggleAspect(),
}

function onKeydown(event: KeyboardEvent) {
  // Never fire while typing or while a dialog is open (Esc there closes it
  // natively). A focused canvas in cursor mode stops the keys it consumes from
  // reaching here, so arrows mean "move the cursor" only while it holds focus.
  const target = event.target as HTMLElement | null
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable ||
    document.querySelector('dialog[open]')
  ) {
    return
  }

  const action = matchEditorShortcut(event)
  if (!action) return
  event.preventDefault()
  ACTIONS[action]()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// Desktop only, and inert in a browser tab. A menu item carries the same
// action id a key would, so it lands in the table above — no second command
// list, and nothing to keep in step.
let stopMenuAction: (() => void) | undefined
onMounted(() => {
  reportMenuContext(editorMenuContext())
  stopMenuAction = onMenuAction((action) => {
    if (action in ACTIONS) ACTIONS[action as EditorAction]()
  })
})
onBeforeUnmount(() => stopMenuAction?.())

/**
 * Storage failures have to be visible here, not only in the project manager:
 * autosave is the only thing writing while the editor is open, so a full quota
 * would otherwise show up as nothing more than a header stuck on "Unsaved".
 */
const saveError = computed(() => store.lastError)
</script>

<template>
  <div class="flex h-dvh flex-col">
    <header class="flex h-12 shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-900 px-3">
      <AppButton
        label="Back to Projects"
        :shortcut="shortcutLabel('back')"
        placement="bottom"
        @click="router.push('/')"
      >
        <ArrowLeft class="size-4" />
      </AppButton>
      <template v-if="store.current">
        <h1 class="truncate text-2xl">{{ store.current.name }}</h1>
        <span
          class="shrink-0 rounded-xs border border-ink-600 px-1.5 py-0.5 text-[10px] tracking-wider text-ink-300 uppercase"
        >
          {{ MODES[store.current.type].label }}
        </span>
        <!-- Fixed width so the changing label doesn't shift neighboring content -->
        <span class="ml-auto w-14 shrink-0 text-right text-xs text-ink-500">
          {{ SAVE_STATE_LABEL[store.saveState] }}
        </span>
      </template>
      <!-- Reachable by pointer as well as by key: on a tablet the shortcut that
           opens this dialog is the one thing the user cannot press -->
      <AppButton
        label="Keyboard Shortcuts"
        :shortcut="shortcutLabel('help')"
        placement="bottom"
        :class="store.current ? '' : 'ml-auto'"
        @click="showHelp = true"
      >
        <Keyboard class="size-4" />
      </AppButton>
    </header>

    <!-- Autosave failures (a full quota, most likely) — the header's "Unsaved"
         alone doesn't say that anything went wrong -->
    <div
      v-if="saveError"
      class="flex shrink-0 items-center justify-between gap-3 border-b border-alert bg-alert/15 px-3 py-2 text-sm text-ink-100"
      role="alert"
    >
      <p>{{ saveError }}</p>
      <div class="flex shrink-0 gap-1">
        <AppButton label="Save Now" show-label @click="store.saveCurrent()" />
        <AppButton label="Dismiss" @click="store.dismissError()">
          <X class="size-4" />
        </AppButton>
      </div>
    </div>

    <main
      v-if="openState === 'loading'"
      class="flex flex-1 items-center justify-center text-ink-500"
    >
      <p class="font-display text-2xl tracking-wider">Opening…</p>
    </main>

    <main v-else-if="store.current" class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <!-- Mobile/portrait tab switcher (hidden once both columns fit side by side,
           where it stops being a choice and the tablist stops existing with it) -->
      <div
        class="flex shrink-0 gap-1 border-b border-ink-800 p-2 lg:hidden"
        role="tablist"
        aria-label="Editor panel"
      >
        <button
          v-for="tab in ['character', 'screen'] as const"
          :key="tab"
          type="button"
          class="font-display flex-1 rounded-sm border py-2 text-sm tracking-wider transition-colors"
          :class="
            activeTab === tab
              ? 'border-ink-300 bg-ink-100 text-ink-950'
              : 'border-ink-700 bg-ink-850 text-ink-300'
          "
          role="tab"
          :aria-selected="activeTab === tab"
          @click="activeTab = tab"
        >
          {{ TAB_LABELS[tab] }}
        </button>
      </div>

      <!-- The left column scrolls vertically as a last resort; x is clipped because
           the invisible hover tooltips overhang the edge and would otherwise create
           a horizontal scrollbar -->
      <!-- flex-1 fills the column height on mobile so the picker can expand;
           on lg the aside hugs its width instead (flex-none + shrink-0) -->
      <aside
        class="min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto p-4 lg:flex lg:flex-none lg:shrink-0 lg:border-r lg:border-ink-800 lg:p-4"
        :class="activeTab === 'character' ? 'flex' : 'hidden'"
      >
        <CharacterPanel class="shrink-0" />
        <hr class="shrink-0 border-ink-800" />
        <CharsetPicker @open-settings="showSettings = true" />
      </aside>

      <!-- Wrapper toggles visibility so it doesn't fight ScreenPanel's own `flex`.
           min-w-0 lets it shrink below the zoomed canvas width so the panel's own
           overflow scrolls instead of pushing the whole page sideways. -->
      <div
        class="min-h-0 min-w-0 flex-1 p-4 lg:flex"
        :class="activeTab === 'screen' ? 'flex' : 'hidden'"
      >
        <ScreenPanel />
      </div>

      <ProjectSettingsDialog v-model="showSettings" />
    </main>

    <main v-else class="flex flex-1 items-center justify-center text-ink-500">
      <div class="flex flex-col items-center gap-4 text-center">
        <div>
          <p class="font-display text-2xl tracking-wider">This project could not be opened</p>
          <p class="text-sm">It may have been deleted, or this link is stale.</p>
        </div>
        <button
          type="button"
          class="font-display rounded-sm border border-ink-600 px-3 py-2 text-sm tracking-wider text-ink-200 transition-colors hover:bg-ink-800"
          @click="router.push('/')"
        >
          Back to Projects
        </button>
      </div>
    </main>

    <HelpDialog v-model="showHelp" />
  </div>
</template>
