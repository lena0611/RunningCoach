<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RunLog } from '@/entities/run/model'
import { useSessionDetailStore } from '@/app/stores/sessionDetailStore'
import { useRunStore } from '@/app/stores/runStore'
import { useCoachStore } from '@/app/stores/coachStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useToastStore } from '@/app/stores/toastStore'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { hasNativeBridge } from '@/shared/lib/runtime'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'
import { formatDateWithWeekday } from '@/shared/lib/format'
import { friendlyErrorMessage } from '@/shared/lib/friendlyError'
import StackPage from '@/shared/ui/StackPage.vue'
import RunDetailContent from '@/shared/ui/RunDetailContent.vue'
import RunForm from '@/shared/ui/RunForm.vue'

/**
 * App 레벨 세션 상세 오버레이(#275 후속, 코치 오버레이 패턴). 상세 보기 + 편집(RunForm) + 삭제를 한곳에 모은다.
 * 어느 탭/알림에서든 sessionDetailStore.open(run) 으로 열리고, 닫으면 라우팅 없이 원래 탭으로 복귀한다.
 */
const sessionDetailStore = useSessionDetailStore()
const runStore = useRunStore()
const coachStore = useCoachStore()
const memoryStore = useMemoryStore()
const toastStore = useToastStore()
const healthKitSyncStore = useHealthKitSyncStore()

const detailRun = computed(() => sessionDetailStore.activeRun)

const editing = ref<RunLog | null>(null)
const editSnapshot = ref('')
const saving = ref(false)
const deletingId = ref<string | null>(null)
const pendingDeleteRun = ref<RunLog | null>(null)
const error = ref('')

const isEditDirty = computed(() => Boolean(editing.value) && JSON.stringify(editing.value) !== editSnapshot.value)

const deleteSheetDrag = useBottomSheetDrag(() => {
  pendingDeleteRun.value = null
})

function closeDetail() {
  // 편집/오류 잔류 없이 상세를 닫는다(어느 탭에서 열었든 그 탭으로 복귀).
  editing.value = null
  editSnapshot.value = ''
  error.value = ''
  sessionDetailStore.close()
}

function canRefreshFromHealthKit(_run: RunLog) {
  return hasNativeBridge()
}

function startEdit(run: RunLog) {
  error.value = ''
  editing.value = JSON.parse(JSON.stringify(run))
  editSnapshot.value = JSON.stringify(editing.value)
}

function parseRunSnapshot(value: string): RunLog | null {
  try {
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

async function saveEdit() {
  if (!editing.value || !isEditDirty.value) return
  saving.value = true
  error.value = ''
  try {
    const original = parseRunSnapshot(editSnapshot.value)
    if (original && original.type !== editing.value.type) {
      editing.value.tags = Array.from(new Set([...(editing.value.tags ?? []).filter((tag) => tag !== 'type:auto'), 'type:user']))
    }
    const updated = await runStore.updateRun(editing.value)
    // 상세 패널이 갱신된 런을 보이도록 스토어의 activeRun 을 교체한다.
    if (updated) sessionDetailStore.open(updated)
    editing.value = null
    editSnapshot.value = ''
  } catch (err) {
    error.value = friendlyErrorMessage(err, '수정에 실패했어요. 잠시 후 다시 시도해주세요.')
  } finally {
    saving.value = false
  }
}

function closeEdit() {
  editing.value = null
  editSnapshot.value = ''
}

function askRemove(run: RunLog) {
  pendingDeleteRun.value = run
}

async function confirmRemove() {
  if (!pendingDeleteRun.value) return
  const run = pendingDeleteRun.value
  deletingId.value = run.id
  error.value = ''
  try {
    await runStore.deleteRun(run.id)
    // 삭제한 세션 관련 패널을 모두 닫고(상세/편집/코치), 오버레이를 열었던 탭으로 자연 복귀한다(강제 라우팅 없음).
    editing.value = null
    editSnapshot.value = ''
    if (coachStore.activeRun?.id === run.id) coachStore.close()
    pendingDeleteRun.value = null
    sessionDetailStore.close()
    toastStore.success('삭제되었습니다.')
  } catch (err) {
    error.value = friendlyErrorMessage(err, '삭제하지 못했어요. 잠시 후 다시 시도해주세요.')
    toastStore.error(error.value)
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <!-- 상세 보기 -->
  <StackPage
    :open="!!detailRun"
    title="세션 상세"
    bare
    footer-class="run-detail-cta"
    layer-class="session-overlay-layer"
    @close="closeDetail"
  >
    <RunDetailContent v-if="detailRun" :run="detailRun" :weekly-pattern="memoryStore.memory.weeklyPattern">
      <template #actions>
        <div class="run-detail-actions" aria-label="세션 관리">
          <button
            v-if="canRefreshFromHealthKit(detailRun)"
            class="icon-only-button"
            :class="{ spinning: healthKitSyncStore.refreshingRunId === detailRun.id }"
            type="button"
            :disabled="healthKitSyncStore.refreshingRunId === detailRun.id"
            aria-label="HealthKit 세션 다시 갱신"
            @click.stop="healthKitSyncStore.requestRunRefresh(detailRun)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 11a8 8 0 0 0-14.8-4.2" />
              <path d="M5 3v4h4" />
              <path d="M4 13a8 8 0 0 0 14.8 4.2" />
              <path d="M19 21v-4h-4" />
            </svg>
          </button>
          <button class="icon-only-button" type="button" aria-label="기록 수정" @click.stop="startEdit(detailRun)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4.5 19.5h4.2L18.8 9.4a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4.5 15.3z" />
              <path d="m13.6 6.2 4.2 4.2" />
            </svg>
          </button>
          <button class="icon-only-button danger" type="button" :disabled="deletingId === detailRun.id" aria-label="기록 삭제" @click.stop="askRemove(detailRun)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5.5 7h13" />
              <path d="M9.5 7V5.5h5V7" />
              <path d="m8 9 .6 9.5h6.8L16 9" />
              <path d="M10.5 11.5v4" />
              <path d="M13.5 11.5v4" />
            </svg>
          </button>
        </div>
      </template>
    </RunDetailContent>
    <template #footer>
      <button v-if="detailRun" type="button" :disabled="!isSupabaseConfigured" @click.stop="detailRun && coachStore.open(detailRun)">
        AI 코칭
      </button>
    </template>
  </StackPage>

  <!-- 편집 -->
  <StackPage :open="!!editing" title="기록 수정" :back="Boolean(detailRun)" layer-class="session-edit-layer" @close="closeEdit">
    <template v-if="editing">
      <RunForm v-model="editing" />
      <p v-if="error" class="error">{{ error }}</p>
      <button class="danger full" type="button" @click="askRemove(editing)">이 기록 삭제</button>
    </template>
    <template #footer>
      <button type="button" :disabled="saving || !isEditDirty" @click="saveEdit">{{ saving ? '저장 중' : isEditDirty ? '변경사항 저장' : '저장됨' }}</button>
    </template>
  </StackPage>

  <!-- 삭제 확인 -->
  <Teleport to="body">
    <Transition name="bottom-sheet">
    <div v-if="pendingDeleteRun" class="bottom-sheet-layer confirm-layer" role="presentation" @click.self="pendingDeleteRun = null">
      <section class="bottom-sheet confirm-sheet" :class="{ 'bottom-sheet-dragging': deleteSheetDrag.dragging.value }" :style="deleteSheetDrag.sheetStyle.value" role="dialog" aria-modal="true" aria-label="삭제 확인">
        <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="deleteSheetDrag.startDrag" />
        <h2>러닝 기록을 삭제할까요?</h2>
        <p>{{ formatDateWithWeekday(pendingDeleteRun.date) }} · {{ pendingDeleteRun.distanceKm }}km 기록이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
        <div class="confirm-actions">
          <button class="danger" type="button" :disabled="deletingId === pendingDeleteRun.id" @click="confirmRemove">
            {{ deletingId === pendingDeleteRun.id ? '삭제 중' : '삭제' }}
          </button>
          <button class="ghost" type="button" :disabled="Boolean(deletingId)" @click="pendingDeleteRun = null">취소</button>
        </div>
      </section>
    </div>
    </Transition>
  </Teleport>
</template>
