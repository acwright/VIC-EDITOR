import { createRouter, createWebHistory } from 'vue-router'
import ProjectManagerView from '../views/ProjectManagerView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'projects',
      component: ProjectManagerView,
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
