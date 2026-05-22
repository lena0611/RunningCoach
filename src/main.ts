import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './app/App.vue'
import { router } from './app/router'
import { useAuthStore } from '@/app/stores/authStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { canUseAppFeatures } from '@/shared/lib/runtime'
import './app/styles.css'

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
app.use(router)

const authStore = useAuthStore()
await authStore.init()

router.beforeEach((to) => {
  if (!canUseAppFeatures() && to.path !== '/access') return '/access'
  if (canUseAppFeatures() && to.path === '/access') return '/'
  if (!isSupabaseConfigured && to.path !== '/auth') return '/auth'
  if (isSupabaseConfigured && !authStore.isAuthenticated && to.path !== '/auth') return '/auth'
  if (authStore.isAuthenticated && to.path === '/auth') return '/'
})

if (!isSupabaseConfigured || authStore.isAuthenticated) {
  await Promise.all([useMemoryStore().load(), useRunStore().load()])
}

app.mount('#app')
