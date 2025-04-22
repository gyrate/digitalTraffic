import { createRouter, createWebHashHistory } from 'vue-router'
const routerHistory = createWebHashHistory(import.meta.env.BASE_URL)

const router = createRouter({
  history: routerHistory,
  mode: 'hash',
  routes: [
    {
      path:'/',
      redirect: '/index'
    },
    {
      path: '/index',
      component: () => import('@/views/index.vue')
    }
  ]
})

export default router
