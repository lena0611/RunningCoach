import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './app/App.vue'
import { router } from './app/router'
import { useAuthStore } from '@/app/stores/authStore'
import { useSettingsStore } from '@/app/stores/settingsStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { canUseAppFeatures } from '@/shared/lib/runtime'
import './app/styles.css'

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
const isE2ERouteSmoke = import.meta.env.DEV && import.meta.env.VITE_E2E_ROUTE_SMOKE === 'true'

useSettingsStore().initTheme()
await cleanupLegacyWebCaches().catch(() => undefined)

const authStore = useAuthStore()
await withTimeout(authStore.init(), 4000, '인증 초기화 시간이 초과되었습니다.').catch((error) => {
  authStore.error = error instanceof Error ? error.message : '인증 초기화 실패'
  authStore.initialized = true
})

router.beforeEach((to) => {
  if (isE2ERouteSmoke && (to.path === '/auth' || to.path === '/access')) return '/'
  if (!isE2ERouteSmoke && !canUseAppFeatures() && to.path !== '/access') return '/access'
  if (!isE2ERouteSmoke && canUseAppFeatures() && to.path === '/access') return '/'
  if (!isE2ERouteSmoke && !isSupabaseConfigured && to.path !== '/auth') return '/auth'
  if (!isE2ERouteSmoke && isSupabaseConfigured && !authStore.isAuthenticated && to.path !== '/auth') return '/auth'
  if (authStore.isAuthenticated && to.path === '/auth') return '/'
})

app.use(router)
router.onError((error) => {
  const message = error instanceof Error ? error.message : String(error)
  const isChunkLoadFailure = [
    'Failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'Importing a module script failed',
    'Unable to preload CSS'
  ].some((keyword) => message.includes(keyword))

  if (!isChunkLoadFailure) return
  if (window.sessionStorage.getItem('runcontext:chunk-reload-attempted') === '1') return

  window.sessionStorage.setItem('runcontext:chunk-reload-attempted', '1')
  window.location.reload()
})
await router.isReady()
app.mount('#app')

if (!isSupabaseConfigured || authStore.isAuthenticated) {
  Promise.all([useMemoryStore().load(), useRunStore().load()]).catch(() => {
    // 화면 mount를 막지 않는다. 각 store가 자체 error 상태를 표시한다.
  })
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      }
    )
  })
}

async function cleanupLegacyWebCaches() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  if ('caches' in window) {
    const cacheNames = await window.caches.keys()
    await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)))
  }
}
