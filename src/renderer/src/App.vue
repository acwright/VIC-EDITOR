<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { capturePendingShare } from '@/domain/share'
import { useProjectsStore } from '@/stores/projects'
import { desktop } from '@/utils/desktop'

// A share link (`#p=…`) is read and stripped once, before the manager view
// mounts and offers it (PLAN.md §12 Decision 18). Links point at the app root,
// but a hash pasted onto any other route is honored too.
const router = useRouter()
if (capturePendingShare() && router.currentRoute.value.path !== '/') {
  router.replace('/')
}

// Desktop only: the native window holds its own close open until the renderer
// says it is safe. A browser tab needs none of this — closing one leaves the
// debounced autosave to the next launch's recovery, which is the web app's
// existing behavior and not something this changes.
const projects = useProjectsStore()
let stopBeforeQuit: (() => void) | undefined

onMounted(() => {
  const api = desktop()
  if (!api) return
  // The flush is async now that storage is (PLAN.md D1), so `saveComplete`
  // waits for it — telling main "done" while a write is still outstanding is
  // exactly the lost edit main's 5-second safety valve cannot save us from.
  stopBeforeQuit = api.app.onBeforeQuit(async () => {
    await projects.flushAutosave()
    api.app.saveComplete()
  })
})

onUnmounted(() => stopBeforeQuit?.())
</script>

<template>
  <RouterView />
</template>
