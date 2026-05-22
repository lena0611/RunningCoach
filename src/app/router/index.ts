import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('@/pages/dashboard/DashboardPage.vue') },
    { path: '/upload', component: () => import('@/pages/upload-run/UploadRunPage.vue') },
    { path: '/runs', component: () => import('@/pages/run-log/RunLogPage.vue') },
    { path: '/memory', component: () => import('@/pages/memory/MemoryPage.vue') },
    { path: '/coach', component: () => import('@/pages/prompt-builder/PromptBuilderPage.vue') },
    { path: '/auth', component: () => import('@/pages/auth/AuthPage.vue') },
    { path: '/access', component: () => import('@/pages/access-gate/AccessGuidePage.vue') },
    { path: '/prompt', redirect: '/coach' },
    { path: '/chat', redirect: '/coach' }
  ]
})
