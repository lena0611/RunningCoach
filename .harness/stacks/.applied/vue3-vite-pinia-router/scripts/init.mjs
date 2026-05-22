#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')
const targetRoot = process.cwd()
const manifest = readJson(path.join(repoRoot, 'manifest.json'))
const stackPkg = readJson(path.join(repoRoot, 'package.json'), {})
const stackId = manifest.id

function readJson(absPath, fallback = null) {
  if (!fs.existsSync(absPath)) {
    return fallback
  }

  return JSON.parse(fs.readFileSync(absPath, 'utf8'))
}

function writeJson(absPath, value) {
  fs.writeFileSync(absPath, `${JSON.stringify(value, null, 2)}\n`)
}

function encodeGroupPath(value) {
  return value.split('/').map(encodeURIComponent).join('%2F')
}

function printUsageAndExit(code = 0) {
  console.log(`Usage:
  npx -y git+<stack-harness-repo-url>#<tag> init [options]

Options:
  --dry-run              변경 없이 설치 계획만 출력합니다.
  --force                공통 하네스 설치 시 프로젝트 소유 파일까지 덮어씁니다.
  --confirm-overwrite-project-files
                         --force 덮어쓰기 위험을 인지했음을 명시합니다.
  --force-stack          다른 스택 기준이 이미 적용되어 있어도 reset 후 적용합니다.
  --allow-mismatch       감지된 기존 스택과 맞지 않아도 마이그레이션 목적으로 명시 적용합니다.
  --migration-mode       --allow-mismatch alias입니다.
  --no-backup            공통 하네스 백업을 만들지 않습니다. --force와 함께만 사용합니다.
  --no-scan              설치 후 프로젝트 스캔 리포트를 자동 생성하지 않습니다.
  --no-handoff           설치/업데이트 인수인계 요약을 자동 생성하지 않습니다.
  --no-check             설치 후 하네스 기본 검사를 자동 실행하지 않습니다.
  --seed-repo <repo-url> 공통 하네스 저장소를 바꿉니다.
  --seed-ref <ref>       공통 하네스 tag/branch/sha를 바꿉니다.
  --seed-path <dir>      로컬 공통 하네스 checkout을 사용합니다. 테스트용입니다.
  -h, --help             도움말을 출력합니다.

적용 대상 프로젝트 루트에서 실행하세요.
`)
  process.exit(code)
}

function parseArgs(argv) {
  const opts = {
    command: argv[2],
    dryRun: false,
    force: false,
    confirmOverwriteProjectFiles: process.env.AI_STANDARD_CONFIRM_OVERWRITE_PROJECT_FILES === '1',
    forceStack: false,
    allowMismatch: false,
    noBackup: false,
    noScan: false,
    noHandoff: false,
    noCheck: false,
    seedRepo: manifest.baseHarness?.repo,
    seedRef: manifest.baseHarness?.ref,
    seedPath: null,
  }

  const args = argv.slice(3)
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    switch (arg) {
      case '-h':
      case '--help':
        printUsageAndExit(0)
        break
      case '--dry-run':
        opts.dryRun = true
        break
      case '--force':
        opts.force = true
        break
      case '--confirm-overwrite-project-files':
      case '--confirm-overwrite-project-state':
        opts.confirmOverwriteProjectFiles = true
        break
      case '--force-stack':
        opts.forceStack = true
        break
      case '--allow-mismatch':
      case '--migration-mode':
        opts.allowMismatch = true
        break
      case '--no-backup':
        opts.noBackup = true
        break
      case '--no-scan':
        opts.noScan = true
        break
      case '--no-handoff':
        opts.noHandoff = true
        break
      case '--no-check':
        opts.noCheck = true
        break
      case '--seed-repo':
        opts.seedRepo = requireValue(args, i, arg)
        i += 1
        break
      case '--seed-ref':
        opts.seedRef = requireValue(args, i, arg)
        i += 1
        break
      case '--seed-path':
        opts.seedPath = path.resolve(targetRoot, requireValue(args, i, arg))
        i += 1
        break
      default:
        console.error(`알 수 없는 옵션: ${arg}`)
        printUsageAndExit(1)
    }
  }

  return opts
}

function requireValue(args, index, flag) {
  const value = args[index + 1]
  if (!value || value.startsWith('-')) {
    console.error(`${flag}에는 값이 필요합니다.`)
    process.exit(1)
  }

  return value
}

function run(command, args, title) {
  console.log('')
  console.log(title)
  console.log(`$ ${[command, ...args].join(' ')}`)

  const result = spawnSync(command, args, {
    cwd: targetRoot,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function runRecommendedStack(command, args, title) {
  run(command, args, title)
  process.exit(0)
}

function buildSeedArgs(opts) {
  const args = ['init', '--no-scan', '--no-handoff', '--no-check', '--embedded']

  if (opts.dryRun) args.push('--dry-run')
  if (opts.force) args.push('--force')
  if (opts.confirmOverwriteProjectFiles) args.push('--confirm-overwrite-project-files')
  if (opts.noBackup) args.push('--no-backup')
  if (opts.seedRepo) args.push('--source-repo', opts.seedRepo)
  if (opts.seedRef) args.push('--source-ref', opts.seedRef)

  return args
}

function buildPackageSpec(repo, ref) {
  const withPrefix = repo.startsWith('git+') || repo.startsWith('github:')
    ? repo
    : `git+${repo}`

  return withPrefix.includes('#') ? withPrefix : `${withPrefix}#${ref}`
}

function installBaseHarness(opts) {
  const seedArgs = buildSeedArgs(opts)

  if (opts.seedPath) {
    run(
      process.execPath,
      [path.join(opts.seedPath, 'scripts/init.mjs'), ...seedArgs],
      '공통 하네스 설치 또는 업데이트',
    )
    return
  }

  if (!opts.seedRepo || !opts.seedRef) {
    console.error('manifest.baseHarness.repo/ref가 필요합니다.')
    process.exit(1)
  }

  run(
    'npx',
    ['-y', buildPackageSpec(opts.seedRepo, opts.seedRef), ...seedArgs],
    '공통 하네스 설치 또는 업데이트',
  )
}

function readAppliedStackMarker() {
  return readJson(path.join(targetRoot, '.harness/.stack-applied.json'))
}

function readHarnessProfile() {
  return readJson(path.join(targetRoot, '.harness/policy/profile.json'))
}

function collectPackageVersions(pkg) {
  const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
  const versions = new Map()

  for (const section of sections) {
    for (const [name, version] of Object.entries(pkg?.[section] ?? {})) {
      if (!versions.has(name)) {
        versions.set(name, { version, section })
      }
    }
  }

  return versions
}

function parseMajor(version) {
  if (!version) {
    return null
  }

  const npmAlias = String(version).match(/npm:[^@]+@(.+)$/)
  const source = npmAlias ? npmAlias[1] : String(version)
  const match = source.match(/(?:^|[^\d])(\d+)(?:\.|$)/)
  return match ? Number(match[1]) : null
}

function expectedMajorDescription(rule) {
  if (Array.isArray(rule.majors) && rule.majors.length > 0) {
    return rule.majors.join(' or ')
  }

  if (rule.major !== undefined) {
    return String(rule.major)
  }

  return null
}

function matchesExpectedMajor(rule, actualMajor) {
  if (actualMajor === null) {
    return true
  }

  if (Array.isArray(rule.majors) && rule.majors.length > 0) {
    return rule.majors.map(Number).includes(actualMajor)
  }

  if (rule.major !== undefined) {
    return actualMajor === Number(rule.major)
  }

  return true
}

function describePackage(name, found) {
  return `${name}@${found.version} (${found.section})`
}

function readTargetPackageJson() {
  return readJson(path.join(targetRoot, 'package.json'))
}

function detectPackageCompatibility(candidateManifest = manifest, pkg = readTargetPackageJson()) {
  const compatibility = candidateManifest.compatibility

  if (!pkg || !compatibility) {
    return {
      conflicts: [],
      detected: pkg ? [] : ['package.json 없음'],
    }
  }

  const versions = collectPackageVersions(pkg)
  const detected = []
  const conflicts = []

  for (const rule of compatibility.expected ?? []) {
    const found = versions.get(rule.package)
    if (!found) {
      continue
    }

    const hasMajorExpectation = rule.major !== undefined || Array.isArray(rule.majors)
    const actualMajor = hasMajorExpectation ? parseMajor(found.version) : null
    if (hasMajorExpectation && !matchesExpectedMajor(rule, actualMajor)) {
      const expectedMajor = expectedMajorDescription(rule)
      detected.push(`${rule.package}: ${describePackage(rule.package, found)} (expected ${rule.label ?? `${rule.package} ${rule.major}`})`)
      conflicts.push(`${rule.package} major ${actualMajor} 감지됨. 이 스택 하네스는 ${rule.label ?? `${rule.package} ${expectedMajor}`} 기준입니다.`)
      continue
    }

    detected.push(`${rule.label ?? rule.package}: ${describePackage(rule.package, found)}`)
    if (hasMajorExpectation) {
      continue
    }
  }

  for (const rule of compatibility.incompatible ?? []) {
    const found = versions.get(rule.package)
    if (!found) {
      continue
    }

    const actualMajor = parseMajor(found.version)
    if (rule.major !== undefined && actualMajor !== Number(rule.major)) {
      continue
    }

    detected.push(`${rule.label ?? rule.package}: ${describePackage(rule.package, found)}`)
    conflicts.push(`${rule.label ?? rule.package} 감지됨 (${describePackage(rule.package, found)}). 선택한 스택 하네스와 맞지 않습니다.`)
  }

  return {
    conflicts: [...new Set(conflicts)],
    detected: [...new Set(detected)],
  }
}

function detectAppliedStackCompatibility(opts) {
  const conflicts = []
  const marker = readAppliedStackMarker()
  const profile = readHarnessProfile()
  const profileStack = profile?.activeStack && profile.activeStack !== 'none' ? profile.activeStack : null
  const markerStack = marker?.stackId ?? null
  const existingStack = markerStack ?? profileStack

  if (existingStack && existingStack !== stackId && !opts.forceStack) {
    conflicts.push(`이미 다른 스택 기준이 적용되어 있습니다: ${existingStack}`)
  }

  return {
    conflicts,
    existingStack,
  }
}

function printPreflightFailure({ appliedConflicts, packageConflicts, detected, existingStack, recommendations }) {
  console.error('')
  console.error('스택 호환성 검사 실패')
  console.error('')
  console.error(`선택한 스택 하네스: ${manifest.title ?? stackId}`)

  if (existingStack) {
    console.error(`현재 적용된 스택 기준: ${existingStack}`)
  }

  if (detected.length > 0) {
    console.error('')
    console.error('감지된 기존 스택 단서:')
    for (const item of detected) {
      console.error(`  - ${item}`)
    }
  }

  console.error('')
  console.error('중단 사유:')
  for (const conflict of [...appliedConflicts, ...packageConflicts]) {
    console.error(`  - ${conflict}`)
  }

  console.error('')
  console.error('설치를 중단했습니다. 공통 하네스 설치, 스택 기준 적용, 스캔 리포트, 인수인계 요약 생성을 시작하기 전이라 프로젝트 파일은 변경하지 않았습니다.')
  console.error('')
  console.error('선택지:')
  console.error('  1) 현재 프로젝트에 맞는 스택 하네스를 선택합니다.')
  console.error('  2) 마이그레이션 목적이면 --allow-mismatch를 붙여 명시적으로 실행합니다.')
  console.error('  3) 이미 다른 하네스 스택이 적용된 프로젝트라면 전환 의도일 때만 --force-stack을 사용합니다.')

  if (recommendations.length > 0) {
    console.error('')
    console.error('추천 가능한 스택 하네스:')
    for (const [index, recommendation] of recommendations.entries()) {
      console.error(`  ${index + 1}) ${recommendation.title}`)
      console.error(`     ${buildRecommendedInitCommand(recommendation)}`)
    }
  } else {
    console.error('')
    console.error('현재 조회 가능한 스택 하네스 목록에서는 자동 추천할 수 있는 후보를 찾지 못했습니다.')
  }
}

function buildRecommendedInitCommand(recommendation) {
  return `npx -y ${buildPackageSpec(recommendation.repo, recommendation.ref)} init`
}

function buildForwardedRecommendationArgs(opts) {
  const args = ['init']

  if (opts.dryRun) args.push('--dry-run')
  if (opts.force) args.push('--force')
  if (opts.confirmOverwriteProjectFiles) args.push('--confirm-overwrite-project-files')
  if (opts.forceStack) args.push('--force-stack')
  if (opts.noBackup) args.push('--no-backup')
  if (opts.noScan) args.push('--no-scan')
  if (opts.noHandoff) args.push('--no-handoff')
  if (opts.noCheck) args.push('--no-check')
  if (opts.seedPath) args.push('--seed-path', opts.seedPath)

  return args
}

async function askYesNo(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false
  }

  const readline = await import('node:readline/promises')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const answer = await rl.question(`${question} [y/N] `)
    return ['y', 'yes'].includes(answer.trim().toLowerCase())
  } finally {
    rl.close()
  }
}

async function fetchJson(url, headers) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    })
    if (!response.ok) {
      return null
    }
    return response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchCandidateManifest(project, ref, gitlabUrl, headers) {
  const url = new URL(`/api/v4/projects/${project.id}/repository/files/manifest.json/raw`, gitlabUrl)
  url.searchParams.set('ref', ref)
  return fetchJson(url, headers)
}

async function findRecommendedStackHarnesses(pkg) {
  if (!pkg) {
    return []
  }

  if (process.env.HARNESS_SKIP_STACK_RECOMMENDATIONS === '1') {
    return []
  }

  const gitlabUrl = process.env.HARNESS_GITLAB_URL ?? 'https://git.smartscore.kr'
  const groupPath = process.env.HARNESS_STACK_STANDARD_GROUP ?? 'ai-standard/harnesses'
  const token = process.env.GITLAB_TOKEN ?? process.env.HARNESS_GITLAB_TOKEN
  const headers = token ? { 'PRIVATE-TOKEN': token } : {}
  const url = new URL(`/api/v4/groups/${encodeGroupPath(groupPath)}/projects`, gitlabUrl)
  url.searchParams.set('include_subgroups', 'true')
  url.searchParams.set('per_page', '100')

  const projects = await fetchJson(url, headers)
  if (!Array.isArray(projects)) {
    return []
  }

  const recommendations = []
  for (const project of projects) {
    if (project.path === stackId) {
      continue
    }

    const ref = project.tag_list?.[0] ?? project.default_branch ?? 'master'
    const candidateManifest = await fetchCandidateManifest(project, ref, gitlabUrl, headers)
    if (!candidateManifest?.compatibility) {
      continue
    }

    const result = detectPackageCompatibility(candidateManifest, pkg)
    if (result.conflicts.length > 0 || result.detected.length === 0) {
      continue
    }

    recommendations.push({
      id: candidateManifest.id ?? project.path,
      title: candidateManifest.title ?? project.name,
      repo: project.http_url_to_repo ?? project.web_url,
      ref,
      score: result.detected.length,
    })
  }

  return recommendations.sort((a, b) => b.score - a.score)
}

async function maybeContinueWithRecommendation(recommendations, opts) {
  if (recommendations.length === 0) {
    return
  }

  const selected = recommendations[0]
  const shouldContinue = await askYesNo(`추천 스택 하네스 '${selected.title}'로 진행할까요?`)
  if (!shouldContinue) {
    console.error('자동 진행하지 않았습니다. 위 추천 명령을 직접 실행할 수 있습니다.')
    return
  }

  runRecommendedStack(
    'npx',
    ['-y', buildPackageSpec(selected.repo, selected.ref), ...buildForwardedRecommendationArgs(opts)],
    `추천 스택 하네스 '${selected.title}'로 진행`,
  )
}

async function runPreflightChecks(opts) {
  const applied = detectAppliedStackCompatibility(opts)
  const targetPkg = readTargetPackageJson()
  const pkg = detectPackageCompatibility(manifest, targetPkg)
  const packageConflicts = opts.allowMismatch ? [] : pkg.conflicts
  const appliedConflicts = applied.conflicts

  if (appliedConflicts.length > 0 || packageConflicts.length > 0) {
    const recommendations = await findRecommendedStackHarnesses(targetPkg)
    printPreflightFailure({
      appliedConflicts,
      packageConflicts,
      detected: pkg.detected,
      existingStack: applied.existingStack,
      recommendations,
    })
    await maybeContinueWithRecommendation(recommendations, opts)
    process.exit(1)
  }

  if (opts.allowMismatch && pkg.conflicts.length > 0) {
    console.log('')
    console.log('스택 호환성 경고를 --allow-mismatch로 명시 허용했습니다.')
    for (const conflict of pkg.conflicts) {
      console.log(`  - ${conflict}`)
    }
    console.log('마이그레이션 목적과 예외 사유를 프로젝트 기준 문서에 남기세요.')
  }
}

function prepareStackApply(opts) {
  const marker = readAppliedStackMarker()
  if (!marker) {
    return
  }

  if (marker.stackId === stackId) {
    run('npm', ['run', 'stack:reset'], '기존 동일 스택 기준 업데이트 준비')
    return
  }

  if (opts.forceStack) {
    run('npm', ['run', 'stack:reset'], `기존 스택 기준(${marker.stackId}) reset`)
    return
  }

  console.error(`이미 다른 스택 기준이 적용되어 있습니다: ${marker.stackId}`)
  console.error('전환하려면 npm run stack:reset 후 다시 실행하거나 --force-stack을 사용하세요.')
  process.exit(1)
}

function applyStackHarness() {
  const applyArgs = [
    'run',
    'stack:apply',
    '--',
    '--preset-path',
    repoRoot,
  ]

  if (manifest.stackHarness?.repo) {
    applyArgs.push('--stack-repo', manifest.stackHarness.repo)
  }
  if (manifest.stackHarness?.ref) {
    applyArgs.push('--stack-ref', manifest.stackHarness.ref)
  }
  if (manifest.stackHarness?.range) {
    applyArgs.push('--stack-range', manifest.stackHarness.range)
  }
  if (stackPkg.version) {
    applyArgs.push('--stack-version', stackPkg.version)
  }
  applyArgs.push('--embedded')

  run(
    'npm',
    applyArgs,
    `${manifest.title ?? stackId} 기준 적용`,
  )

  normalizeAppliedStackMarker()
}

function normalizeAppliedStackMarker() {
  const markerPath = path.join(targetRoot, '.harness/.stack-applied.json')
  const marker = readJson(markerPath)

  if (!marker?.stackSnapshot?.manifestPath) {
    return
  }

  marker.manifestPath = marker.stackSnapshot.manifestPath
  writeJson(markerPath, marker)
}

function runDiagnostics(opts) {
  if (!opts.noScan) {
    run('npm', ['run', 'harness:scan'], '프로젝트 스캔 리포트 생성')
  }

  if (!opts.noHandoff) {
    run('npm', ['run', 'harness:handoff'], '프로젝트 인수인계 요약 생성')
  }

  if (!opts.noCheck) {
    run('npm', ['run', 'harness:check', '--', '--brief'], '하네스 기준 검사')
  }
}

async function main() {
  const opts = parseArgs(process.argv)

  if (!opts.command) printUsageAndExit(0)
  if (opts.command !== 'init') {
    console.error(`알 수 없는 명령: ${opts.command}`)
    printUsageAndExit(1)
  }

  if (opts.force && !opts.dryRun && !opts.confirmOverwriteProjectFiles) {
    console.error('--force는 공통 하네스의 프로젝트 소유 문서를 덮어쓸 수 있어 중단합니다.')
    console.error('진행하려면 위험을 인지했다는 뜻으로 다음 옵션을 함께 사용하세요:')
    console.error('  --force --confirm-overwrite-project-files')
    console.error('먼저 계획만 보려면 --dry-run --force를 사용하세요.')
    process.exit(1)
  }

  console.log(`${stackId}: 스택 하네스 설치 시작 -> ${targetRoot}`)
  console.log(`baseHarness: ${opts.seedPath ?? `${opts.seedRepo}#${opts.seedRef}`}`)

  await runPreflightChecks(opts)
  installBaseHarness(opts)

  if (opts.dryRun) {
    console.log('')
    console.log('[dry-run] 공통 하네스 설치 계획만 확인했습니다. 스택 기준 적용, 스캔, 인수인계 요약은 실행하지 않습니다.')
    return
  }

  prepareStackApply(opts)
  applyStackHarness()
  runDiagnostics(opts)

  console.log(`
스택 하네스 설치 완료

요약:
  - 업무 코드 scaffold는 복사하지 않았습니다.
  - Vue 3 + Vite + Pinia + Vue Router 개발 기준만 프로젝트 하네스에 추가했습니다.
  - 설치 후 검사와 build가 통과했습니다.

다음 단계:
  0) 새 터미널이면 프로젝트 루트에서 Node 버전 적용
       nvm use
  1) 현재 상태를 브라우저로 확인
       npm run harness:guide -- --open
  2) 스캔 리포트와 인수인계 요약 확인
       .harness/session/project-scan-report.md
       .harness/session/handoff.md
  3) 필요하면 git hook 활성화
       npm run hooks:install
  4) 작업 중간에 다시 검사
       npm run harness:check
`)
}

await main()
