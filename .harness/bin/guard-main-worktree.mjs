#!/usr/bin/env node

import { execFileSync } from 'node:child_process'

const mode = process.argv[2] || 'pre-commit'
const isPush = mode === 'pre-push'
const override =
  process.env.HARNESS_ALLOW_MAIN_WRITE === '1' ||
  process.env[isPush ? 'HARNESS_ALLOW_MAIN_PUSH' : 'HARNESS_ALLOW_MAIN_COMMIT'] === '1'

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

let branch = ''
try {
  branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
} catch {
  process.exit(0)
}

if (branch !== 'main') {
  process.exit(0)
}

if (!isPush) {
  const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (staged.length === 0) {
    process.exit(0)
  }
}

if (override) {
  console.warn(
    `[harness] main direct ${isPush ? 'push' : 'commit'} override active. Use only for explicit user-approved tracking/finalization work.`,
  )
  process.exit(0)
}

console.error(`[harness] main 직접 ${isPush ? 'push' : 'commit'} 차단`)
console.error('- 정식 개발/문서/운영 작업은 먼저 GitHub Issue를 만들거나 재사용합니다.')
console.error('- 작업은 Issue 전용 worktree와 issue-<number>/<short-slug> branch에서 진행합니다.')
console.error('- MVP 배포 자동 완료 흐름도 이 Issue/worktree 선행 게이트 이후에만 시작됩니다.')
console.error(
  `- 정말로 main 직접 ${isPush ? 'push' : 'commit'}이 필요한 사용자 승인 예외라면 HARNESS_ALLOW_MAIN_${
    isPush ? 'PUSH' : 'COMMIT'
  }=1 을 붙여 다시 실행하세요.`,
)
process.exit(1)
