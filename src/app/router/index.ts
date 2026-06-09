import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('@/pages/dashboard/DashboardPage.vue') },
    { path: '/upload', component: () => import('@/pages/upload-run/UploadRunPage.vue') },
    { path: '/runs', component: () => import('@/pages/run-log/RunLogPage.vue') },
    { path: '/trends', component: () => import('@/pages/trends/TrendsPage.vue') },
    { path: '/memory', component: () => import('@/pages/memory/MemoryPage.vue') },
    { path: '/coach', redirect: '/runs' },
    { path: '/auth', component: () => import('@/pages/auth/AuthPage.vue') },
    { path: '/access', component: () => import('@/pages/access-gate/AccessGuidePage.vue') },
    { path: '/prompt', redirect: '/runs' },
    { path: '/chat', redirect: '/runs' }
  ]
})
