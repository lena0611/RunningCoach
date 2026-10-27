import { createRouter, createWebHashHistory } from 'vue-router'
// 안내 페이지는 지연 로드하지 않는다(2026-10-27). main.ts 가 `await router.isReady()` 로 첫 화면을 기다리는데,
// 지연 청크는 메인 번들(아직 평가 중)을 import 해서 Chromium 에선 서로를 기다리며 스플래시에 멈췄다.
// 일반 브라우저(앱 밖)가 갈 수 있는 화면은 이것뿐이라 이것만 메인 번들에 둔다(약 1KB). 아이폰 앱(WebKit)은 영향 없음.
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
