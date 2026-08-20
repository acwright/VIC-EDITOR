<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import {
  Copy,
  Download,
  Github,
  Keyboard,
  Pencil,
  Plus,
  Share2,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next'
import AppButton from '@/components/base/AppButton.vue'
import AppDialog from '@/components/base/AppDialog.vue'
import AppTextInput from '@/components/base/AppTextInput.vue'
import HelpDialog from '@/components/HelpDialog.vue'
import NewProjectDialog from '@/components/projects/NewProjectDialog.vue'
import ShareDialog from '@/components/projects/ShareDialog.vue'
import { MODES } from '@/domain/modes'
import type { CreateProjectOptions } from '@/domain/factory'
import type { Project } from '@/domain/types'
import { ShareLinkError, decodeShare, takePendingShare } from '@/domain/share'
import type { ProjectSummary } from '@/persistence/repository'
import { SAMPLES, type Sample } from '@/samples'
import { useProjectsStore } from '@/stores/projects'
import { managerMenuContext, onMenuAction, reportMenuContext } from '@/utils/menu'
import { matchManagerShortcut, shortcutLabel, type ManagerAction } from '@/utils/shortcuts'

const store = useProjectsStore()
const router = useRouter()

const version = __APP_VERSION__

onMounted(() => store.refresh())

/** The manager's own keys, from the same map the editor and README use. */
const ACTIONS: Record<ManagerAction, () => void> = {
  newProject: () => (showNewProject.value = true),
  help: () => (showHelp.value = true),
}

// Nothing fires while typing or while a dialog is open
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

// Desktop only, and inert in a browser tab. The editor's items go dark here:
// there is no project open for them to act on.
let stopMenuAction: (() => void) | undefined
onMounted(() => {
  reportMenuContext(managerMenuContext())
  stopMenuAction = onMenuAction((action) => {
    if (action in ACTIONS) ACTIONS[action as ManagerAction]()
  })
})
onBeforeUnmount(() => stopMenuAction?.())

function openProject(id: string) {
  router.push(`/edit/${id}`)
}

// --- New project ---
const showNewProject = ref(false)
const showHelp = ref(false)

function onCreate(options: CreateProjectOptions) {
  const project = store.create(options)
  if (project) {
    showNewProject.value = false
    openProject(project.id)
  }
  // On failure the dialog stays open; the error banner explains why.
}

// --- Samples ---
function loadSample(sample: Sample) {
  const project = store.createFrom(sample.build())
  if (project) openProject(project.id)
}

// --- Rename ---
const renameTarget = ref<ProjectSummary | null>(null)
const renameValue = ref('')

function startRename(summary: ProjectSummary) {
  renameTarget.value = summary
  renameValue.value = summary.name
}

function confirmRename() {
  const target = renameTarget.value
  const name = renameValue.value.trim()
  if (!target || !name) return
  if (store.rename(target.id, name)) renameTarget.value = null
}

// --- Delete ---
const deleteTarget = ref<ProjectSummary | null>(null)

function confirmDelete() {
  if (!deleteTarget.value) return
  store.remove(deleteTarget.value.id)
  deleteTarget.value = null
}

// --- Download / upload ---
function download(id: string) {
  const payload = store.exportProject(id)
  if (!payload) return
  const url = URL.createObjectURL(new Blob([payload.json], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = payload.filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const fileInput = useTemplateRef('fileInput')

async function onUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-uploading the same file
  if (!file) return
  store.importProject(await file.text())
}

// --- Share ---
const shareTarget = ref<ProjectSummary | null>(null)
const showShare = ref(false)

function startShare(summary: ProjectSummary) {
  shareTarget.value = summary
  showShare.value = true
}

// A link opened in this browser: decode it, then offer to add it (Decision 18)
const sharedProject = ref<Project | null>(null)

onMounted(async () => {
  const payload = takePendingShare()
  if (!payload) return
  try {
    sharedProject.value = await decodeShare(payload)
  } catch (error) {
    store.lastError =
      error instanceof ShareLinkError
        ? error.message
        : `That share link could not be opened: ${(error as Error).message}`
  }
})

function acceptShared() {
  const project = sharedProject.value
  if (!project) return
  sharedProject.value = null
  const added = store.adopt(project)
  if (added) openProject(added.id)
}

// --- Formatting ---

/**
 * Geometry as the list shows it: `22×23` cells, and the character size beside
 * it only when it is the non-default 8×16 — on the VIC both are project
 * settings rather than consequences of the type (D3, D8), so the badge alone
 * doesn't say what a project is.
 */
function geometryLabel(summary: ProjectSummary): string {
  const cells = `${summary.columns}×${summary.rows}`
  return summary.charHeight === 16 ? `${cells} · 8×16` : cells
}

function geometryTitle(summary: ProjectSummary): string {
  return `${summary.columns} columns × ${summary.rows} rows, 8×${summary.charHeight} characters`
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function formatDate(iso: string): string {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? '—' : dateFormat.format(time)
}
</script>

<template>
  <div class="mx-auto flex min-h-dvh max-w-5xl flex-col px-6 py-10">
    <header class="mb-8 flex items-end justify-between border-b border-ink-800 pb-4">
      <div>
        <h1 class="text-4xl">VIC-20 Editor</h1>
        <p class="text-sm text-ink-400">
          Character &amp; screen editor for the Commodore VIC-20 (MOS 6560/6561)
        </p>
      </div>
      <div class="flex gap-2">
        <AppButton
          label="Keyboard Shortcuts"
          :shortcut="shortcutLabel('help')"
          @click="showHelp = true"
        >
          <Keyboard class="size-4" />
        </AppButton>
        <AppButton label="Upload Project" @click="fileInput?.click()">
          <Upload class="size-4" />
        </AppButton>
        <AppButton
          label="New Project"
          :shortcut="shortcutLabel('newProject')"
          show-label
          @click="showNewProject = true"
        >
          <Plus class="size-4" />
        </AppButton>
      </div>
    </header>

    <input
      ref="fileInput"
      type="file"
      accept=".json,application/json"
      class="hidden"
      @change="onUpload"
    />

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

    <ul v-if="store.summaries.length" class="flex flex-col gap-2">
      <li
        v-for="summary in store.summaries"
        :key="summary.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-ink-800 bg-ink-900 p-2 transition-colors hover:border-ink-600"
      >
        <!-- items-center, not items-baseline: the badge is a bordered chip, and
             sitting its text on the 2xl name's baseline hangs it below the
             name's optical center -->
        <button
          type="button"
          class="flex min-w-0 flex-1 basis-full cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300 sm:basis-0"
          @click="openProject(summary.id)"
        >
          <span class="font-display truncate text-2xl tracking-wider">{{ summary.name }}</span>
          <span
            class="shrink-0 rounded-xs border border-ink-600 px-1.5 py-0.5 text-[10px] tracking-wider text-ink-300 uppercase"
          >
            {{ MODES[summary.type].label }}
          </span>
        </button>
        <!-- Own row below the name on narrow viewports; inline with it from sm up -->
        <div class="flex min-w-0 flex-1 basis-full items-center gap-x-4 sm:flex-none sm:basis-auto">
          <span
            class="shrink-0 px-2 text-xs tabular-nums text-ink-400 sm:px-0"
            :title="geometryTitle(summary)"
          >
            {{ geometryLabel(summary) }}
          </span>
          <span class="truncate text-xs tabular-nums text-ink-500">
            {{ formatDate(summary.modifiedAt) }}
          </span>
          <div class="ml-auto flex shrink-0 gap-1">
            <AppButton label="Rename" @click="startRename(summary)">
              <Pencil class="size-4" />
            </AppButton>
            <AppButton label="Duplicate" @click="store.duplicate(summary.id)">
              <Copy class="size-4" />
            </AppButton>
            <AppButton label="Share Link" @click="startShare(summary)">
              <Share2 class="size-4" />
            </AppButton>
            <AppButton label="Download" @click="download(summary.id)">
              <Download class="size-4" />
            </AppButton>
            <AppButton label="Delete" @click="deleteTarget = summary">
              <Trash2 class="size-4" />
            </AppButton>
          </div>
        </div>
      </li>
    </ul>

    <div
      v-else
      class="flex flex-1 flex-col items-center justify-center rounded-md border border-dashed border-ink-700 text-ink-500"
    >
      <p class="font-display text-2xl tracking-wider">No projects yet</p>
      <p class="text-sm">Create a new project or upload a saved one</p>
    </div>

    <section v-if="SAMPLES.length" class="mt-8">
      <h2 class="font-display mb-2 text-sm tracking-wider text-ink-400">Load a Sample</h2>
      <!-- One row at lg+, however many samples there are: a hard-coded column
           count orphans the last card onto its own row as samples are added.
           Cards stretch to the tallest description, so they stay level. -->
      <div
        class="grid gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(var(--sample-cols),minmax(0,1fr))]"
        :style="{ '--sample-cols': SAMPLES.length }"
        aria-label="Sample projects"
      >
        <button
          v-for="sample in SAMPLES"
          :key="sample.id"
          type="button"
          class="cursor-pointer rounded-md border border-ink-800 bg-ink-900 p-3 text-left transition-colors hover:border-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300"
          @click="loadSample(sample)"
        >
          <span class="font-display block text-lg tracking-wider">{{ sample.name }}</span>
          <span class="mt-0.5 block text-xs text-ink-500">{{ sample.description }}</span>
        </button>
      </div>
    </section>

    <footer
      class="mt-8 flex items-center justify-between border-t border-ink-800 pt-4 text-xs text-ink-500"
    >
      <p>© 2026 A.C. Wright Design · v{{ version }}</p>
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
    </footer>

    <HelpDialog v-model="showHelp" />

    <NewProjectDialog v-model="showNewProject" @create="onCreate" />

    <ShareDialog
      v-model="showShare"
      :project-id="shareTarget?.id ?? null"
      :project-name="shareTarget?.name ?? ''"
    />

    <AppDialog
      :model-value="sharedProject !== null"
      title="Shared Project"
      @update:model-value="sharedProject = null"
    >
      <p class="text-sm text-ink-300">
        Someone shared <strong class="text-ink-100">{{ sharedProject?.name }}</strong> with you.
      </p>
      <p class="mt-1 text-xs text-ink-500">
        {{ sharedProject ? MODES[sharedProject.type].label : '' }} ·
        {{ sharedProject?.screens.length }}
        {{ sharedProject?.screens.length === 1 ? 'screen' : 'screens' }} · adding it saves a copy to
        this browser.
      </p>
      <template #footer>
        <AppButton label="Discard" show-label @click="sharedProject = null" />
        <AppButton label="Add & Open" show-label @click="acceptShared">
          <Plus class="size-4" />
        </AppButton>
      </template>
    </AppDialog>

    <AppDialog
      :model-value="renameTarget !== null"
      title="Rename Project"
      @update:model-value="renameTarget = null"
    >
      <form @submit.prevent="confirmRename">
        <AppTextInput v-model="renameValue" label="Name" autofocus />
      </form>
      <template #footer>
        <AppButton
          label="Rename"
          show-label
          :disabled="renameValue.trim().length === 0"
          disabled-reason="a project needs a name"
          @click="confirmRename"
        >
          <Pencil class="size-4" />
        </AppButton>
      </template>
    </AppDialog>

    <AppDialog
      :model-value="deleteTarget !== null"
      title="Delete Project"
      @update:model-value="deleteTarget = null"
    >
      <p class="text-sm text-ink-300">
        Delete <strong class="text-ink-100">{{ deleteTarget?.name }}</strong
        >? This cannot be undone — download it first if you want a copy.
      </p>
      <template #footer>
        <AppButton label="Cancel" show-label @click="deleteTarget = null" />
        <AppButton label="Delete" show-label @click="confirmDelete">
          <Trash2 class="size-4" />
        </AppButton>
      </template>
    </AppDialog>
  </div>
</template>
