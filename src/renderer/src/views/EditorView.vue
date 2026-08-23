<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, Keyboard, X } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import AppButton from '@/components/base/AppButton.vue'
import HelpDialog from '@/components/HelpDialog.vue'
import CharacterPanel from '@/components/editor/CharacterPanel.vue'
import CharsetPicker from '@/components/editor/CharsetPicker.vue'
import NewProjectDialog from '@/components/projects/NewProjectDialog.vue'
import ProjectSettingsDialog from '@/components/editor/ProjectSettingsDialog.vue'
import ScreenPanel from '@/components/editor/ScreenPanel.vue'
import { useNewDocument } from '@/composables/newDocument'
import { MODES } from '@/domain/modes'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'
import { downloadText } from '@/utils/download'
import { actionLabel, editorMenuContext, onMenuAction, reportMenuContext } from '@/utils/menu'
import { matchEditorShortcut, shortcutLabel, type EditorAction } from '@/utils/shortcuts'
import { MENU_COMMANDS, type MenuCommand } from '@shared/menu'

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
  },
  { immediate: true },
)
onBeforeUnmount(() => void store.close())

/**
 * Selection and undo history belong to the project object on screen.
 *
 * Watching the *project* rather than the route id is what covers Phase F5's
 * reload: a document taken back from disk replaces the project under an
 * unchanged `/edit/<id>`, and an undo stack whose commands describe the version
 * that was just discarded is worse than no undo stack at all (D7).
 */
watch(
  () => store.current,
  () => editor.reset(),
)

/** The quiet half of D7: "Reloaded from disk", which nobody has to act on. */
let noticeTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => store.lastNotice,
  (notice) => {
    clearTimeout(noticeTimer)
    if (notice) noticeTimer = setTimeout(() => store.dismissNotice(), 5000)
  },
)
onBeforeUnmount(() => clearTimeout(noticeTimer))

const SAVE_STATE_LABEL = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved' } as const

/**
 * What the header shows the open project as.
 *
 * On the desktop that is the *file's* name — a document is called what its file
 * is called, and the header is the only place that says so now that no list
 * view carries it. In the browser `documentName` is null and the project's own
 * name stands, exactly as before. A fallback, not a branch on the shell.
 */
const title = computed(() => store.documentName ?? store.current?.name ?? '')

/**
 * "Back to Projects" in the browser, "Close Document" on the desktop (D14).
 * Taken from the menu table rather than written here, so this button and its
 * File menu item cannot end up saying different things.
 */
const backLabel = computed(() => actionLabel('back'))

const showSettings = ref(false)
const showHelp = ref(false)

/**
 * File ▸ New Project… and File ▸ New from Sample ▸, which work here as well as
 * on the start screen (F7). Opening the dialog is all this view does with them;
 * the flush that has to happen before the new document replaces this one is the
 * store's, where every other arrival's is (D17).
 */
const newDocument = useNewDocument()

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

/**
 * The File menu's own commands — the ones no key fires (F7).
 *
 * Exhaustive over `MenuCommand` for the same reason `ACTIONS` is exhaustive
 * over `EditorAction`: a command added to the menu table without a handler here
 * is a type error rather than a dead menu item.
 */
const COMMANDS: Record<MenuCommand, () => void> = {
  saveCopy: () => void saveCopy(),
}

/**
 * *Save a Copy…* (D3, F7).
 *
 * The open document is untouched: this serializes what is in the editor and
 * hands it to the shared download path, which is a save dialog on the desktop
 * and a browser download in a tab. The name is the document one — `Title
 * Screen.vic20` — because a copy of a project is a project file, and both
 * shells write the same one.
 */
async function saveCopy(): Promise<void> {
  const project = store.current
  if (!project) return
  const payload = await store.exportProject(project.id)
  if (!payload) return
  downloadText(payload.filename, payload.json, 'application/json')
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
    // New Project… and New from Sample ▸ open the same dialog they do on the
    // start screen, and it answers for both (F7).
    if (newDocument.handles(action)) return
    if (action in ACTIONS) return ACTIONS[action as EditorAction]()
    if ((MENU_COMMANDS as readonly string[]).includes(action)) COMMANDS[action as MenuCommand]()
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
        :label="backLabel"
        :shortcut="shortcutLabel('back')"
        placement="bottom"
        @click="router.push('/')"
      >
        <ArrowLeft class="size-4" />
      </AppButton>
      <template v-if="store.current">
        <h1 class="truncate text-2xl">{{ title }}</h1>
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

    <!-- A document that changed on disk while nothing here was unsaved was
         simply taken (D7). Worth saying, not worth interrupting for. -->
    <div
      v-if="store.lastNotice"
      class="flex shrink-0 items-center justify-between gap-3 border-b border-ink-700 bg-ink-850 px-3 py-2 text-sm text-ink-300"
      role="status"
    >
      <p>{{ store.lastNotice }}</p>
      <AppButton label="Dismiss" @click="store.dismissNotice()">
        <X class="size-4" />
      </AppButton>
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
          <!-- The banner above carries the reason when there is one to give —
               a file that moved, or one that is not a project (Phase F3). -->
          <p class="text-sm">
            {{ store.lastError ?? 'It may have been deleted, or this link is stale.' }}
          </p>
        </div>
        <button
          type="button"
          class="font-display rounded-sm border border-ink-600 px-3 py-2 text-sm tracking-wider text-ink-200 transition-colors hover:bg-ink-800"
          @click="router.push('/')"
        >
          {{ backLabel }}
        </button>
      </div>
    </main>

    <HelpDialog v-model="showHelp" />

    <!-- Only ever opened from the File menu, so only ever on the desktop — but
         the view does not say so: it binds a location the browser never
         supplies, and the dialog shows the row only when there is one (D13). -->
    <NewProjectDialog
      v-model="newDocument.open.value"
      v-model:location="newDocument.location.value"
      :sample="newDocument.sample.value"
      @choose-location="newDocument.chooseLocation()"
      @create="newDocument.create($event)"
    />
  </div>
</template>
