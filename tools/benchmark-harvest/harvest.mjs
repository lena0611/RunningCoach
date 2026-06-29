#!/usr/bin/env node
// 대회 벤치마크 수집 CLI.
//   node tools/benchmark-harvest/harvest.mjs myresult [outPath.json]
//   node tools/benchmark-harvest/harvest.mjs baa   # 문서화 스캐폴드(자동 실행 안 함)
//   node tools/benchmark-harvest/harvest.mjs scc   # 문서화 스캐폴드(자동 실행 안 함)
//
// stdout: 스냅샷 id별 비식별 컷 JSON(전체 + 성별). stderr: 진행/검증 로그.
// 개인정보: 원본 참가자 row는 어디에도 저장하지 않는다. 출력은 집계 컷 + 표본 수뿐.

import { writeFileSync } from 'node:fs'
import { harvestMyResult } from './providers/myresult.mjs'

// 기존 하드코딩 컷(전수 기반)과의 재현 검증용. p1..p90만 비교(p95/p99는 신규).
const EXISTING = {
  'chuncheon-marathon-2025-10k': { 1: 2399, 5: 2657, 10: 2826, 25: 3109, 50: 3461, 75: 3896, 90: 4380 },
  'chuncheon-marathon-2025-marathon': { 1: 10218, 5: 11206, 10: 11890, 25: 13084, 50: 14351, 75: 16298, 90: 17894 },
  'jtbc-seoul-marathon-2025-10k': { 1: 2476, 5: 2728, 10: 2880, 25: 3145, 50: 3466, 75: 3866, 90: 4322 },
  'jtbc-seoul-marathon-2025-marathon': { 1: 10177, 5: 10982, 10: 11634, 25: 12819, 50: 14227, 75: 15999, 90: 17530 }
}

function fmt(sec) {
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`
}

function printValidation(data) {
  process.stderr.write('\n=== 재현 검증 (신규 표본 vs 기존 전수 컷, p1~p90) ===\n')
  for (const [id, snap] of Object.entries(data)) {
    const old = EXISTING[id]
    process.stderr.write(`\n[${id}] n=${snap.sampleSize}` +
      (snap.genderDistribution.male ? ` M=${snap.genderDistribution.male.sampleSize}` : '') +
      (snap.genderDistribution.female ? ` F=${snap.genderDistribution.female.sampleSize}` : '') + '\n')
    for (const cut of snap.percentileCutsSec) {
      const ov = old?.[cut.percentile]
      const delta = ov ? `${(((cut.durationSec - ov) / ov) * 100).toFixed(1)}%` : '(신규)'
      process.stderr.write(`  p${cut.percentile}: ${fmt(cut.durationSec)} (${cut.durationSec}s)` +
        (ov ? ` vs 기존 ${fmt(ov)} → ${delta}` : ` ${delta}`) + '\n')
    }
  }
  process.stderr.write('\n')
}

async function main() {
  const provider = process.argv[2] ?? 'myresult'
  const outPath = process.argv[3] ?? null

  if (provider === 'myresult') {
    const opts = {}
    if (process.env.BENCH_TARGET) opts.targetPerCourse = Number(process.env.BENCH_TARGET)
    if (process.env.BENCH_BUDGET) opts.requestBudget = Number(process.env.BENCH_BUDGET)
    if (process.env.BENCH_CONCURRENCY) opts.concurrency = Number(process.env.BENCH_CONCURRENCY)
    if (process.env.BENCH_MINSEG) opts.minSegment = Number(process.env.BENCH_MINSEG)
    const data = await harvestMyResult(opts)
    printValidation(data)
    const json = JSON.stringify(data, null, 2)
    if (outPath) {
      writeFileSync(outPath, json)
      process.stderr.write(`wrote ${outPath}\n`)
    }
    process.stdout.write(`${json}\n`)
    return
  }

  if (provider === 'baa' || provider === 'scc') {
    process.stderr.write(
      `Provider "${provider}" is a documented scaffold and is NOT auto-run here.\n` +
      `See tools/benchmark-harvest/providers/${provider}.mjs and README.md for the endpoint/pagination contract,\n` +
      `then enable the run explicitly after verifying the public API shape.\n`
    )
    process.exit(2)
  }

  process.stderr.write(`Unknown provider "${provider}". Use one of: myresult | baa | scc\n`)
  process.exit(1)
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err?.stack ?? err}\n`)
  process.exit(1)
})
