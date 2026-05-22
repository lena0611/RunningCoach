<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/app/stores/authStore'

const authStore = useAuthStore()
const email = ref('')
const sent = ref(false)

async function submit() {
  await authStore.signInWithEmail(email.value)
  sent.value = !authStore.error
}
</script>

<template>
  <section class="page narrow-page">
    <section class="panel">
      <div class="section-heading">
        <h2>로그인</h2>
      </div>
      <p>RunContext 데이터와 AI 코칭은 Supabase 계정으로 보호됩니다.</p>
      <form class="form-grid" @submit.prevent="submit">
        <label class="full">
          이메일
          <input v-model="email" type="email" autocomplete="email" placeholder="you@example.com" required />
        </label>
        <div class="actions full">
          <button type="submit" :disabled="authStore.loading">{{ authStore.loading ? '전송 중' : '로그인 링크 받기' }}</button>
        </div>
      </form>
      <p v-if="sent" class="helper">메일함에서 로그인 링크를 열어주세요.</p>
      <p v-if="authStore.error" class="error">{{ authStore.error }}</p>
      <p v-if="!authStore.isConfigured" class="error">VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 설정이 필요합니다.</p>
    </section>
  </section>
</template>
