import '@fontsource/bebas-neue'
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useProjectsStore } from './stores/projects'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

/**
 * Open before painting.
 *
 * On the desktop a document may already be waiting when the app starts: the one
 * a double-click launched it for (PLAN.md D15), or the one that was open when
 * it last quit (D11). Taking it *before* mounting is what makes launching land
 * in the editor rather than showing the launcher for a frame and then leaving
 * it — the window is not shown until the first paint, and this decides what
 * that paint is.
 *
 * There is no shell branch here: in the browser nothing can be waiting, so this
 * resolves to null and the app mounts on the route it already has.
 */
async function start(): Promise<void> {
  try {
    const project = await useProjectsStore(pinia).takePendingDocument()
    if (project) await router.replace(`/edit/${project.id}`)
  } catch (error) {
    // A launch must not be lost to a document that would not open. The banner
    // on the start screen carries the reason; this only keeps the app coming up.
    console.error('[main] pending document:', error)
  } finally {
    app.mount('#app')
  }
}

void start()
