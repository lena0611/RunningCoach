import { defineStore } from 'pinia'
import type { RunType } from '@/entities/run/model'
import type { SessionBriefing } from '@/shared/lib/coaching/sessionBriefing'

/**
 * 오늘 훈련 브리핑 쇼츠 팝업(#898). 앱 인트로 뒤 **하루 한 번** 뜨는 App 레벨 오버레이.
 *
 * 오늘 세션·브리핑은 요약 탭(DashboardPage)이 이미 계산하는 값을 그대로 받아 둔다(`publishToday`) —
 * 팝업이 따로 계산하면 화면과 어긋날 수 있다(#795 두 번째 진실). "아직 안 뛰었다"도 요약 탭의 날짜 상태
 * (`today` = 오늘 planned 세션 + 오늘 훈련 런 없음)를 그대로 쓴다.
 */
export type TodayBriefingPayload = {
  date: string
  /** 요약 탭 데이-스트립의 오늘 상태. 'today' 일 때만 팝업 대상이다. 코치 탭에서 다시 볼 땐 그날 상태('today'·'future') */
  dayState: string
  /** 여는 말·제목의 '언제'(오늘·내일·목요일). 없으면 오늘 — 코치 탭에서 다른 날을 다시 볼 때만 채운다 */
  when?: string
  sessionType: RunType
  title: string
  distanceKm: number | null
  /** 페이스 범위 또는 "약 N분" */
  metaLine: string
  briefing: SessionBriefing
  /** 활성 목표(쇼츠 프로필 줄의 D-day·해시태그). 없으면 null */
  goal: { title: string; targetDate: string | null } | null
}

const SHOWN_KEY_PREFIX = 'pacelab:briefing-shorts:shown:'

function readShownDate(userId: string): string | null {
  try {
    return window.localStorage.getItem(SHOWN_KEY_PREFIX + userId)
  } catch {
    return null
  }
}

export const useBriefingShortsStore = defineStore('briefingShorts', {
  state: () => ({
    /** 요약 탭이 계산을 끝낸 오늘 값. 스케줄이 아직 정착 중이면 null. */
    today: null as TodayBriefingPayload | null,
    /** 요약 탭이 오늘 판정을 끝냈나(스케줄·런·메모리 로드 완료). today 가 null 이어도 true 면 "오늘 브리핑 없음"이 확정. */
    todaySettled: false,
    open: false,
    /** 코치 탭 '영상으로 보기'가 맡긴 그날 값. 호스트가 받아 팝업을 띄우고 비운다(하루 한 번 규칙과 무관) */
    replayRequest: null as TodayBriefingPayload | null
  }),
  actions: {
    replay(payload: TodayBriefingPayload) {
      this.replayRequest = payload
    },
    publishToday(payload: TodayBriefingPayload | null, settled: boolean) {
      this.today = payload
      this.todaySettled = settled
    },
    wasShownToday(userId: string, date: string): boolean {
      return readShownDate(userId) === date
    },
    markShown(userId: string, date: string) {
      try {
        window.localStorage.setItem(SHOWN_KEY_PREFIX + userId, date)
      } catch {
        // 저장이 막힌 환경이면 다음 실행에 한 번 더 뜰 뿐이다.
      }
    }
  }
})
