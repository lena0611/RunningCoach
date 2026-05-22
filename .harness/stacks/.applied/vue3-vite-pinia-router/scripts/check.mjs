import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'))
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function exists(rel) {
  return fs.existsSync(path.join(repoRoot, rel))
}

const manifest = readJson('manifest.json')
assert(manifest.id === 'vue3-vite-pinia-router', 'manifest id mismatch')
assert(manifest.stackHarness?.repo, 'stackHarness.repo required')
assert(manifest.stackHarness?.ref, 'stackHarness.ref required')
assert(manifest.baseHarness?.repo, 'baseHarness.repo required')
assert(manifest.baseHarness?.ref, 'baseHarness.ref required')
assert(manifest.baseHarness?.minVersion, 'baseHarness.minVersion required')
assert(manifest.compatibility?.allowEmptyProject === true, 'compatibility.allowEmptyProject must be true for this stack')
assert(Array.isArray(manifest.compatibility.expected), 'compatibility.expected required')
assert(Array.isArray(manifest.compatibility.incompatible), 'compatibility.incompatible required')
for (const rule of [...manifest.compatibility.expected, ...manifest.compatibility.incompatible]) {
  assert(rule.package, 'compatibility rule package required')
  assert(rule.label, `compatibility rule label required: ${rule.package}`)
}
assert(manifest.source?.type === 'none', 'this stack harness must be rules-only')
assert(Array.isArray(manifest.instructions) && manifest.instructions.length > 0, 'manifest instructions required')

for (const instruction of manifest.instructions) {
  assert(exists(instruction), `missing instruction: ${instruction}`)
}

assert(exists(manifest.policiesFile), `missing policiesFile: ${manifest.policiesFile}`)

const policies = readJson(manifest.policiesFile)
assert(policies.stackId === manifest.id, 'policies stackId mismatch')
assert(Array.isArray(policies.policies), 'policies array required')

for (const policy of policies.policies) {
  assert(policy.id, 'policy id required')
  assert(Array.isArray(policy.documents), `policy documents required: ${policy.id}`)
  assert(Array.isArray(policy.ownedAreas), `policy ownedAreas required: ${policy.id}`)
}

console.log('vue3-vite-pinia-router harness check passed')
