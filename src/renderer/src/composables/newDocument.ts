/**
 * *New Project…* and *New from Sample ▸*, wherever they are asked for
 * (PLAN.md D10, Phase F7).
 *
 * Both commands ask the same two questions — what to call it, and where the
 * file goes — and both end in a navigation to the editor, so the state behind
 * `NewProjectDialog` lives here rather than being written twice. Two views want
 * it: the start screen, whose buttons are the desktop's front door, and the
 * editor, because File ▸ New Project… has to work while a document is open.
 * What happens then is D17 — the store flushes into the document it has before
 * main adopts the new one, and one window shows one project.
 *
 * Nothing here branches on the shell. `location` stays `undefined` until a
 * shell answers with one, which is exactly the condition `NewProjectDialog`
 * shows its location row on: the browser has no folder to name and so shows no
 * row, without either side asking which app it is (D13).
 */

import { ref, watch, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import type { CreateProjectOptions } from '@/domain/factory'
import { SAMPLES, type Sample } from '@/samples'
import { useProjectsStore } from '@/stores/projects'
import { sampleFromAction } from '@shared/menu'

export interface NewDocument {
  /** Whether the dialog is open; bind with `v-model`. */
  open: Ref<boolean>
  /** The sample it is standing in for, or null for a blank project. */
  sample: Ref<Sample | null>
  /** Where the file would go, as text. Undefined in the browser (D8, D10). */
  location: Ref<string | undefined>
  /** Open the dialog, for a sample or for a blank project. */
  start: (sample?: Sample | null) => void
  /**
   * Take a menu action if it is one of these two commands, and say whether it
   * was. `New Project…` and every entry of `New from Sample ▸` arrive this way
   * (F7), and a view that has other menu items to serve asks this first.
   */
  handles: (action: string) => boolean
  /** The dialog's Choose Folder button (D8). */
  chooseLocation: () => Promise<void>
  /** Create it and go there. Leaves the dialog open on failure, banner and all. */
  create: (options: CreateProjectOptions) => Promise<void>
}

export function useNewDocument(): NewDocument {
  const store = useProjectsStore()
  const router = useRouter()

  const open = ref(false)
  const sample = ref<Sample | null>(null)
  const location = ref<string | undefined>(undefined)

  // Asked each time the dialog opens rather than once on mount: opening a
  // document moves the default, and the dialog has to show where the file will
  // actually land.
  watch(open, async (isOpen) => {
    if (!isOpen) return
    location.value = (await store.defaultLocation()) ?? undefined
  })

  function start(next: Sample | null = null): void {
    sample.value = next
    open.value = true
  }

  function handles(action: string): boolean {
    if (action === 'newProject') {
      start(null)
      return true
    }
    const id = sampleFromAction(action)
    if (id === null) return false
    // A sample the renderer no longer bundles: the menu was built from this
    // list, so this cannot fire in the app — and silently doing nothing is
    // still better than creating the wrong project.
    const found = SAMPLES.find((entry) => entry.id === id)
    if (found) start(found)
    return true
  }

  async function chooseLocation(): Promise<void> {
    const chosen = await store.chooseLocation()
    if (chosen) location.value = chosen
  }

  async function create(options: CreateProjectOptions): Promise<void> {
    const chosen = sample.value
    // A sample is a whole project rather than a set of options, so it is built
    // and then renamed to what the dialog collected.
    const project = chosen
      ? await store.createFrom({ ...chosen.build(), name: options.name })
      : await store.create(options)
    // On failure the dialog stays open; the banner says why — most often that a
    // document of that name is already in that folder.
    if (!project) return
    open.value = false
    await router.push(`/edit/${project.id}`)
  }

  return { open, sample, location, start, handles, chooseLocation, create }
}
