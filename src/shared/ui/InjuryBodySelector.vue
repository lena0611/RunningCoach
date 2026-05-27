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
  shape: BodyShape
  position: [number, number, number]
  scale: [number, number, number]
  rotation?: [number, number, number]
  model: BodyModelId
}

type BasePartSpec = Omit<BodyPartSpec, 'areaId' | 'model'> & {
  model: BodyModelId
  tone?: 'bone' | 'shadow'
}

type BodyModelId = 'upper' | 'lower' | 'foot'
type BodyShape = 'capsule' | 'sphere' | 'box' | 'muscle' | 'torso' | 'limb' | 'footSurface'

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
const activeModel = ref<BodyModelId>('lower')

const selectedIds = computed(() => new Set((props.modelValue ?? []).map((item) => item.areaId)))
const selectedAreas = computed(() => (props.modelValue ?? []).map((item) => ({ ...item, definition: getInjuryArea(item.areaId) })).filter((item) => item.definition))
const selectedLabel = computed(() => selectedPart.value ? getInjuryAreaLabel(selectedPart.value) : '부위를 터치하세요')
const activeModelLabel = computed(() => bodyModelOptions.find((item) => item.id === activeModel.value)?.label ?? '하체')
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
const outlineSegments: THREE.LineSegments[] = []
const partMeshes = new Map<string, THREE.Mesh>()
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

const bodyModelOptions: Array<{ id: BodyModelId; label: string; description: string }> = [
  { id: 'upper', label: '상체/허리', description: '허리, 골반 주변' },
  { id: 'lower', label: '하체', description: '대퇴, 무릎, 정강이, 종아리' },
  { id: 'foot', label: '발/발목', description: '발목, 아킬레스, 족저' }
]

const modelViewConfig: Record<BodyModelId, { scale: number; y: number; cameraZ: number; floorY: number }> = {
  upper: { scale: 1.48, y: -0.2, cameraZ: 5.8, floorY: -0.56 },
  lower: { scale: 1.28, y: 0.28, cameraZ: 6.1, floorY: -1.6 },
  foot: { scale: 1.9, y: -0.18, cameraZ: 5.1, floorY: -0.52 }
}

const baseParts: BasePartSpec[] = [
  { model: 'upper', shape: 'sphere', position: [0, 1.32, 0], scale: [0.18, 0.18, 0.16] },
  { model: 'upper', shape: 'torso', position: [0, 0.55, 0], scale: [0.86, 0.92, 0.52] },
  { model: 'upper', shape: 'sphere', position: [0, -0.04, 0], scale: [0.74, 0.22, 0.44] },
  { model: 'upper', shape: 'limb', position: [-0.58, 0.42, 0], scale: [0.15, 0.54, 0.12], rotation: [0, 0, -0.12] },
  { model: 'upper', shape: 'limb', position: [0.58, 0.42, 0], scale: [0.15, 0.54, 0.12], rotation: [0, 0, 0.12] },

  { model: 'lower', shape: 'sphere', position: [0, 0.95, 0], scale: [0.64, 0.22, 0.38] },
  { model: 'lower', shape: 'limb', position: [-0.28, 0.18, 0], scale: [0.2, 0.66, 0.15] },
  { model: 'lower', shape: 'limb', position: [0.28, 0.18, 0], scale: [0.2, 0.66, 0.15] },
  { model: 'lower', shape: 'sphere', position: [-0.28, -0.42, 0.02], scale: [0.14, 0.12, 0.14] },
  { model: 'lower', shape: 'sphere', position: [0.28, -0.42, 0.02], scale: [0.14, 0.12, 0.14] },
  { model: 'lower', shape: 'limb', position: [-0.28, -1.02, 0], scale: [0.14, 0.56, 0.1] },
  { model: 'lower', shape: 'limb', position: [0.28, -1.02, 0], scale: [0.14, 0.56, 0.1] },

  { model: 'foot', shape: 'limb', position: [-0.28, 0.68, 0], scale: [0.14, 0.58, 0.1] },
  { model: 'foot', shape: 'limb', position: [0.28, 0.68, 0], scale: [0.14, 0.58, 0.1] },
  { model: 'foot', shape: 'sphere', position: [-0.28, 0.04, 0.02], scale: [0.18, 0.14, 0.18] },
  { model: 'foot', shape: 'sphere', position: [0.28, 0.04, 0.02], scale: [0.18, 0.14, 0.18] },
  { model: 'foot', shape: 'footSurface', position: [-0.28, -0.18, 0.28], scale: [0.36, 0.1, 0.66] },
  { model: 'foot', shape: 'footSurface', position: [0.28, -0.18, 0.28], scale: [0.36, 0.1, 0.66] }
]

const bodyParts: BodyPartSpec[] = [
  { model: 'upper', areaId: 'lower-back', shape: 'box', position: [0, 0.42, -0.29], scale: [0.54, 0.34, 0.06] },
  { model: 'upper', areaId: 'left-hip', shape: 'sphere', position: [-0.34, -0.08, -0.04], scale: [0.24, 0.2, 0.24] },
  { model: 'upper', areaId: 'right-hip', shape: 'sphere', position: [0.34, -0.08, -0.04], scale: [0.24, 0.2, 0.24] },

  { model: 'lower', areaId: 'left-hip', shape: 'sphere', position: [-0.32, 0.86, 0], scale: [0.24, 0.2, 0.24] },
  { model: 'lower', areaId: 'right-hip', shape: 'sphere', position: [0.32, 0.86, 0], scale: [0.24, 0.2, 0.24] },
  { model: 'lower', areaId: 'left-quadriceps', shape: 'muscle', position: [-0.25, 0.24, 0.17], scale: [0.15, 0.48, 0.09] },
  { model: 'lower', areaId: 'left-quadriceps', shape: 'muscle', position: [-0.39, 0.17, 0.09], scale: [0.1, 0.42, 0.075], rotation: [0, 0, -0.08] },
  { model: 'lower', areaId: 'right-quadriceps', shape: 'muscle', position: [0.25, 0.24, 0.17], scale: [0.15, 0.48, 0.09] },
  { model: 'lower', areaId: 'right-quadriceps', shape: 'muscle', position: [0.39, 0.17, 0.09], scale: [0.1, 0.42, 0.075], rotation: [0, 0, 0.08] },
  { model: 'lower', areaId: 'left-hamstring', shape: 'muscle', position: [-0.24, 0.2, -0.16], scale: [0.14, 0.5, 0.1] },
  { model: 'lower', areaId: 'right-hamstring', shape: 'muscle', position: [0.24, 0.2, -0.16], scale: [0.14, 0.5, 0.1] },
  { model: 'lower', areaId: 'left-it-band', shape: 'capsule', position: [-0.47, 0.08, 0.02], scale: [0.035, 0.68, 0.045] },
  { model: 'lower', areaId: 'right-it-band', shape: 'capsule', position: [0.47, 0.08, 0.02], scale: [0.035, 0.68, 0.045] },
  { model: 'lower', areaId: 'left-knee', shape: 'sphere', position: [-0.28, -0.42, 0.06], scale: [0.19, 0.14, 0.17] },
  { model: 'lower', areaId: 'right-knee', shape: 'sphere', position: [0.28, -0.42, 0.06], scale: [0.19, 0.14, 0.17] },
  { model: 'lower', areaId: 'left-shin', shape: 'capsule', position: [-0.28, -1.02, 0.13], scale: [0.055, 0.55, 0.045] },
  { model: 'lower', areaId: 'right-shin', shape: 'capsule', position: [0.28, -1.02, 0.13], scale: [0.055, 0.55, 0.045] },
  { model: 'lower', areaId: 'left-calf', shape: 'muscle', position: [-0.28, -1.02, -0.13], scale: [0.13, 0.48, 0.1] },
  { model: 'lower', areaId: 'right-calf', shape: 'muscle', position: [0.28, -1.02, -0.13], scale: [0.13, 0.48, 0.1] },

  { model: 'foot', areaId: 'left-calf', shape: 'muscle', position: [-0.28, 0.64, -0.12], scale: [0.12, 0.42, 0.09] },
  { model: 'foot', areaId: 'right-calf', shape: 'muscle', position: [0.28, 0.64, -0.12], scale: [0.12, 0.42, 0.09] },
  { model: 'foot', areaId: 'left-achilles', shape: 'capsule', position: [-0.28, 0.1, -0.18], scale: [0.04, 0.36, 0.04] },
  { model: 'foot', areaId: 'right-achilles', shape: 'capsule', position: [0.28, 0.1, -0.18], scale: [0.04, 0.36, 0.04] },
  { model: 'foot', areaId: 'left-ankle', shape: 'sphere', position: [-0.28, -0.1, 0.02], scale: [0.18, 0.13, 0.18] },
  { model: 'foot', areaId: 'right-ankle', shape: 'sphere', position: [0.28, -0.1, 0.02], scale: [0.18, 0.13, 0.18] },
  { model: 'foot', areaId: 'left-plantar-fascia', shape: 'box', position: [-0.28, -0.34, 0.32], scale: [0.34, 0.045, 0.58] },
  { model: 'foot', areaId: 'right-plantar-fascia', shape: 'box', position: [0.28, -0.34, 0.32], scale: [0.34, 0.045, 0.58] }
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

function setActiveModel(model: BodyModelId) {
  activeModel.value = model
  selectedPart.value = ''
  hoveredPart.value = ''
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
  camera.position.set(0, -0.02, modelViewConfig[activeModel.value].cameraZ)

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
  clearModelMeshes()
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x202a34,
    roughness: 0.66,
    metalness: 0.04,
    transparent: false
  })
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x07130f,
    transparent: true,
    opacity: 0.22
  })

  const config = modelViewConfig[activeModel.value]
  bodyGroup.scale.setScalar(config.scale)
  bodyGroup.position.set(0, config.y, 0)
  bodyGroup.rotation.y = rotationY.value
  if (camera) camera.position.z = config.cameraZ

  addBaseMesh(new THREE.CircleGeometry(1.18, 64), [0, config.floorY, -0.08], [1.08, 0.24, 1], shadowMaterial, [-Math.PI / 2, 0, 0])

  for (const spec of baseParts.filter((item) => item.model === activeModel.value)) {
    addBaseMesh(createGeometry(spec), spec.position, spec.scale, baseMaterial, spec.rotation)
  }

  for (const spec of bodyParts.filter((item) => item.model === activeModel.value)) {
    const mesh = createBodyPartMesh(spec)
    clickableMeshes.push(mesh)
    partMeshes.set(spec.areaId, mesh)
    bodyGroup.add(mesh)
  }
  updateMaterials()
}

function clearModelMeshes() {
  if (!bodyGroup) return
  for (const mesh of [...clickableMeshes, ...baseMeshes]) {
    bodyGroup.remove(mesh)
    for (const child of [...mesh.children]) {
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose()
        const material = child.material
        if (Array.isArray(material)) material.forEach((item) => item.dispose())
        else material.dispose()
      }
    }
    mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material.dispose()
  }
  clickableMeshes.length = 0
  baseMeshes.length = 0
  outlineSegments.length = 0
  partMeshes.clear()
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
    color: 0x24313c,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.64,
    metalness: 0.04,
    transparent: false
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(...spec.position)
  mesh.scale.set(...spec.scale)
  if (spec.rotation) mesh.rotation.set(...spec.rotation)
  mesh.userData.areaId = spec.areaId
  mesh.userData.baseScale = [...spec.scale]
  const outline = createAreaOutline(geometry)
  mesh.add(outline)
  outlineSegments.push(outline)
  mesh.userData.outline = outline
  return mesh
}

function createGeometry(spec: Pick<BodyPartSpec, 'shape'>) {
  if (spec.shape === 'torso') return createTorsoGeometry()
  if (spec.shape === 'limb') return createLimbGeometry()
  if (spec.shape === 'footSurface') return createFootGeometry()
  if (spec.shape === 'sphere') return new THREE.SphereGeometry(1, 24, 16)
  if (spec.shape === 'box') return new THREE.BoxGeometry(1, 1, 1, 2, 2, 2)
  if (spec.shape === 'muscle') return new THREE.SphereGeometry(1, 28, 18)
  return new THREE.CapsuleGeometry(1, 1.8, 8, 18)
}

function createTorsoGeometry() {
  const points = [
    new THREE.Vector2(0.2, -0.86),
    new THREE.Vector2(0.42, -0.62),
    new THREE.Vector2(0.48, -0.18),
    new THREE.Vector2(0.56, 0.26),
    new THREE.Vector2(0.5, 0.62),
    new THREE.Vector2(0.34, 0.86),
    new THREE.Vector2(0.14, 0.98)
  ]
  return new THREE.LatheGeometry(points, 36)
}

function createLimbGeometry() {
  const points = [
    new THREE.Vector2(0.08, -0.9),
    new THREE.Vector2(0.13, -0.62),
    new THREE.Vector2(0.18, -0.14),
    new THREE.Vector2(0.2, 0.26),
    new THREE.Vector2(0.16, 0.68),
    new THREE.Vector2(0.1, 0.9)
  ]
  return new THREE.LatheGeometry(points, 28)
}

function createFootGeometry() {
  const geometry = new THREE.SphereGeometry(1, 28, 16)
  geometry.scale(1.2, 0.32, 1.85)
  geometry.translate(0, 0, 0.22)
  return geometry
}

function createAreaOutline(geometry: THREE.BufferGeometry) {
  const edgeGeometry = new THREE.EdgesGeometry(geometry, 24)
  const material = new THREE.LineBasicMaterial({
    color: 0x6b7f8e,
    transparent: true,
    opacity: 0.86
  })
  const outline = new THREE.LineSegments(edgeGeometry, material)
  outline.renderOrder = 2
  return outline
}

function updateMaterials() {
  const ids = selectedIds.value
  for (const mesh of clickableMeshes) {
    const material = mesh.material as THREE.MeshStandardMaterial
    const selected = ids.has(mesh.userData.areaId)
    const hovered = hoveredPart.value === mesh.userData.areaId
    material.color.setHex(selected ? 0x38bdf8 : hovered ? 0x2f4c5d : 0x24313c)
    material.emissive.setHex(selected ? 0x0e7490 : hovered ? 0x062f3f : 0x000000)
    material.emissiveIntensity = selected ? 0.58 : hovered ? 0.22 : 0
    const outline = mesh.userData.outline as THREE.LineSegments | undefined
    if (outline) {
      const outlineMaterial = outline.material as THREE.LineBasicMaterial
      outlineMaterial.color.setHex(selected ? 0x67e8f9 : hovered ? 0x7dd3fc : 0x6b7f8e)
      outlineMaterial.opacity = selected ? 1 : hovered ? 0.98 : 0.72
      outlineMaterial.linewidth = selected ? 2 : 1
    }
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
watch(activeModel, () => {
  if (!bodyGroup) return
  buildBody()
})

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
        <div class="body-model-tabs" role="tablist" aria-label="인체 모델 범위">
          <button
            v-for="model in bodyModelOptions"
            :key="model.id"
            type="button"
            role="tab"
            :aria-selected="activeModel === model.id"
            :class="{ active: activeModel === model.id }"
            @click="setActiveModel(model.id)"
          >
            <span>{{ model.label }}</span>
            <small>{{ model.description }}</small>
          </button>
        </div>

        <div class="body-view-toolbar body-view-toolbar-3d">
          <button type="button" aria-label="왼쪽으로 회전" @click="rotateBy(-Math.PI / 2)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div class="body-view-status">
            <strong>{{ activeModelLabel }} · {{ viewLabel }}</strong>
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
          <div class="body-view-label">{{ activeModelLabel }} · {{ viewLabel }} · 드래그 회전</div>
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
