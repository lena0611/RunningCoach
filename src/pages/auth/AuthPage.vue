<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/app/stores/authStore'
import SectionCard from '@/shared/ui/SectionCard.vue'

const authStore = useAuthStore()
const router = useRouter()
const email = ref('')
const token = ref('')
const sent = ref(false)

async function submit() {
  await authStore.signInWithEmail(email.value)
  sent.value = !authStore.error
}

async function verify() {
  const success = await authStore.verifyEmailOtp(email.value, token.value.trim())
  if (success) await router.replace('/')
}
</script>

<template>
  <section class="page narrow-page">
    <SectionCard>
      <div class="section-heading">
        <h2>로그인</h2>
      </div>
      <p>RunContext 데이터와 AI 코칭은 Supabase 계정으로 보호됩니다.</p>
      <form v-if="!sent" class="form-grid" @submit.prevent="submit">
        <label class="full">
          이메일
          <input v-model="email" type="email" autocomplete="email" placeholder="you@example.com" required />
        </label>
        <div class="actions full">
          <button type="submit" :disabled="authStore.loading">{{ authStore.loading ? '전송 중' : '인증 코드 받기' }}</button>
        </div>
      </form>
      <form v-else class="form-grid" @submit.prevent="verify">
        <label class="full">
          인증 코드
          <input
            v-model="token"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="메일의 인증 코드"
            required
          />
        </label>
        <div class="actions full">
          <button type="submit" :disabled="authStore.loading">{{ authStore.loading ? '확인 중' : '로그인' }}</button>
          <button type="button" class="ghost" :disabled="authStore.loading" @click="sent = false">이메일 다시 입력</button>
        </div>
      </form>
      <p v-if="sent" class="helper">메일함에서 인증 코드를 확인한 뒤 여기에 입력하세요.</p>
      <p v-if="authStore.error" class="error">{{ authStore.error }}</p>
      <p v-if="!authStore.isConfigured" class="error">VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 설정이 필요합니다.</p>
    </SectionCard>
  </section>
</template>
