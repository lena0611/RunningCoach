#!/usr/bin/env node

import { spawnSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')
const hookName = process.argv[2]
const hookArgs = process.argv.slice(3)

const allowedHooks = new Set(['pre-commit', 'pre-push'])

function readGitConfig(key) {
  try {
    return execFileSync('git', ['config', '--get', key], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function toAbs(value) {
  if (!value) return ''
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value)
}

function samePath(a, b) {
  if (!a || !b) return false
  try {
    return fs.realpathSync(a) === fs.realpathSync(b)
  } catch {
    return path.resolve(a) === path.resolve(b)
  }
}

function isExecutable(file) {
  try {
    return (fs.statSync(file).mode & 0o111) !== 0
  } catch {
    return false
  }
}

if (!allowedHooks.has(hookName)) {
  console.error(`Unsupported hook name: ${hookName || '(empty)'}`)
  process.exit(1)
}

const previousHooksPath = readGitConfig('harness.previousHooksPath')
const previousHooksAbs = toAbs(previousHooksPath)
const harnessHooksAbs = path.resolve(repoRoot, '.githooks')

if (!previousHooksAbs || samePath(previousHooksAbs, harnessHooksAbs)) {
  process.exit(0)
}

const previousHook = path.join(previousHooksAbs, hookName)
if (!fs.existsSync(previousHook) || fs.statSync(previousHook).isDirectory()) {
  process.exit(0)
}

console.log(`이전 git hook 실행: ${path.relative(repoRoot, previousHook) || previousHook}`)

const command = isExecutable(previousHook) ? previousHook : 'sh'
const args = isExecutable(previousHook) ? hookArgs : [previousHook, ...hookArgs]
const result = spawnSync(command, args, {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: false,
})

if (result.error) {
  console.error(`이전 git hook 실행 실패: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status === null || result.status === undefined ? 1 : result.status)
