<script setup lang="ts">
/**
 * The file changed underneath the editor, and it cannot be resolved without
 * asking (PLAN.md D7).
 *
 * Two situations reach here, and both name **both sides** before offering a
 * button, because either answer throws something away:
 *
 * - **The file changed and there are unsaved edits.** A `git checkout`, a
 *   `git stash`, another program saving over it. Taking the file discards the
 *   edit; keeping the edit overwrites the file. The dialog says so in those
 *   words rather than in "OK / Cancel".
 * - **The file is gone.** There is nothing to reload, so the only two things
 *   left are to put it back or to leave it alone — and *leaving it alone* is
 *   the state the app is already in, which is why nothing here happens by
 *   itself. An autosave tick silently recreating a file the user deleted is
 *   precisely what this exists to prevent.
 *
 * A clean document whose file merely changed never gets here: the store
 * reloads it and says so quietly. This is only the cases with a cost.
 *
 * It lives in `App.vue` rather than in the editor because the question is about
 * the *document*, and it must survive whatever the view is doing. In the
 * browser build `documentConflict` is never set, so it never renders.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { FileDown, FileUp, X } from 'lucide-vue-next'
import AppButton from '@/components/base/AppButton.vue'
import AppDialog from '@/components/base/AppDialog.vue'
import { useProjectsStore } from '@/stores/projects'

const store = useProjectsStore()
const router = useRouter()

/** `AppDialog` drives a native `<dialog>` off a boolean; the store holds why. */
const open = computed({
  get: () => store.documentConflict !== null,
  set: (value: boolean) => {
    // Esc closes a native dialog on its own. That is "not now", and the store
    // has an answer for it: the banner keeps saying why saving has stopped.
    if (!value) store.dismissConflict()
  },
})

const deleted = computed(() => store.documentConflict === 'deleted')

/** What the file is called, for a sentence that names it rather than "it". */
const name = computed(() => store.documentName ?? store.current?.name ?? 'This document')

const title = computed(() => (deleted.value ? 'Document Deleted' : 'Document Changed on Disk'))

async function reload(): Promise<void> {
  await store.reloadDocument()
}

async function keepMine(): Promise<void> {
  await store.overwriteDocument()
}

/**
 * Give up on a file that is gone. The document is closed rather than left open
 * over nothing — and closing flushes, which the guard refuses, so what is on
 * screen is what is lost. The button says as much.
 */
async function closeDocument(): Promise<void> {
  store.dismissConflict()
  await router.push('/')
}
</script>

<template>
  <AppDialog v-model="open" :title="title">
    <div class="flex flex-col gap-3 text-sm text-ink-200">
      <template v-if="deleted">
        <p>
          <strong class="text-ink-50">{{ name }}</strong> is no longer on disk. It may have been
          deleted, renamed, or moved by something outside the editor.
        </p>
        <p>
          Your version is still open here, and nothing has been written. Saving it again recreates
          the file where it was.
        </p>
      </template>
      <template v-else>
        <p>
          <strong class="text-ink-50">{{ name }}</strong> changed on disk — a branch switch, or
          another program writing to it.
        </p>
        <p>
          You have unsaved changes here.
          <strong class="text-ink-50">Reloading discards them</strong>;
          <strong class="text-ink-50">keeping yours overwrites the file</strong>. Until you choose,
          nothing is written.
        </p>
      </template>
    </div>

    <template #footer>
      <template v-if="deleted">
        <AppButton label="Close Document" show-label @click="closeDocument">
          <X class="size-4" />
        </AppButton>
        <AppButton label="Save It Again" show-label @click="keepMine">
          <FileUp class="size-4" />
        </AppButton>
      </template>
      <template v-else>
        <AppButton label="Keep My Version" show-label @click="keepMine">
          <FileUp class="size-4" />
        </AppButton>
        <AppButton label="Reload from Disk" show-label @click="reload">
          <FileDown class="size-4" />
        </AppButton>
      </template>
    </template>
  </AppDialog>
</template>
