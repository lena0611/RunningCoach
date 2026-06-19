#!/usr/bin/env node
// 코칭 도메인 변경 커밋 강제 게이트(#전문코치리뷰).
// 결정론 훅은 "전문 코치 의도와 부합하는가"라는 LLM 판단을 직접 못 하므로,
// 코칭 도메인 파일이 스테이징됐는데 커밋 메시지에 `Coach-Review:` 증명이 없으면 차단한다.
// → 에이전트/사용자가 잊지 않도록 강제(실제 교차검증은 에이전트가 #전문코치리뷰로 수행).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

// 코칭 "동작/지식"을 바꾸는 경로. UI 위치 변경 등 비코칭은 제외하고 코칭 판단·지식·표준에 집중.
const COACHING_PATHS = [
  'supabase/functions/coach-run/',
  'src/shared/lib/coaching/',
  'src/shared/ui/CoachMessage.vue',
  '.harness/project/running-coaching-standards.md',
  '.harness/project/running-injury-knowledge.md',
  '.harness/project/ai-coaching-goal.md',
  '.harness/project/training-knowledge-ops.md',
]

function stagedFiles() {
  try {
    return execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
      encoding: 'utf8',
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

const msgPath = process.argv[2]
const message = msgPath && fs.existsSync(msgPath) ? fs.readFileSync(msgPath, 'utf8') : ''

// 병합 커밋은 자동 생성 메시지라 게이트 제외.
if (/^Merge\b/m.test(message.split('\n')[0] || '')) process.exit(0)

const touched = stagedFiles().filter((file) => COACHING_PATHS.some((p) => file.startsWith(p)))
if (touched.length === 0) process.exit(0)

// `Coach-Review:` 트레일러가 있으면 통과(값 자유: pass / n/a — 사유 등 — 의식적 증명이 핵심).
if (/^Coach-Review:\s*\S+/im.test(message)) process.exit(0)

console.error('')
console.error('⛔ 코칭 도메인 변경인데 #전문코치리뷰 증명이 없습니다. 커밋 차단.')
console.error('   변경된 코칭 파일:')
for (const file of touched) console.error(`     - ${file}`)
console.error('')
console.error('   처리: 에이전트가 #전문코치리뷰(.harness/project/professional-coach-review-trigger.md)를')
console.error('   수행한 뒤, 전문 코치 의도와 배치되면 사용자와 그릴하고, 통과면 커밋 메시지에 트레일러를 단다:')
console.error('     Coach-Review: pass — <근거/출처 한 줄>')
console.error('   (비코칭 기계 변경이면 사유와 함께: Coach-Review: n/a — <사유>)')
console.error('')
process.exit(1)
