/// <reference types="vitest" />
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/RunningCoach/' : './',
  plugins: [vue()],
  build: {
    assetsDir: '',
    chunkSizeWarningLimit: 650
  },
  test: {
    environment: 'jsdom',
    // .claude/worktrees/** — repo 안에 중첩된 git worktree 의 테스트를 메인 트리 실행이 주워
    // 22건 오탐 실패한 사고(2026-07-03) 재발 방지. worktree 는 자기 경로에서 자체 실행된다.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', '.claude/**'],
    globals: true,
    setupFiles: ['./tests/setup.ts']
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
