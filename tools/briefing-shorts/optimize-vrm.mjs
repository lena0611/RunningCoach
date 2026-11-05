#!/usr/bin/env node
// 브리핑 쇼츠(#898) 캐릭터 모델 경량화.
//
// 원본 VRM 은 10MB 남짓인데 그중 상당 부분이 화면에 안 쓰이거나 과한 텍스처다.
//   - Thumbnail(2048²): 렌더에 안 쓰인다 → 8×8 로 바꾼다(메타가 가리키는 자리는 남긴다).
//   - 2048² 텍스처(몸 색·몸 노멀·상의): 무대 렌더가 720×819 라 1024² 로 충분하다.
// 그 외(얼굴·눈·머리)는 손대지 않는다 — 말할 때 얼굴 클로즈업이라 화질이 보인다.
//   - 표정 모프의 노멀 변화량: 툰 셰이딩이라 티가 안 난다 → 뺀다(VRoid 2.x 모델은 3MB 넘게 준다).
//
// 사용: node tools/briefing-shorts/optimize-vrm.mjs <입력.vrm> <출력.vrm>
// macOS `sips` 로 PNG 를 줄인다(추가 의존성 없음).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('usage: optimize-vrm.mjs <input.vrm> <output.vrm>')
  process.exit(1)
}

const MAX_SIDE = 1024
const glb = readFileSync(input)
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error('GLB 가 아닙니다')
const jsonLength = glb.readUInt32LE(12)
const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'))
const binHeader = 20 + jsonLength
const binLength = glb.readUInt32LE(binHeader)
const bin = glb.subarray(binHeader + 8, binHeader + 8 + binLength)

// 표정 모프의 노멀 변화량을 뺀다: 툰 셰이딩이라 표정 때 면 방향이 안 바뀌어도 티가 안 나는데,
// VRoid 2.x 모델은 이게 모프 위치와 같은 크기(3MB 넘게)다
for (const mesh of json.meshes ?? []) {
  for (const prim of mesh.primitives) for (const target of prim.targets ?? []) { delete target.NORMAL; delete target.TANGENT }
}
// 그래서 안 쓰게 된 접근자·버퍼뷰를 걷어 내고 번호를 다시 매긴다
function compact(list, used, refs) {
  const map = new Map()
  const kept = list.filter((_, index) => used.has(index) && (map.set(index, map.size), true))
  for (const [owner, key] of refs) owner[key] = map.get(owner[key])
  return kept
}
{
  const refs = []
  const ref = (owner, key) => { if (owner?.[key] !== undefined) refs.push([owner, key]) }
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      for (const key of Object.keys(prim.attributes)) ref(prim.attributes, key)
      ref(prim, 'indices')
      for (const target of prim.targets ?? []) for (const key of Object.keys(target)) ref(target, key)
    }
  }
  for (const skin of json.skins ?? []) ref(skin, 'inverseBindMatrices')
  for (const animation of json.animations ?? []) for (const sampler of animation.samplers) { ref(sampler, 'input'); ref(sampler, 'output') }
  json.accessors = compact(json.accessors, new Set(refs.map(([owner, key]) => owner[key])), refs)
}
{
  const refs = []
  for (const accessor of json.accessors) {
    if (accessor.bufferView !== undefined) refs.push([accessor, 'bufferView'])
    if (accessor.sparse) refs.push([accessor.sparse.indices, 'bufferView'], [accessor.sparse.values, 'bufferView'])
  }
  for (const image of json.images ?? []) if (image.bufferView !== undefined) refs.push([image, 'bufferView'])
  json.bufferViews = compact(json.bufferViews, new Set(refs.map(([owner, key]) => owner[key])), refs)
}

const work = mkdtempSync(join(tmpdir(), 'vrm-opt-'))
const pngSize = (data) => ({ w: data.readUInt32BE(16), h: data.readUInt32BE(20) })
const viewData = (bv) => bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength)

// 각 bufferView 의 새 내용(바뀐 이미지만 교체)
const replaced = new Map()
const thumbnailIndex = json.extensions?.VRMC_vrm?.meta?.thumbnailImage ?? json.extensions?.VRM?.meta?.texture ?? null
const thumbnailImage =
  json.extensions?.VRMC_vrm ? thumbnailIndex : thumbnailIndex !== null ? json.textures?.[thumbnailIndex]?.source ?? null : null

json.images?.forEach((image, index) => {
  if (image.bufferView === undefined || image.mimeType !== 'image/png') return
  const data = viewData(json.bufferViews[image.bufferView])
  const { w, h } = pngSize(data)
  const isThumbnail = index === thumbnailImage || image.name === 'Thumbnail'
  const target = isThumbnail ? 8 : Math.max(w, h) > MAX_SIDE ? MAX_SIDE : null
  if (!target) return
  const src = join(work, `${index}.png`)
  const dst = join(work, `${index}-out.png`)
  writeFileSync(src, data)
  execFileSync('sips', ['-Z', String(target), src, '--out', dst], { stdio: 'ignore' })
  const next = readFileSync(dst)
  replaced.set(image.bufferView, next)
  const after = pngSize(next)
  console.log(`${image.name ?? index}: ${w}x${h} ${Math.round(data.length / 1024)}KB -> ${after.w}x${after.h} ${Math.round(next.length / 1024)}KB`)
})

// BIN 다시 쌓기: bufferView 순서대로 4바이트 정렬해 이어 붙이고 오프셋을 고친다(접근자는 뷰 기준 오프셋이라 그대로).
const chunks = []
let offset = 0
json.bufferViews.forEach((bv, index) => {
  const data = replaced.get(index) ?? viewData(bv)
  const pad = (4 - (offset % 4)) % 4
  if (pad) chunks.push(Buffer.alloc(pad))
  offset += pad
  bv.byteOffset = offset
  bv.byteLength = data.length
  chunks.push(data)
  offset += data.length
})
const tail = (4 - (offset % 4)) % 4
if (tail) chunks.push(Buffer.alloc(tail))
const newBin = Buffer.concat(chunks)
json.buffers[0].byteLength = newBin.length

let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8')
const jsonPad = (4 - (jsonBuf.length % 4)) % 4
jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)])

const header = Buffer.alloc(12)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + newBin.length, 8)
const jsonHead = Buffer.alloc(8)
jsonHead.writeUInt32LE(jsonBuf.length, 0)
jsonHead.writeUInt32LE(0x4e4f534a, 4)
const binHead = Buffer.alloc(8)
binHead.writeUInt32LE(newBin.length, 0)
binHead.writeUInt32LE(0x004e4942, 4)

const out = Buffer.concat([header, jsonHead, jsonBuf, binHead, newBin])
writeFileSync(output, out)
console.log(`${input} ${(glb.length / 1e6).toFixed(1)}MB -> ${output} ${(out.length / 1e6).toFixed(1)}MB`)
