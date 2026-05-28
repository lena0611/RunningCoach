#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')
const seedPath = process.env.HARNESS_SEED_PATH ?? path.resolve(repoRoot, '../harness-seed')
const seedPackage = JSON.parse(fs.readFileSync(path.join(seedPath, 'package.json'), 'utf8'))
const stackPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const stackManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'))

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  })
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function makeTarget() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'vue3-stack-init-test-'))
  run('git', ['init', '--quiet'], { cwd: target })
  return target
}

function exists(target, rel) {
  return fs.existsSync(path.join(target, rel))
}

function read(target, rel) {
  return fs.readFileSync(path.join(target, rel), 'utf8')
}

function readJson(target, rel) {
  return JSON.parse(read(target, rel))
}

function stackInit(target, ...args) {
  return run(process.execPath, [path.join(repoRoot, 'scripts/init.mjs'), 'init', '--seed-path', seedPath, ...args], {
    cwd: target,
    env: {
      ...process.env,
      HARNESS_SKIP_STACK_RECOMMENDATIONS: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function stackInitInstallsBaseHarnessAndAppliesRules() {
  const target = makeTarget()
  const output = stackInit(target)

  assert(output.includes('스택 하네스 설치 완료'), 'stack init should finish')
  assert(exists(target, '.harness/install-manifest.json'), 'stack init should install base harness')
  assert(exists(target, '.harness/session/project-scan-report.md'), 'stack init should write scan report')
  assert(exists(target, '.harness/session/handoff.md'), 'stack init should write handoff report')
  assert(exists(target, '.harness/stacks/.applied/vue3-vite-pinia-router/manifest.json'), 'stack init should snapshot stack manifest')

  const profile = readJson(target, '.harness/policy/profile.json')
  assert(profile.activeStack === 'vue3-vite-pinia-router', 'stack init should set activeStack')
  assert(profile.stackManifest === '.harness/stacks/.applied/vue3-vite-pinia-router/manifest.json', 'stack init should use project snapshot manifest')

  const localRules = read(target, '.harness/project/stack-preset-rules.md')
  assert(localRules.includes('Vue 3 + Vite + Pinia + Vue Router'), 'stack init should materialize stack rules')
  assert(localRules.includes('instructions/overview.md'), 'stack init should include instruction sections')

  const pkg = readJson(target, 'package.json')
  assert(pkg.scripts['harness:outdated'], 'stack init should install harness outdated command')
  assert(pkg.scripts['harness:update'], 'stack init should install harness update command')

  const marker = readJson(target, '.harness/.stack-applied.json')
  assert(marker.stackId === 'vue3-vite-pinia-router', 'stack marker should record stack id')
  assert(marker.manifestPath === '.harness/stacks/.applied/vue3-vite-pinia-router/manifest.json', 'stack marker should point to project snapshot')

  const lock = readJson(target, '.harness/harness-lock.json')
  assert(lock.baseHarness.id === 'harness-seed', 'lock should record base harness id')
  assert(lock.baseHarness.version === seedPackage.version, 'lock should record installed base harness version')
  assert(lock.baseHarness.repo === 'https://git.smartscore.kr/ai-standard/harnesses/harness-seed.git', 'lock should record base harness repository')
  assert(lock.baseHarness.ref === stackManifest.baseHarness.ref, 'lock should record base harness ref')
  assert(lock.stackHarness.id === 'vue3-vite-pinia-router', 'lock should record stack harness id')
  assert(lock.stackHarness.version === stackPackage.version, 'lock should record stack harness version')
  assert(lock.stackHarness.repo === 'https://git.smartscore.kr/ai-standard/harnesses/vue3-vite-pinia-router.git', 'lock should record stack harness repository')
  assert(lock.stackHarness.ref === stackManifest.stackHarness.ref, 'lock should record stack harness ref')
  assert(lock.stackHarness.requiredBaseHarness.ref === stackManifest.baseHarness.ref, 'lock should record stack required base ref')

  const status = run('npm', ['run', 'stack:status'], { cwd: target })
  assert(status.includes('Harness versions'), 'stack status should show harness versions')
  assert(status.includes(`base: harness-seed ${seedPackage.version} (${stackManifest.baseHarness.ref})`), 'stack status should show base harness version')
  assert(status.includes(`stack: vue3-vite-pinia-router ${stackPackage.version} (${stackManifest.stackHarness.ref})`), 'stack status should show stack harness version')

  const updatePlan = run('npm', ['run', 'harness:update', '--', '--dry-run'], { cwd: target })
  assert(updatePlan.includes('npx -y git+https://git.smartscore.kr/ai-standard/harnesses/vue3-vite-pinia-router.git#semver:^0.1.31 init'), 'harness update should plan compatible stack update')
}

function stackInitUpdatesSameStack() {
  const target = makeTarget()
  stackInit(target, '--no-scan', '--no-handoff', '--no-check')
  const output = stackInit(target, '--no-scan', '--no-handoff', '--no-check')

  assert(output.includes('기존 동일 스택 기준 업데이트 준비'), 'same stack init should reset and reapply')
  const profile = readJson(target, '.harness/policy/profile.json')
  assert(profile.activeStack === 'vue3-vite-pinia-router', 'same stack update should keep activeStack')
}

function stackInitBlocksVue2WithoutWritingFiles() {
  const target = makeTarget()
  fs.writeFileSync(path.join(target, 'package.json'), `${JSON.stringify({
    name: 'vue2-target',
    private: true,
    dependencies: {
      vue: '^2.7.16',
      'vue-router': '^3.6.5',
      vuex: '^3.6.2',
    },
    devDependencies: {
      '@vue/cli-service': '^5.0.8',
    },
  }, null, 2)}\n`)

  let failed = false
  try {
    stackInit(target)
  } catch (error) {
    failed = true
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
    assert(output.includes('스택 호환성 검사 실패'), 'Vue2 mismatch should print compatibility failure')
    assert(output.includes('Vue 2'), 'Vue2 mismatch should explain detected Vue2 stack')
    assert(output.includes('프로젝트 파일은 변경하지 않았습니다'), 'Vue2 mismatch should explain no files were changed')
  }

  assert(failed, 'Vue2 mismatch should fail')
  assert(!exists(target, '.harness'), 'Vue2 mismatch should not install base harness')
  assert(!exists(target, 'CLAUDE.md'), 'Vue2 mismatch should not write harness entrypoints')
}

function stackInitAllowsCurrentCreateVueRouterMajor() {
  const target = makeTarget()
  fs.writeFileSync(path.join(target, 'package.json'), `${JSON.stringify({
    name: 'vue-router5-target',
    private: true,
    type: 'module',
    dependencies: {
      vue: '^3.5.32',
      'vue-router': '^5.0.4',
      pinia: '^3.0.4',
    },
    devDependencies: {
      '@vitejs/plugin-vue': '^6.0.6',
      vite: '^8.0.8',
    },
  }, null, 2)}\n`)

  const output = stackInit(target, '--no-scan', '--no-handoff', '--no-check')

  assert(output.includes('스택 하네스 설치 완료'), 'Vue Router 5 target should install')
  assert(exists(target, '.harness/stacks/.applied/vue3-vite-pinia-router/manifest.json'), 'Vue Router 5 target should apply stack rules')
}

function stackInitBlocksDifferentAppliedStackBeforeUpdate() {
  const target = makeTarget()
  fs.mkdirSync(path.join(target, '.harness/policy'), { recursive: true })
  fs.writeFileSync(path.join(target, '.harness/policy/profile.json'), `${JSON.stringify({
    version: 2,
    activeStack: 'other-stack',
    available: ['none', 'other-stack'],
    stackManifest: '.harness/stacks/.applied/other-stack/manifest.json',
  }, null, 2)}\n`)

  let failed = false
  try {
    stackInit(target)
  } catch (error) {
    failed = true
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
    assert(output.includes('이미 다른 스택 기준이 적용되어 있습니다: other-stack'), 'other stack mismatch should explain existing stack')
    assert(output.includes('프로젝트 파일은 변경하지 않았습니다'), 'other stack mismatch should explain no files were changed')
  }

  assert(failed, 'other stack mismatch should fail')
  assert(!exists(target, 'scripts/guard.mjs'), 'other stack mismatch should not update base harness scripts')
  const profile = readJson(target, '.harness/policy/profile.json')
  assert(profile.activeStack === 'other-stack', 'other stack mismatch should preserve existing profile')
}

const tests = [
  stackInitInstallsBaseHarnessAndAppliesRules,
  stackInitUpdatesSameStack,
  stackInitBlocksVue2WithoutWritingFiles,
  stackInitAllowsCurrentCreateVueRouterMajor,
  stackInitBlocksDifferentAppliedStackBeforeUpdate,
]

for (const test of tests) {
  test()
  console.log(`OK ${test.name}`)
}
