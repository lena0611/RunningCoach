<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import {
  injuryAreaCatalog,
  injuryAreaGroups,
  getInjuryArea,
  getInjuryAreaLabel,
  type InjuryAreaSelection
} from '@/entities/training-memory/injuryAreas'
import ScaleSlider from './ScaleSlider.vue'

type BodyPartSpec = {
  areaId: string
  shape: 'capsule' | 'sphere' | 'box'
  position: [number, number, number]
  scale: [number, number, number]
  rotation?: [number, number, number]
}

const props = withDefaults(
  defineProps<{
    modelValue: InjuryAreaSelection[]
    label?: string
  }>(),
  {
    label: '부상 부위'
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: InjuryAreaSelection[]]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const selectedPart = ref('')
const hoveredPart = ref('')
const dragStart = ref<{ x: number; y: number; rotation: number; moved: boolean } | null>(null)
const rotationY = ref(0)

const selectedIds = computed(() => new Set((props.modelValue ?? []).map((item) => item.areaId)))
const selectedAreas = computed(() => (props.modelValue ?? []).map((item) => ({ ...item, definition: getInjuryArea(item.areaId) })).filter((item) => item.definition))
const selectedLabel = computed(() => selectedPart.value ? getInjuryAreaLabel(selectedPart.value) : '부위를 터치하세요')
const viewLabel = computed(() => {
  const normalized = ((rotationY.value % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  if (normalized < Math.PI / 4 || normalized >= Math.PI * 7 / 4) return '전면'
  if (normalized < Math.PI * 3 / 4) return '우측'
  if (normalized < Math.PI * 5 / 4) return '후면'
  return '좌측'
})

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let bodyGroup: THREE.Group | null = null
let resizeObserver: ResizeObserver | null = null
let animationId = 0

const clickableMeshes: THREE.Mesh[] = []
const baseMeshes: THREE.Mesh[] = []
const partMeshes = new Map<string, THREE.Mesh>()
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

const bodyParts: BodyPartSpec[] = [
  { areaId: 'lower-back', shape: 'box', position: [0, 0.78, -0.28], scale: [0.58, 0.36, 0.1] },
  { areaId: 'left-hip', shape: 'sphere', position: [-0.28, 0.42, 0], scale: [0.3, 0.24, 0.25] },
  { areaId: 'right-hip', shape: 'sphere', position: [0.28, 0.42, 0], scale: [0.3, 0.24, 0.25] },
  { areaId: 'left-quadriceps', shape: 'capsule', position: [-0.25, -0.18, 0.16], scale: [0.18, 0.84, 0.18] },
  { areaId: 'right-quadriceps', shape: 'capsule', position: [0.25, -0.18, 0.16], scale: [0.18, 0.84, 0.18] },
  { areaId: 'left-hamstring', shape: 'capsule', position: [-0.25, -0.18, -0.16], scale: [0.18, 0.84, 0.18] },
  { areaId: 'right-hamstring', shape: 'capsule', position: [0.25, -0.18, -0.16], scale: [0.18, 0.84, 0.18] },
  { areaId: 'left-it-band', shape: 'capsule', position: [-0.46, -0.18, 0], scale: [0.09, 0.9, 0.11] },
  { areaId: 'right-it-band', shape: 'capsule', position: [0.46, -0.18, 0], scale: [0.09, 0.9, 0.11] },
  { areaId: 'left-knee', shape: 'sphere', position: [-0.25, -0.72, 0.06], scale: [0.2, 0.16, 0.18] },
  { areaId: 'right-knee', shape: 'sphere', position: [0.25, -0.72, 0.06], scale: [0.2, 0.16, 0.18] },
  { areaId: 'left-shin', shape: 'capsule', position: [-0.25, -1.28, 0.12], scale: [0.14, 0.78, 0.14] },
  { areaId: 'right-shin', shape: 'capsule', position: [0.25, -1.28, 0.12], scale: [0.14, 0.78, 0.14] },
  { areaId: 'left-calf', shape: 'capsule', position: [-0.25, -1.28, -0.13], scale: [0.16, 0.78, 0.16] },
  { areaId: 'right-calf', shape: 'capsule', position: [0.25, -1.28, -0.13], scale: [0.16, 0.78, 0.16] },
  { areaId: 'left-achilles', shape: 'capsule', position: [-0.25, -1.82, -0.17], scale: [0.08, 0.34, 0.08] },
  { areaId: 'right-achilles', shape: 'capsule', position: [0.25, -1.82, -0.17], scale: [0.08, 0.34, 0.08] },
  { areaId: 'left-ankle', shape: 'sphere', position: [-0.25, -1.98, 0.02], scale: [0.15, 0.12, 0.15] },
  { areaId: 'right-ankle', shape: 'sphere', position: [0.25, -1.98, 0.02], scale: [0.15, 0.12, 0.15] },
  { areaId: 'left-plantar-fascia', shape: 'box', position: [-0.25, -2.1, 0.18], scale: [0.33, 0.1, 0.46] },
  { areaId: 'right-plantar-fascia', shape: 'box', position: [0.25, -2.1, 0.18], scale: [0.33, 0.1, 0.46] }
]

function toggleArea(areaId: string) {
  const next = [...(props.modelValue ?? [])]
  const index = next.findIndex((item) => item.areaId === areaId)
  if (index >= 0) {
    next.splice(index, 1)
  } else {
    next.push({ areaId, painLevel: null })
  }
  selectedPart.value = areaId
  emit('update:modelValue', next)
}

function updatePain(areaId: string, painLevel: number | null) {
  emit('update:modelValue', (props.modelValue ?? []).map((item) => item.areaId === areaId ? { ...item, painLevel } : item))
}

function rotateTo(angle: number) {
  rotationY.value = angle
  if (bodyGroup) bodyGroup.rotation.y = angle
}

function rotateBy(delta: number) {
  rotateTo(rotationY.value + delta)
}

function onPointerDown(event: PointerEvent) {
  event.preventDefault()
  dragStart.value = { x: event.clientX, y: event.clientY, rotation: rotationY.value, moved: false }
  canvasRef.value?.setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  event.preventDefault()
  if (!dragStart.value) {
    updateHover(event)
    return
  }
  const dx = event.clientX - dragStart.value.x
  const dy = event.clientY - dragStart.value.y
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragStart.value.moved = true
  rotateTo(dragStart.value.rotation + dx * 0.012)
}

function onPointerUp(event: PointerEvent) {
  event.preventDefault()
  const start = dragStart.value
  dragStart.value = null
  canvasRef.value?.releasePointerCapture?.(event.pointerId)
  if (!start || start.moved) return
  const hit = findHitArea(event)
  if (hit) toggleArea(hit)
}

function updateHover(event: PointerEvent) {
  const hit = findHitArea(event)
  if (hoveredPart.value === hit) return
  hoveredPart.value = hit
  updateMaterials()
}

function findHitArea(event: PointerEvent) {
  if (!canvasRef.value || !camera) return ''
  const rect = canvasRef.value.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(clickableMeshes, false)
  const areaId = hits[0]?.object.userData.areaId
  return typeof areaId === 'string' ? areaId : ''
}

function createScene() {
  const canvas = canvasRef.value
  if (!canvas) return

  scene = new THREE.Scene()
  scene.background = null
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
  camera.position.set(0, -0.02, 6.7)

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const ambient = new THREE.HemisphereLight(0xffffff, 0x102014, 2.35)
  const key = new THREE.DirectionalLight(0xffffff, 2.25)
  key.position.set(2.5, 3, 4)
  const rim = new THREE.DirectionalLight(0x4ade80, 1.4)
  rim.position.set(-2, 1.5, -3)
  const fill = new THREE.DirectionalLight(0x38bdf8, 0.62)
  fill.position.set(-3, -0.5, 2)
  scene.add(ambient, key, rim, fill)

  bodyGroup = new THREE.Group()
  scene.add(bodyGroup)
  buildBody()
  resize()

  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)
  animate()
}

function buildBody() {
  if (!bodyGroup) return
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x17202c,
    roughness: 0.72,
    metalness: 0.04,
    transparent: true,
    opacity: 0.92
  })
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x07130f,
    transparent: true,
    opacity: 0.22
  })

  addBaseMesh(new THREE.CircleGeometry(1.25, 64), [0, -2.24, -0.06], [1.1, 0.24, 1], shadowMaterial, [-Math.PI / 2, 0, 0])

  addBaseMesh(new THREE.SphereGeometry(0.28, 32, 20), [0, 1.98, 0], [1, 1.04, 0.92], baseMaterial)
  addBaseMesh(new THREE.CapsuleGeometry(0.42, 0.98, 10, 24), [0, 0.95, 0], [0.82, 1, 0.54], baseMaterial)
  addBaseMesh(new THREE.SphereGeometry(0.34, 24, 16), [0, 0.36, 0], [1.42, 0.48, 0.76], baseMaterial)
  addBaseMesh(new THREE.CapsuleGeometry(0.11, 0.9, 8, 18), [-0.61, 0.83, 0], [1, 1, 1], baseMaterial, [0, 0, -0.18])
  addBaseMesh(new THREE.CapsuleGeometry(0.11, 0.9, 8, 18), [0.61, 0.83, 0], [1, 1, 1], baseMaterial, [0, 0, 0.18])
  addBaseMesh(new THREE.CapsuleGeometry(0.1, 0.95, 8, 18), [-0.25, -0.22, 0], [1, 1, 1], baseMaterial)
  addBaseMesh(new THREE.CapsuleGeometry(0.1, 0.95, 8, 18), [0.25, -0.22, 0], [1, 1, 1], baseMaterial)
  addBaseMesh(new THREE.CapsuleGeometry(0.085, 0.98, 8, 18), [-0.25, -1.34, 0], [1, 1, 1], baseMaterial)
  addBaseMesh(new THREE.CapsuleGeometry(0.085, 0.98, 8, 18), [0.25, -1.34, 0], [1, 1, 1], baseMaterial)

  for (const spec of bodyParts) {
    const mesh = createBodyPartMesh(spec)
    clickableMeshes.push(mesh)
    partMeshes.set(spec.areaId, mesh)
    bodyGroup.add(mesh)
  }
  updateMaterials()
}

function addBaseMesh(
  geometry: THREE.BufferGeometry,
  position: [number, number, number],
  scale: [number, number, number],
  material: THREE.Material,
  rotation: [number, number, number] = [0, 0, 0]
) {
  if (!bodyGroup) return
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(...position)
  mesh.scale.set(...scale)
  mesh.rotation.set(...rotation)
  baseMeshes.push(mesh)
  bodyGroup.add(mesh)
}

function createBodyPartMesh(spec: BodyPartSpec) {
  const geometry = createGeometry(spec)
  const material = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x062f3f,
    emissiveIntensity: 0.36,
    roughness: 0.62,
    metalness: 0.08,
    transparent: true,
    opacity: 0.72
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(...spec.position)
  mesh.scale.set(...spec.scale)
  if (spec.rotation) mesh.rotation.set(...spec.rotation)
  mesh.userData.areaId = spec.areaId
  mesh.userData.baseScale = [...spec.scale]
  return mesh
}

function createGeometry(spec: BodyPartSpec) {
  if (spec.shape === 'sphere') return new THREE.SphereGeometry(1, 24, 16)
  if (spec.shape === 'box') return new THREE.BoxGeometry(1, 1, 1, 2, 2, 2)
  return new THREE.CapsuleGeometry(1, 1.8, 8, 18)
}

function updateMaterials() {
  const ids = selectedIds.value
  for (const mesh of clickableMeshes) {
    const material = mesh.material as THREE.MeshStandardMaterial
    const selected = ids.has(mesh.userData.areaId)
    const hovered = hoveredPart.value === mesh.userData.areaId
    material.color.setHex(selected ? 0x4ade80 : hovered ? 0x7dd3fc : 0x38bdf8)
    material.emissive.setHex(selected ? 0x14532d : hovered ? 0x0e7490 : 0x062f3f)
    material.emissiveIntensity = selected ? 0.85 : hovered ? 0.62 : 0.36
    material.opacity = selected ? 0.94 : hovered ? 0.78 : 0.55
    const baseScale = mesh.userData.baseScale as [number, number, number] | undefined
    if (baseScale) {
      const scaleUp = selected || hovered ? 1.08 : 1
      mesh.scale.set(baseScale[0] * scaleUp, baseScale[1] * scaleUp, baseScale[2] * scaleUp)
    }
  }
}

function resize() {
  if (!renderer || !camera || !canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

function animate() {
  if (!renderer || !scene || !camera) return
  renderer.render(scene, camera)
  animationId = requestAnimationFrame(animate)
}

watch(selectedIds, updateMaterials)

onMounted(() => {
  nextTick(createScene)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId)
  resizeObserver?.disconnect()
  for (const mesh of [...clickableMeshes, ...baseMeshes]) {
    mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material.dispose()
  }
  renderer?.dispose()
  clickableMeshes.length = 0
  baseMeshes.length = 0
  partMeshes.clear()
})
</script>

<template>
  <div class="injury-body-selector full">
    <div class="injury-selector-head">
      <div>
        <span class="form-section-title">{{ label }}</span>
        <p class="helper">모델을 좌우로 끌어 360도로 돌리고, 부위를 터치하거나 아래 목록에서 복수 선택하세요.</p>
      </div>
      <span class="context-chip">{{ selectedAreas.length }}개 선택</span>
    </div>

    <div class="injury-body-layout">
      <section class="body-view-card" aria-label="3D 인체 부위 선택">
        <div class="body-view-toolbar body-view-toolbar-3d">
          <button type="button" aria-label="왼쪽으로 회전" @click="rotateBy(-Math.PI / 2)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div class="body-view-status">
            <strong>3D Around View · {{ viewLabel }}</strong>
            <small>{{ selectedLabel }}</small>
          </div>
          <button type="button" aria-label="오른쪽으로 회전" @click="rotateBy(Math.PI / 2)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>

        <div class="body-3d-stage">
          <canvas
            ref="canvasRef"
            class="body-3d-canvas"
            aria-label="회전 가능한 3D 인체 모델"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="dragStart = null"
          />
          <div class="body-view-label">{{ viewLabel }} · 드래그 회전 · 터치 선택</div>
          <div class="body-3d-glow" aria-hidden="true"></div>
        </div>
      </section>

      <section class="injury-area-list" aria-label="부위 목록 선택">
        <article v-for="group in injuryAreaGroups" :key="group.id">
          <div class="injury-group-head">
            <strong>{{ group.label }}</strong>
            <small>{{ group.description }}</small>
          </div>
          <div class="injury-area-chip-grid">
            <button
              v-for="area in injuryAreaCatalog.filter((item) => item.group === group.id)"
              :key="area.id"
              type="button"
              :class="{ selected: selectedIds.has(area.id) }"
              @click="toggleArea(area.id)"
            >
              <span>{{ area.shortLabel }}</span>
              <small>{{ area.structure }}</small>
            </button>
          </div>
        </article>
      </section>
    </div>

    <div v-if="selectedAreas.length" class="injury-pain-panel">
      <strong>부위별 통증 레벨</strong>
      <ScaleSlider
        v-for="selection in selectedAreas"
        :key="selection.areaId"
        :model-value="selection.painLevel"
        :label="getInjuryAreaLabel(selection.areaId)"
        :min="1"
        :max="5"
        min-label="조용함"
        max-label="강함"
        @update:model-value="updatePain(selection.areaId, $event)"
      />
    </div>
  </div>
</template>
