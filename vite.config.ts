/// <reference types="vitest" />
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/**
 * 빌드마다 바뀌는 값. 화면이 이 값과 서버의 version.json 을 대조해 새 배포를 알아챈다(#776).
 * GitHub Pages 는 index.html 에 max-age=600 을 붙인다 — 배포 직후 10분간 앱이 옛 화면을 붙들고 있었다.
 */
const BUILD_ID = String(Date.now())

/** 아주 작은 version.json 을 함께 낸다. 이 파일만 캐시 없이 확인하면 되므로 비용이 사실상 없다. */
function emitBuildVersion() {
  return {
    name: 'emit-build-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId: BUILD_ID }) })
    }
  }
}

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/RunningCoach/' : './',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID)
  },
  plugins: [
    emitBuildVersion(),
    vue({
      template: {
        compilerOptions: {
          // hover-tilt 웹컴포넌트(전리품 카드 틸트/홀로) — Vue 컴포넌트 해석 대상에서 제외
          isCustomElement: (tag) => tag === 'hover-tilt'
        }
      }
    })
  ],
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
