/**
 * The routes, and the one place the two shells fork in the view layer
 * (PLAN.md D13).
 *
 * `/` resolves to the desktop's start screen or to the browser's project
 * manager, decided once, here. That is the whole fork: `/edit/:projectId` is
 * shared and unchanged, its id is still the project's own UUID (D9), and **no
 * component branches on the shell**. A difference that wants a branch inside a
 * view belongs in a util or a prop instead.
 *
 * Both views are imported eagerly. The home route is the first paint in either
 * shell, and an async chunk there would trade a few unused kilobytes for a
 * blank frame on launch.
 */

import { createRouter, createWebHistory } from 'vue-router'
import ProjectManagerView from '../views/ProjectManagerView.vue'
import StartView from '../views/StartView.vue'
import { isDesktop } from '../utils/desktop'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: isDesktop() ? StartView : ProjectManagerView,
    },
    {
      path: '/edit/:projectId',
      name: 'editor',
      component: () => import('../views/EditorView.vue'),
      props: true,
    },
  ],
})

export default router
