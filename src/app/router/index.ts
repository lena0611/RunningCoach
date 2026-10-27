import { createRouter, createWebHashHistory } from 'vue-router'
// 안내 페이지는 지연 로드하지 않는다(2026-10-27). 일반 브라우저(앱 밖)가 갈 수 있는 유일한 화면이라 메인 번들에 둔다(약 1KB).
// 부팅 교착(main.ts 가 첫 화면 지연 청크를 top-level await 로 기다리던 것)의 1차 수정이었고, 근본 수정은 main.ts 에 있다.
import AccessGuidePage from '@/pages/access-gate/AccessGuidePage.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('@/pages/dashboard/DashboardPage.vue') },
    { path: '/upload', component: () => import('@/pages/upload-run/UploadRunPage.vue') },
    { path: '/runs', component: () => import('@/pages/run-log/RunLogPage.vue') },
    { path: '/trends', component: () => import('@/pages/trends/TrendsPage.vue') },
    { path: '/memory', component: () => import('@/pages/memory/MemoryPage.vue') },
    { path: '/coach', component: () => import('@/pages/coach/CoachPage.vue') },
    { path: '/auth', component: () => import('@/pages/auth/AuthPage.vue') },
    { path: '/access', component: AccessGuidePage },
    { path: '/prompt', redirect: '/runs' },
    { path: '/chat', redirect: '/runs' }
  ]
})
