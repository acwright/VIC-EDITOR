<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import DocumentConflictDialog from '@/components/projects/DocumentConflictDialog.vue'
import { capturePendingShare } from '@/domain/share'
import { useProjectsStore } from '@/stores/projects'
import { desktop } from '@/utils/desktop'
import type { DocumentChange } from '@shared/document'

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
let stopPending: (() => void) | undefined
let stopChanged: (() => void) | undefined

/**
 * A document has arrived (D15).
 *
 * Every way one can — a double-click, a file dropped on the window, Open
 * Recent, the Open dialog — reaches main first and is announced here, and the
 * store is what takes it: it flushes whatever the editor is holding into the
 * *old* file before main swaps documents (D17). Routing is this component's
 * half, because it is the one that has the router; a document that arrives
 * while its own editor is on screen simply replaces what is in the store, and
 * the route it is already on stays correct.
 */
async function openArrivedDocument(): Promise<void> {
  const project = await projects.takePendingDocument()
  if (!project) return
  if (router.currentRoute.value.params['projectId'] !== project.id) {
    await router.push(`/edit/${project.id}`)
  }
}

/**
 * The open document changed on disk, or is gone (D7).
 *
 * Main announces; the store decides — reload it quietly, or ask. The routing is
 * this component's half again, and it matters here for a reason it does not in
 * the arrival path: a reload can bring back a file whose project *id* differs,
 * which is what a branch holding a different document at the same path is.
 */
async function onDocumentChanged(change: DocumentChange): Promise<void> {
  const project = await projects.documentChangedOnDisk(change)
  if (!project) return
  if (router.currentRoute.value.params['projectId'] !== project.id) {
    await router.push(`/edit/${project.id}`)
  }
}

/**
 * A file dropped on the window opens it (S5).
 *
 * `dragover` has to be cancelled or the browser engine takes the drop itself
 * and navigates the window to the file, which would replace the editor with a
 * page of JSON. The `File` goes to the preload as it is: turning it into a path
 * is `webUtils.getPathForFile`'s job, on the other side of the bridge, and the
 * renderer never derives one (D8).
 */
function onDragOver(event: DragEvent): void {
  event.preventDefault()
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  const file = event.dataTransfer?.files[0]
  if (file) desktop()?.document.dropped(file)
}

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
  stopPending = api.document.onPending(() => void openArrivedDocument())
  stopChanged = api.document.onChanged((change) => void onDocumentChanged(change))
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('drop', onDrop)
})

onUnmounted(() => {
  stopBeforeQuit?.()
  stopPending?.()
  stopChanged?.()
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('drop', onDrop)
})
</script>

<template>
  <RouterView />
  <!-- Only ever open on the desktop, and only when the file moved in a way
       that costs something to resolve (D7). -->
  <DocumentConflictDialog />
</template>
