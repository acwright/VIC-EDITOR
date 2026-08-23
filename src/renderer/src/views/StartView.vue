<script setup lang="ts">
/**
 * The desktop's start screen (PLAN.md D12).
 *
 * A launcher, not a project manager. It offers *New…*, *Open…* and the
 * samples, and it never claims to list "your projects" — the app no longer
 * knows what those are, because they are files now and the OS is the list
 * (§4). Recent Documents joins it in Phase F4, which is what makes the launcher
 * a place you come back to rather than a dialog you get past.
 *
 * The browser build never reaches this view: the router picks one home route
 * per shell (D13), and `ProjectManagerView.vue` is the other one, untouched.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FileText, FolderOpen, Github, Keyboard, Plus, X } from 'lucide-vue-next'
import AppButton from '@/components/base/AppButton.vue'
import HelpDialog from '@/components/HelpDialog.vue'
import NewProjectDialog from '@/components/projects/NewProjectDialog.vue'
import type { CreateProjectOptions } from '@/domain/factory'
import { SAMPLES, type Sample } from '@/samples'
import { useProjectsStore } from '@/stores/projects'
import { managerMenuContext, onMenuAction, reportMenuContext } from '@/utils/menu'
import { matchManagerShortcut, shortcutLabel, type ManagerAction } from '@/utils/shortcuts'

const store = useProjectsStore()
const router = useRouter()

const version = __APP_VERSION__

const showNewProject = ref(false)
const showHelp = ref(false)
/**
 * The sample the New dialog is standing in for, or null for a blank project.
 * *New from Sample…* goes through the same dialog so that it asks the same two
 * questions — what to call it and where it goes — rather than dropping a file
 * somewhere the user did not choose (D10).
 */
const sampleTarget = ref<Sample | null>(null)

/** Where a new document would go, as the dialog shows it (D10). */
const location = ref('')

/** The same keys the manager has: this is the view they belong to here. */
const ACTIONS: Record<ManagerAction, () => void> = {
  newProject: () => startNew(null),
  help: () => (showHelp.value = true),
}

function onKeydown(event: KeyboardEvent) {
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

  const action = matchManagerShortcut(event)
  if (!action) return
  event.preventDefault()
  ACTIONS[action]()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

let stopMenuAction: (() => void) | undefined
onMounted(() => {
  reportMenuContext(managerMenuContext())
  stopMenuAction = onMenuAction((action) => {
    if (action in ACTIONS) ACTIONS[action as ManagerAction]()
  })
})
onBeforeUnmount(() => stopMenuAction?.())

// Asked each time the dialog opens rather than once on mount: opening a
// document moves the default, and the dialog has to show where the file will
// actually land.
watch(showNewProject, async (open) => {
  if (open) location.value = (await store.defaultLocation()) ?? ''
})

function startNew(sample: Sample | null) {
  sampleTarget.value = sample
  showNewProject.value = true
}

async function chooseLocation() {
  const chosen = await store.chooseLocation()
  if (chosen) location.value = chosen
}

async function onCreate(options: CreateProjectOptions) {
  const sample = sampleTarget.value
  // A sample is a whole project rather than a set of options, so it is built
  // and then renamed to what the dialog collected.
  const project = sample
    ? await store.createFrom({ ...sample.build(), name: options.name })
    : await store.create(options)
  if (project) {
    showNewProject.value = false
    router.push(`/edit/${project.id}`)
  }
  // On failure the dialog stays open; the banner says why — most often that a
  // document of that name is already in that folder.
}

async function openDocument() {
  const project = await store.openDocument()
  if (project) router.push(`/edit/${project.id}`)
}
</script>

<template>
  <div class="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-10">
    <header class="mb-8 border-b border-ink-800 pb-4">
      <h1 class="text-4xl">VIC-20 Editor</h1>
      <p class="text-sm text-ink-400">
        Character &amp; screen editor for the Commodore VIC-20 (MOS 6560/6561)
      </p>
    </header>

    <div
      v-if="store.lastError"
      class="mb-4 flex items-center justify-between gap-3 rounded-sm border border-alert bg-alert/15 px-3 py-2 text-sm text-ink-100"
      role="alert"
    >
      <p>{{ store.lastError }}</p>
      <AppButton label="Dismiss" @click="store.dismissError()">
        <X class="size-4" />
      </AppButton>
    </div>

    <!-- The two things this screen exists for, given the same weight. Every
         other way into a document is the OS: a double-click, Open Recent, a
         file dropped on the window (F4). -->
    <section class="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        class="flex cursor-pointer flex-col items-start gap-1 rounded-md border border-ink-700 bg-ink-900 p-4 text-left transition-colors hover:border-ink-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300"
        @click="startNew(null)"
      >
        <Plus class="size-5 text-ink-300" />
        <span class="font-display text-xl tracking-wider">New Project…</span>
        <span class="text-xs text-ink-500">Choose a type, a name and where the file goes</span>
      </button>
      <button
        type="button"
        class="flex cursor-pointer flex-col items-start gap-1 rounded-md border border-ink-700 bg-ink-900 p-4 text-left transition-colors hover:border-ink-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300"
        @click="openDocument()"
      >
        <FolderOpen class="size-5 text-ink-300" />
        <span class="font-display text-xl tracking-wider">Open…</span>
        <span class="text-xs text-ink-500">Any project file, wherever you keep it</span>
      </button>
    </section>

    <section v-if="SAMPLES.length" class="mt-8">
      <h2 class="font-display mb-2 text-sm tracking-wider text-ink-400">New from Sample</h2>
      <div class="grid gap-2 sm:grid-cols-2" aria-label="Sample projects">
        <button
          v-for="sample in SAMPLES"
          :key="sample.id"
          type="button"
          class="flex cursor-pointer items-start gap-2 rounded-md border border-ink-800 bg-ink-900 p-3 text-left transition-colors hover:border-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300"
          @click="startNew(sample)"
        >
          <FileText class="mt-0.5 size-4 shrink-0 text-ink-500" />
          <span class="min-w-0">
            <span class="font-display block text-lg tracking-wider">{{ sample.name }}</span>
            <span class="mt-0.5 block text-xs text-ink-500">{{ sample.description }}</span>
          </span>
        </button>
      </div>
    </section>

    <footer
      class="mt-8 flex items-center justify-between gap-3 border-t border-ink-800 pt-4 text-xs text-ink-500"
    >
      <p>© 2026 A.C. Wright Design · v{{ version }}</p>
      <div class="flex items-center gap-3">
        <AppButton
          label="Keyboard Shortcuts"
          :shortcut="shortcutLabel('help')"
          placement="top"
          @click="showHelp = true"
        >
          <Keyboard class="size-4" />
        </AppButton>
        <a
          href="https://github.com/acwright/VIC-EDITOR"
          target="_blank"
          rel="noopener"
          class="flex items-center gap-1.5 transition-colors hover:text-ink-200"
          aria-label="GitHub repository"
        >
          <Github class="size-4" />
          <span>GitHub</span>
        </a>
      </div>
    </footer>

    <HelpDialog v-model="showHelp" />

    <!-- The location row exists because this parent passes one. The dialog is
         shared with the browser's manager, which passes none and shows none —
         the fork stays at the route, not inside the component (D13). -->
    <NewProjectDialog
      v-model="showNewProject"
      v-model:location="location"
      :sample="sampleTarget"
      @choose-location="chooseLocation"
      @create="onCreate"
    />
  </div>
</template>
