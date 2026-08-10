<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { enabledAuthProviders, PASSWORD_MIN_LENGTH, passwordTooShortMessage, useAuthStore } from '@/app/stores/authStore'
import ActionGroup from '@/shared/ui/ActionGroup.vue'
import ClearableField from '@/shared/ui/ClearableField.vue'
import FormGrid from '@/shared/ui/FormGrid.vue'
import PageLayout from '@/shared/ui/PageLayout.vue'
import SectionGroup from '@/shared/ui/SectionGroup.vue'

/**
 * 로그인 화면(2026-08-07 개편).
 *
 * 예전엔 수단이 **이메일 OTP 하나뿐**이라 로그인할 때마다 메일함을 열어 코드를 옮겨 적어야 했다.
 * 비밀번호를 1순위로 두고, OTP 는 "비밀번호 없이 받기"로 내려 폴백(비밀번호 미설정 계정·복구)으로만 남긴다.
 * 소셜 로그인은 공급자 키가 준비된 것만 노출한다.
 */
type Mode = 'signIn' | 'signUp' | 'reset' | 'otp'

const authStore = useAuthStore()
const router = useRouter()

const mode = ref<Mode>('signIn')
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const otpCode = ref('')
const notice = ref('')
const otpSent = ref(false)

const providerLabel: Record<'google' | 'kakao', string> = { google: 'Google로 계속하기', kakao: '카카오로 계속하기' }
const hasProviders = computed(() => enabledAuthProviders.length > 0)

const heading = computed(() => {
  if (mode.value === 'signUp') return '회원가입'
  if (mode.value === 'reset') return '비밀번호 재설정'
  if (mode.value === 'otp') return '메일로 로그인'
  return '로그인'
})

function switchTo(next: Mode) {
  mode.value = next
  authStore.error = ''
  notice.value = ''
  otpSent.value = false
  password.value = ''
  passwordConfirm.value = ''
  otpCode.value = ''
}

async function submitSignIn() {
  if (await authStore.signInWithPassword(email.value.trim(), password.value)) await router.replace('/')
}

async function submitSignUp() {
  // 길이는 서버도 막지만 여기서 먼저 잡는다 — 왕복 한 번을 줄이고, 영어 원문 대신 우리 문장을 보여준다.
  if (password.value.length < PASSWORD_MIN_LENGTH) {
    authStore.error = passwordTooShortMessage
    return
  }
  if (password.value !== passwordConfirm.value) {
    authStore.error = '비밀번호 확인이 일치하지 않습니다.'
    return
  }
  const result = await authStore.signUpWithPassword(email.value.trim(), password.value)
  if (!result.ok) return
  if (result.needsEmailConfirm) {
    notice.value = '가입 확인 메일을 보냈어요. 메일에서 확인을 마치면 바로 로그인할 수 있습니다.'
    return
  }
  await router.replace('/')
}

async function submitReset() {
  if (await authStore.sendPasswordReset(email.value.trim())) {
    notice.value = '비밀번호 재설정 메일을 보냈어요. 메일의 링크로 새 비밀번호를 설정하세요.'
  }
}

async function submitOtpRequest() {
  await authStore.signInWithEmail(email.value.trim())
  otpSent.value = !authStore.error
}

async function submitOtpVerify() {
  if (await authStore.verifyEmailOtp(email.value.trim(), otpCode.value.trim())) await router.replace('/')
}
</script>

<template>
  <PageLayout variant="narrow">
    <SectionGroup :title="heading">
      <p v-if="mode === 'signIn'">이메일과 비밀번호로 로그인하세요. 러닝 기록과 AI 코칭은 계정에 안전하게 보관됩니다.</p>
      <p v-else-if="mode === 'signUp'">이메일과 비밀번호만 있으면 시작할 수 있어요.</p>
      <p v-else-if="mode === 'reset'">가입한 이메일을 넣으면 재설정 링크를 보내드립니다.</p>
      <p v-else>비밀번호를 만들지 않았다면 메일로 받은 코드로 로그인할 수 있어요.</p>

      <!-- 소셜: 준비된 공급자만 노출(눌러서 오류 나는 버튼을 만들지 않는다) -->
      <ActionGroup v-if="hasProviders && (mode === 'signIn' || mode === 'signUp')" full>
        <button
          v-for="provider in enabledAuthProviders"
          :key="provider"
          type="button"
          class="ghost"
          :disabled="authStore.loading"
          @click="authStore.signInWithProvider(provider)"
        >
          {{ providerLabel[provider] }}
        </button>
      </ActionGroup>
      <p v-if="hasProviders && (mode === 'signIn' || mode === 'signUp')" class="auth-divider">또는 이메일로</p>

      <!-- 로그인 -->
      <FormGrid v-if="mode === 'signIn'" as="form" @submit.prevent="submitSignIn">
        <label class="full">
          이메일
          <ClearableField v-model="email" type="email" autocomplete="email" placeholder="you@example.com" required />
        </label>
        <label class="full">
          비밀번호
          <ClearableField v-model="password" type="password" autocomplete="current-password" placeholder="비밀번호" required />
        </label>
        <ActionGroup full>
          <button type="submit" :disabled="authStore.loading">{{ authStore.loading ? '로그인 중' : '로그인' }}</button>
        </ActionGroup>
      </FormGrid>

      <!-- 회원가입 -->
      <FormGrid v-else-if="mode === 'signUp'" as="form" @submit.prevent="submitSignUp">
        <label class="full">
          이메일
          <ClearableField v-model="email" type="email" autocomplete="email" placeholder="you@example.com" required />
        </label>
        <label class="full">
          비밀번호
          <ClearableField v-model="password" type="password" autocomplete="new-password" :placeholder="`${PASSWORD_MIN_LENGTH}자 이상`" required />
        </label>
        <label class="full">
          비밀번호 확인
          <ClearableField v-model="passwordConfirm" type="password" autocomplete="new-password" placeholder="다시 한 번" required />
        </label>
        <ActionGroup full>
          <button type="submit" :disabled="authStore.loading">{{ authStore.loading ? '가입 중' : '가입하고 시작' }}</button>
        </ActionGroup>
      </FormGrid>

      <!-- 비밀번호 재설정 -->
      <FormGrid v-else-if="mode === 'reset'" as="form" @submit.prevent="submitReset">
        <label class="full">
          이메일
          <ClearableField v-model="email" type="email" autocomplete="email" placeholder="you@example.com" required />
        </label>
        <ActionGroup full>
          <button type="submit" :disabled="authStore.loading">{{ authStore.loading ? '전송 중' : '재설정 메일 받기' }}</button>
        </ActionGroup>
      </FormGrid>

      <!-- 메일 코드 로그인(폴백) -->
      <template v-else>
        <FormGrid v-if="!otpSent" as="form" @submit.prevent="submitOtpRequest">
          <label class="full">
            이메일
            <ClearableField v-model="email" type="email" autocomplete="email" placeholder="you@example.com" required />
          </label>
          <ActionGroup full>
            <button type="submit" :disabled="authStore.loading">{{ authStore.loading ? '전송 중' : '인증 코드 받기' }}</button>
          </ActionGroup>
        </FormGrid>
        <FormGrid v-else as="form" @submit.prevent="submitOtpVerify">
          <label class="full">
            인증 코드
            <ClearableField v-model="otpCode" inputmode="numeric" autocomplete="one-time-code" placeholder="메일의 인증 코드" required />
          </label>
          <ActionGroup full>
            <button type="submit" :disabled="authStore.loading">{{ authStore.loading ? '확인 중' : '로그인' }}</button>
            <button type="button" class="ghost" :disabled="authStore.loading" @click="otpSent = false">이메일 다시 입력</button>
          </ActionGroup>
        </FormGrid>
      </template>

      <p v-if="notice" class="helper">{{ notice }}</p>
      <p v-if="authStore.error" class="error">{{ authStore.error }}</p>
      <p v-if="!authStore.isConfigured" class="error">VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 설정이 필요합니다.</p>

      <nav class="auth-links">
        <template v-if="mode === 'signIn'">
          <button type="button" class="link" @click="switchTo('signUp')">회원가입</button>
          <button type="button" class="link" @click="switchTo('reset')">비밀번호를 잊으셨나요?</button>
          <button type="button" class="link" @click="switchTo('otp')">비밀번호 없이 메일로 로그인</button>
        </template>
        <button v-else type="button" class="link" @click="switchTo('signIn')">로그인으로 돌아가기</button>
      </nav>
    </SectionGroup>
  </PageLayout>
</template>

<style scoped>
.auth-divider {
  display: flex;
  align-items: center;
  gap: var(--space-3, .75rem);
  color: var(--text-muted, #888);
  font-size: var(--font-size-sm, .85rem);
}

.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, .12));
}

.auth-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3, .75rem) var(--space-4, 1rem);
}

.auth-links .link {
  background: none;
  border: 0;
  padding: 0;
  color: var(--text-muted, #888);
  font-size: var(--font-size-sm, .85rem);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  min-height: auto;
}

.auth-links .link:hover,
.auth-links .link:focus-visible {
  color: var(--text-primary, #fff);
}
</style>
