<script setup lang="ts">
/**
 * "Your projects are becoming files" — the first `v2.0` launch (PLAN.md D19).
 *
 * Shown once, on the desktop only, and only when there is something in browser
 * storage to copy. It has two things to say and says them in the same sheet:
 * what is *about* to happen, and then what happened — because the second is
 * where the user is asked whether to remove the originals, and that question
 * only makes sense next to the list of files that were written.
 *
 * The component decides nothing. `StartView.vue` holds the migrator and the
 * state; this renders it and emits the four things a person can do here, which
 * is the same division `NewProjectDialog.vue` uses.
 */
import { computed } from 'vue'
import { Copy, FolderOpen, Trash2 } from 'lucide-vue-next'
import AppButton from '@/components/base/AppButton.vue'
import AppDialog from '@/components/base/AppDialog.vue'
import type { MigrationOutcome, MigrationPlan } from '@/persistence/migration'

const open = defineModel<boolean>({ required: true })

const props = defineProps<{
  /** What is waiting in browser storage. */
  plan: MigrationPlan | null
  /** Where the copies go, as main writes it for display. */
  folder: string
  /** What a run did, once one has. Null until then. */
  outcome: MigrationOutcome | null
  /** A run is in flight; the buttons that would start another go quiet. */
  busy: boolean
  /** The browser copies have been removed, which is the last thing this says. */
  removed: boolean
}>()

const emit = defineEmits<{
  copy: []
  chooseFolder: []
  removeCopies: []
}>()

/** Before or after: the whole layout hangs off this. */
const finished = computed(() => props.outcome !== null)

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

const offerCount = computed(() => count(props.plan?.documents.length ?? 0, 'project', 'projects'))
</script>

<template>
  <AppDialog
    v-model="open"
    size="lg"
    :title="finished ? 'Projects Copied' : 'Your Projects Are Becoming Files'"
  >
    <!-- The offer. Every sentence here is a promise the run has to keep: it
         copies, it never moves, and it can be pointed somewhere else first. -->
    <div v-if="!finished" class="flex flex-col gap-3 text-sm text-ink-300">
      <p>
        This version keeps each project as a file you can put beside your source and commit with it.
        Your {{ offerCount }} in this app's browser storage can be copied out now.
      </p>

      <div>
        <span class="font-display mb-1 block text-sm tracking-wider text-ink-400">Copy To</span>
        <div class="flex items-center gap-2">
          <!-- Left to right, unlike the New dialog's location row: this path
               is written for a person (`~` collapsed, one folder deep), and
               `dir=rtl` renders a leading `~` or `/` at the *end* of the line —
               "Documents/VIC-20 Editor/~", which is measurably worse than a
               long path truncating. -->
          <p
            class="min-w-0 flex-1 truncate rounded-sm border border-ink-700 bg-ink-850 px-3 py-2 text-left text-sm text-ink-300"
            :title="folder"
          >
            {{ folder }}
          </p>
          <AppButton label="Choose Folder" :disabled="busy" @click="emit('chooseFolder')">
            <FolderOpen class="size-4" />
          </AppButton>
        </div>
      </div>

      <ul class="list-disc pl-5 text-xs text-ink-500">
        <li>Nothing is moved or deleted — the originals stay in this app's browser storage.</li>
        <li>The copies are added to Recent Documents, so they are one click away.</li>
        <li>A name already taken in that folder gets a number, so no file is overwritten.</li>
      </ul>

      <p v-if="plan && plan.unreadable.length > 0" class="text-xs text-alert-bright">
        {{ count(plan.unreadable.length, 'project', 'projects') }} could not be read and will be
        skipped: {{ plan.unreadable.join(', ') }}. They stay in browser storage.
      </p>
    </div>

    <!-- What happened. The list is the point: it is the only place the user
         ever sees which file each project became. -->
    <div v-else class="flex flex-col gap-3 text-sm text-ink-300">
      <p v-if="outcome!.written.length > 0">
        {{ count(outcome!.written.length, 'project was', 'projects were') }} copied to
        <strong class="text-ink-100">{{ outcome!.folder }}</strong
        >.
      </p>
      <p v-else class="text-alert-bright">
        Nothing could be copied to {{ outcome!.folder }}. Your projects are untouched in browser
        storage, and this will be offered again next time the app starts.
      </p>

      <ul
        v-if="outcome!.written.length > 0"
        class="max-h-48 overflow-y-auto rounded-sm border border-ink-800 bg-ink-850 p-2 text-xs"
        aria-label="Files written"
      >
        <li v-for="entry in outcome!.written" :key="entry.id" class="truncate py-0.5 text-ink-300">
          {{ entry.file }}
        </li>
      </ul>

      <div v-if="outcome!.failed.length > 0" class="text-xs text-alert-bright">
        <p>These stayed in browser storage and were not copied:</p>
        <ul class="mt-1 list-disc pl-5">
          <li v-for="entry in outcome!.failed" :key="entry.id">
            {{ entry.name }} — {{ entry.reason }}
          </li>
        </ul>
      </div>

      <p v-if="outcome!.unreadable.length > 0" class="text-xs text-alert-bright">
        {{ count(outcome!.unreadable.length, 'project', 'projects') }} could not be read and
        {{ outcome!.unreadable.length === 1 ? 'was' : 'were' }} skipped:
        {{ outcome!.unreadable.join(', ') }}.
      </p>

      <p v-if="removed" class="text-xs text-ink-500">
        The browser-stored copies have been removed. The files are now the only copies — they are in
        {{ outcome!.folder }} and in Recent Documents.
      </p>
      <p v-else-if="outcome!.written.length > 0" class="text-xs text-ink-500">
        The originals are still in this app's browser storage, and stay there unless you remove
        them.
      </p>
    </div>

    <template #footer>
      <template v-if="!finished">
        <AppButton label="Not Now" show-label :disabled="busy" @click="open = false" />
        <AppButton label="Copy Projects" show-label :disabled="busy" @click="emit('copy')">
          <Copy class="size-4" />
        </AppButton>
      </template>
      <template v-else-if="removed || outcome!.written.length === 0">
        <AppButton label="Done" show-label @click="open = false" />
      </template>
      <template v-else>
        <AppButton label="Keep Browser Copies" show-label @click="open = false" />
        <AppButton
          label="Remove Browser Copies"
          show-label
          :disabled="busy"
          @click="emit('removeCopies')"
        >
          <Trash2 class="size-4" />
        </AppButton>
      </template>
    </template>
  </AppDialog>
</template>
