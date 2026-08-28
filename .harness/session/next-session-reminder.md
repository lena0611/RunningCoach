# 다음 세션 리마인더

새 세션에서 바로 이어받기 위한 소비자 프로젝트 전용 **부트스트랩 메모**입니다.
운영 규칙 본문은 여기서 중복하지 않습니다. 최신 기준은 `active-context.md`,
`project-memory.md`, `.harness/project/workflow-rules.md`, `decision-log.md`를 우선합니다.
> 상세 인수인계가 있으면 프로젝트 루트 `HANDOFF.md`를 먼저 본다.

## ⭐ 현재 위치 (2026-08-28) — 날씨 코칭 3단계 중 1·2단계 + 워치 본훈련 1차

### 오늘 출하 (전부 머지·배포·검증)
- **#712 날씨 코칭 SSOT 적재** — 코치 SSOT 에 더위·습도가 **한 줄**뿐이었다("맥락을 같이 본다",
  수치·기전·규칙 없음). dossier(`research/weather-coaching-evidence.md`) + §외부 조건 코칭 신설.
  **"확정된 것"만 규칙화**하고 불확실·근거없음은 금지 목록으로.
  ⚠ 같은 PR 에서 **SSOT↔런타임 충돌**을 발견·수정 — `runningWeather.ts` 가 스스로를 "안전 판단의
  단일 출처"라 선언하고 체감 28℃ 를 사실상 안전 밴드로, 그 외를 "러닝하기 무난"으로 **보증**하고
  있었다(내가 방금 금지한 그것). advisory 로 성격 재정의 + 가드 테스트.
- **#713 사후 평가에 날씨 반영(v166)** — 사용자가 처음 꺼낸 "여름 심박 답답함"의 실제 해결.
  `weatherStress.ts` + `LSD_STRAIN_DRIFT=12` 를 더운 날 **단독 실패 근거로 안 씀**,
  Easy 상한 초과만으로 실패 안 시킴. **⚠ 날씨는 면죄부가 아니다** — RPE 높거나(LSD5+/Easy6+)
  후반 페이스 붕괴(20s/km+)면 실패 유지. 서늘한 날 회귀 4건으로 잠금. 라이브 확인됨.
- **#715 한 답변 안 세션 타입 어긋남(v167)** — "목요일 템포"(어제 기억) + "목요일은 Easy"(실제
  플랜)가 한 답변에 공존. #695 는 "네/맞아요" **직답**만 막아서 **서술** 경로가 샜다.
  지침 3건: 스레드 기억 ≠ 현재 사실 / 한 답변 안 같은 날짜는 타입 일치 / 이미 그 타입이면 "낮추자" 금지.
- **#703 ① 반복 하향 → 루틴 승격(v168)** — **마이그레이션 불필요였다**(전날 추정 과대).
  `더 쉽게`가 (superseded 원본, manual 대체) 쌍을 남기므로 도출 가능 — `CoachPage.activeOriginal`
  이 이미 같은 방식을 쓰고 있었다. 승격 임계도 발명 안 함: SSOT §루틴 변경 기준의 **"2주 이상"**
  + **서로 다른 주에 걸쳐야** 승격(한 주 혼잡은 §주말 트리아지가 이미 "루틴 변경 아님"으로 못박음).
- **#711 워치 본훈련 1차 (PR#717)** — 세션·의도·조건보정·실행 타임라인·가드를 워치로.
  `sessionTimeline.ts`(처방 → "지금부터 18초 스트라이드, 1회차") · `watchTrainingPayload.ts` ·
  네이티브 브리지(pushTraining) · 워치 수신/영속/요약 UI.

### 이 영역 함정 (갱신)
- **SSOT 쓰기 전에 런타임을 감사한다.** #712 에서 문서만 쓰고 기존 코드를 안 봐서 자기모순을
  만들었다([[audit-existing-domain-before-new-logic]] 위반).
- **네이티브는 parse 말고 build 로 검증한다.** `swiftc -parse` 4파일 통과했는데 xcodebuild 에서
  `extensions must not contain stored properties` 가 났다. [[native-verify-with-build-not-parse]]
  ✅ `xcode-select` 를 Xcode 로 전환해둠 — 이제 에이전트가 xcodebuild 가능.
- **shared → entities 역방향 래칫(#397)** 에 신규 모듈이 두 번 걸렸다. `RunType` import 대신
  구조적 타입으로 받는다. 베이스라인 올리지 말 것.
- **WBGT 는 못 쓴다.** 기상청 API허브에 완제품 없음(생활기상지수=자외선·대기정체). 2026 간이
  WBGT 는 **기후변화 상황지도용 기후통계**라 실시간 판정 불가. 일사(천리안2A 10/30분 · 수치모델
  3시간 예보)는 있다. **안전 밴드는 3단계 게이트** — 현재 1단계.

### 남은 것
- **#711 잔여**: 러닝 중 **구간 발화 실행부**(타임라인을 시계로 돌리며 발화) · 심박 warning 배선 ·
  **실기기 검증**(회사망 DDI 차단 → 개인 맥+집 와이파이). 빌드는 통과, 실렌더는 미확인.
  ↳ 같이 처리: `WatchSpeech.swift:55` 경고 1건 — `session.activate` 완료 콜백의 `[weak self]` 를
  안쪽 `Task { @MainActor }` 에서 꺼내 쓴다("Reference to captured var 'self' in concurrently-
  executing code"). **지금은 경고지만 Swift 6 모드에선 에러.** 기존 빚이고 동작엔 이상 없음.
  TTS 는 실기기에서만 제대로 검증되니(에어팟 라우팅·ducking·발화 타이밍) 실기기 회차에 함께 고친다.
- **날씨 2단계**: 검증된 WBGT 산출 파이프라인(Liljegren·provenance·시간정렬·결측정책·reference 검증)
  → 그 뒤에야 3단계 JSPO 밴드 승격.
- #693 churn 관측 · #652 PR3(근거 없음으로 내림, 실패 로그 축적 시 재판단)

---

## (이전) ⭐ 현재 위치 (2026-08-26) — #703 관용 게이트 4라운드 QA 완주 + 부상 폼 UX

### 출하 (전부 머지·배포·라이브 검증, coach-run v161→v165 + 웹 2회)
- **#701 분류 확장(v161)**: "화요일 본런이 너무 길게" 류가 general 로 새서 코치가 스케줄을 못 보던 문제.
  `mentionsOwnPlannedSession`(요일·본런/웜업·배정/예정·"내말은"). 개념 질문은 general 유지.
- **#703 G10 관용 게이트(v161→165, 4라운드 라이브 QA로 조율)**:
  ① `easeAxis` 필수 + 세션 타입별 관용 매트릭스(SSOT §세션 변경 요청, PR#704)
  ② Easy 계열은 duration 도 관용(거리=시간, 같은 dose 손잡이) — LSD·Tempo 만 시간=본체로 차단
  ③ **강도 하향은 안전 맥락**(활성부상∨12개월 이력∨휴식)**에서만** — 복귀기 "Tempo→Easy"는 #695 가
    요구하는 코치 조치라 막으면 안 됐다(무맥락 편의 하향만 차단). Race 는 맥락 있어도 강등 불가
  ④ **G11**: 발화가 요일 하나를 지목하면 카드도 그 요일(실측: "목요일"에 화요일 카드 나감)
  최종 확인: 카드 렌더+축 라벨("스트라이드 줄이기") 사용자 확인 ✅
- **관측 2종(#699 확장)**: `data_query_log.proposal`={emitted,kept,drop,축,날짜} — "카드 안 뜸"이
  추측이 아니라 조회가 됨. 이번 QA 4라운드가 전부 이 로그로 원인 특정됨(#642 임시코드의 영구화).
- **부상 폼 UX(웹, PR#710)**: 생성 무반응=항목명 빈값 조용한 return → 토스트. 선택 입력 5종
  `<details>` 접기. ⚠ **닫힌 details 내부도 rect/offsetParent 값이 나온다** — JS 접힘 판정 금지(오판 2회),
  스크린샷/.open 으로.

### 이 영역 함정 (갱신)
- **하향 게이트는 안전/편의를 갈라야 한다** — 일괄 차단하면 정당한 복귀 코칭을 죽여 "말로만 낮추기"를
  게이트가 만든다. 판정 축: 부상·복귀 맥락 유무.
- **모델은 본문과 다른 축을 카드로 낼 수 있다**(본문 "스트라이드 줄이자"+카드 duration 실측) —
  일치 지침 + 게이트 이중.
- 반복 하향→루틴 승격은 **미구현**(#703 잔여, 승인 추적 선행 필요).
- 되묻기(불명확 시 1문항)는 **오염 스레드에선 판정 불가** — 새 스레드 모호 발화로 재검 남음.

### 남은 것
- #703 잔여: 반복 하향→루틴 승격 · 되묻기 새 스레드 검증
- #699 라이브 확인(데이터 질문 1건의 data_query_log 조회) — proposal 관측은 이미 라이브 검증됨
- gap 로깅의 실사용 관측 축적 → #652 PR3 재판단(현재 "근거 없음")
- 사용자 부상 재발 처리: 새 항목 생성 대신 **기존 resolved 항목 상태 되돌리기** 권고함(이력 연속성)

---

## (이전) ⭐ 현재 위치 (2026-08-24) — 코치 대화 잔여업무 정리 + #697 출하

### 오늘 출하 (머지·배포 v158·라이브 QA 통과)
- **#697 대화로 부상 상태를 바꿀 수 없던 구조적 차단** (PR #698). 8/22 실사용에서 사용자가
  "발바닥 해제해줘"를 **1분 안에 3번** 반복 — 안 먹혀서 다시 친 것. **두 겹**이었다.
  ① `buildFreeConversationInstructions` 가 `injuryUpdateProposal` 을 `trainingMemoryPatch` 와 묶어
  **강제 null**. 사용자 입력 턴은 거의 전부 `conversational` 이라 부상 상태를 대화로 바꾸는 경로가
  통째로 닫혀 있었다. SSOT(domain-rules §164 · ai-coaching-goal §378)가 규정한 **유일한 합법 경로**다.
  ② `detectUserNoteRunRelevance` 가 `통증|아파|발바닥|부상|회복` 만 받아 "이제 다 나았어",
  "족저근막염 다 나았어 해제해줘", "무릎 이제 0이야" 가 전부 general → 부상 컨텍스트 미전달.
  `normalizeInjuryUpdateProposal` 은 `activeInjuryItem` 없으면 제안을 폐기하므로 **①만 고쳐도 실패**.
  → `hasStructuredContext` 분기 + `mentionsInjuryStateChange` 신설(부위명은 단독 불가, 상태 신호 동반 시만).
  라이브: "이제 발바닥 다 나았어" → **승인 카드 표시 ✅**(승인 확정은 실데이터라 미실행).

### 📌 코치 대화 영역 결론 재정렬 (#652 코멘트에 적재)
- **`coach_data_gaps` 가 19일간 0건**이었다. 기록 경로 5곳이 전부 **모델이 도구를 먼저 불러야** 작동해서,
  모델이 도구 없이 숫자 없이 깔끔하게 거절하면 어디에도 안 걸린다 → **정직하게 거절할수록 기록이 안 남는다.**
  스스로 정한 원칙([[coach-always-on-block-deterministic]]) 위반.
- 대신 `coach_reports.user_note` 61건을 분류했다. **커밋 타임라인과 대조해 QA 를 걷어내는 게 핵심**
  (~40건이 에이전트 QA였다). [[separate-agent-qa-from-organic-usage]]
- **실사용 21건 중 순수 데이터 질문 1건.** 부상·컨디션 보고 8 / 스케줄 확인·이견 8 / 디브리핑 4.
  → **#652 PR3(필드·지표 확장)는 "보류"가 아니라 "근거 없음"으로 내렸다.** 구간화·상관·분포는
  QA 가 만든 수요였다.
- 사용자는 데이터를 캐묻지 않고 **자기 상태를 말하고 코치가 반응해주길** 원한다
  ([[coach-proactive-communication-vision]] 와 정합, 유료화 축을 "데이터 질문"으로 잡은 것과는 어긋남 —
  과금 경계 확정 전 재검토 값 있음).

### 다음 후보 (미착수·이슈 없음)
1. **gap 로깅 결정론화** — 실패를 기록하려 말고 **데이터 질문이면 무조건 1행**(발화·도구 호출 여부·
   spec·matched_runs) 남기고 gap 은 사후 조회로 도출. 별도 테이블 없이 `coach_reports` 컬럼으로 충분한지 검토.
   안 하면 이 분석을 매번 손으로 해야 한다. **사용자에게 이슈화 여부 물어둔 상태.**
2. **`ungrounded_claim` 차단 승격 보류** — 4건 중 1건이 `"응 해줘"`(승낙 발화)에 걸렸다.
   8/04 측정 오탐 0/200 이 라이브에서 성립하지 않는다는 신호.
3. **#693 churn** — #692·#694 배포 후 관측 계획 유지.

### 이 영역 함정 (다시 손대기 전 필독)
- **모드·분류·게이트에 기능 가용성을 걸지 않는다.** 같은 사고 3번(#642 세션액션 · #690 벤치마크 ·
  #697 부상 제안). 전부 타입·유닛에 안 걸리고 배포 후 실사용에서야 드러났다.
  → `architecture-rules.md` 승격 + `tests/coachConversationalProposalGate.test.ts` 소스 가드.
- 지침 빌더를 여러 모드가 공유하면 **어느 경로로 들어왔는지 인자로 갈라라**(#697 ③).
- Supabase 조회는 **앱 인증 컨텍스트가 1차 경로**(workflow-rules.md). 직접 DB 접속은 하네스가 막는다 —
  DEV 콘솔에서 `await import('/src/shared/api/supabase.ts')` 로 모듈을 불러 쓴다(`window.supabase` 없음,
  `copy()` 는 top-level await 섞이면 사라짐 → Blob 다운로드가 편하다).

### ⚠️ 남은 수동 작업 1건 (이전 세션에서 이월 — 아직 안 함)
```
DEV 콘솔에서: await window.__pacelabE2E.cleanupReturnRamp()
```
7/04 E2E 시드가 남긴 고아 스케줄 229행 정리. 화면엔 영향 없지만 **DB 조회를 오도한다.**

---

## (이전) ⭐ 현재 위치 (2026-08-18 심야) — 코치 대화 품질 3건 + 실계정 데이터 누수 정리

### 오늘 밤 출하 (전부 머지·배포·라이브 검증)
- **#695 코치가 스케줄 질문에 옛 루틴 메모로 답하던 문제 + 조언↔플랜 어긋남 방치.**
  사용자 신고("대화가 어색해") → 대화 5턴을 실데이터와 대조해 확인.
  ① "내 스케줄이 그렇게 되어 있나"(존2 복귀 반영됐나)에 **"네"** 라고 답하며 `weeklyPattern`(옛 루틴 메모)
  골격(화 Easy+Strides·목 Tempo·토 LSD)을 나열 — 실제는 목=Easy·Tempo는 다음 주. 기존 방어는
  "## 다음 훈련" 섹션에만 걸려 **직접 질문을 안 덮었다.**
  ② "존2만" 조언과 플랜(Tempo·LSD·Strides)이 어긋난 채 `ease_session` 제안을 한 번도 안 냈다.
  → 사실 출처를 `upcomingSchedule` 하나로 못박고, "네/맞아요" 전에 대조, 2번 되짚으면 앞선 답이
  틀린 신호로 읽게, 조언↔플랜 어긋나면 그 날짜로 `ease_session` 제안. `upcomingSchedule` 3→5.
- **#696 E2E 시드가 스케줄 행을 남겨 실계정에 고아 목표 229행이 축적**됐다(`e2e-race-10k`, 7/04).
  `cleanupReturnRamp` 가 메모리의 목표만 지우고 스케줄 행은 남겼고, 목표가 사라진 뒤엔 `hasSeed=false`
  로 즉시 반환해 **영원히 정리 못 하는 상태**였다. `deleteSessionsByGoal`(정확 일치만) 추가 + cleanup 이
  hasSeed 무관하게 먼저 정리(멱등).

### ⚠️ 남은 수동 작업 1건 (내가 못 함 — 하네스가 실데이터 파괴를 차단)
```
DEV 콘솔에서: await window.__pacelabE2E.cleanupReturnRamp()
```
기존 고아 229행을 지운다. 백업(전체 컬럼)은 세션 scratchpad `e2e-orphan-backup.json`.
안 지워도 화면엔 영향 없지만 **DB 조회를 오도한다** — 이 때문에 오늘 churn 진단을 두 번 오판했다.

### 오늘 낮 출하 (참고)
#689 코치 벤치마크 비교 · #690/#691 그 후속(문구 분류에 데이터 가용성 걸지 말 것 · 불가 사유 3종 ·
이력 오염 내성) · #692 앵커 공백 오염(처방 0.9km 붕괴) · #694 앵커 교착(고친 게 안 먹던 원인).
최종 확인: 처방 0.9km → 4.1km, 사용자가 실제로 **4.22km 완주**.

### 미해결 — #693 (관측 후 착수)
재생성 churn. **본문 수치는 코멘트로 정정했다** — "하루 21행·날짜당 중복"은 고아 목표를 섞어 센 값이고,
실 목표는 56일 전부 날짜당 1개·중복 0건. 여전히 유효한 것은 ① 같은 날짜 superseded 19행 누적
② 8·16분 간격 한 세션 내 중복 재생성 ③ **구 번들이 새 처방을 되돌림**(Pages `index.html` max-age=600).
#692·#694 배포 효과를 며칠 보고 범위 확정.

### 이 영역 함정 (다시 손대기 전 필독)
- 파생 플랜 앵커에 **자기 산출물을 먹이면 붕괴**한다. 재빌드하는 **모든 경로**가 앵커를 영속해야 한다.
  계산식 변경엔 **버전 게이트**. "처방 볼륨 vs 앵커" 비교는 금지. [[derived-plan-collapse-and-anchor-deadlock]]
- **문구 분류에 데이터 가용성을 걸지 않는다**(오분류 손실이 비대칭).
- 코치 사실 출처: 스케줄=`upcomingSchedule`, 수치=`queryRuns`. 저장된 텍스트(weeklyPattern·템플릿)로
  현재 상태를 말하면 안 된다. [[coach-conversation-schedule-proposal-639]]
- 검증은 **DB `created_at` 타임라인** + 요청 본문 가로채기 + `supabase functions download`.
  추측 수정 반복 금지. 새 코치 기능은 **실패 이력 쌓인 방에서 사용자 실제 문구로**.
  [[verify-new-capability-in-polluted-thread]]

---

## (이전) 2026-08-18 낮 — 코치 벤치마크 + 처방 붕괴 수정

### 오늘 출하 (전부 머지·배포·라이브 검증)
- **#689 코치 벤치마크 비교** — 대회 완주자 분포 속 내 위치를 채팅 코치에 주입. 대시보드와 같은 함수(`compareProjectionToRaceBenchmarks`), 국내 우선·성별 세그먼트·3항목(716B). "완주자 분포 ≠ 인구 평균"·"나이대 없음" 문구를 **페이로드에 코드가 실어** 보낸다(dataGap 방식).
- **#690/#691 그 후속 결함 2건** — ① 페이로드를 `structuredCoachContext` 로 가렸더니 정작 비교 질문이 general 로 분류돼 빠졌다 → **문구 분류에 데이터 가용성을 걸지 않는다**(restState 와 같은 이유). ② 불가 사유를 맨 null 로 보내니 코치가 이유를 지어냈다("대회명을 알려주면") → 사유 3종(no_goal·not_enough_runs·distance_not_covered) + 응대 지침을 코드가 판정해 보낸다. ③ 스레드에 "못 한다" 옛 답변이 쌓이면 데이터가 있어도 반복 → **"과거 답변보다 이번 턴 컨텍스트 우선"** 규칙을 `buildCoachThreadInstruction` 에 추가(모든 기능 공통).
- **#692 처방 붕괴(축소 나선)** — 주간 볼륨 앵커가 `최근30일×7/30` 하나라 한 달 휴식의 공백이 평균을 끌어내려 Easy 0.9km·LSD 1.4km 까지 무너졌다. `returnAnchor.ts` 신설(최근 감당 볼륨 vs 공백 직전×디트레이닝 계수 중 큰 쪽). SSOT §휴식과 복귀에 규칙 적재.
- **#694 앵커 교착** — 복귀 램프 자연만료 경로가 앵커를 안 남기고 자신을 잠가, 두 재정렬 트리거가 동시에 죽어 옛 플랜이 영구 고착됐다. 램프 경로도 앵커 영속 + **앵커 로직 버전 게이트**(고착 자가치유). 최종 확인: 폰 화면 **0.9km → 4.1km**.

### 미해결 — #693 (다음 후보)
재생성 churn: `training_schedule` 이 **하루 21행**, 8~16분 간격 중복 재생성. 그리고 **구 번들 클라이언트가 새 처방을 되돌린다**(Pages `index.html` max-age=600 → 배포 직후 10분 창. 실측 4.1km→0.9km 클로버). 조치 후보=행 정리·발동 원인 관측·디바운스·**클라이언트 로직 버전 가드**·no-cache 검토. **앵커 안정(#692) 효과를 며칠 관측한 뒤 범위 확정**하기로 이슈에 적어둠.

### 이 영역 함정 (다시 손대기 전 필독)
- 파생 플랜 앵커에 **자기 산출물의 결과를 먹이면 붕괴**한다. [[derived-plan-collapse-and-anchor-deadlock]]
- 플랜을 (재)빌드하는 **모든 경로**가 앵커를 영속해야 한다 — 한 분기만 빼도 교착.
- 고착 탐지에 **"처방 볼륨 vs 앵커" 비교 금지**(주기화는 정당히 ±25% 벗어나 매 부팅 재정렬 발동).
- 검증은 **DB `created_at` 타임라인**으로. 배포 코드는 `supabase functions download`, 클라이언트 계산은 요청 본문 가로채기. 추측 수정 반복 금지.
- 새 코치 기능은 **실패 이력이 쌓인 방에서, 사용자가 실제로 친 문구로** 검증한다. [[verify-new-capability-in-polluted-thread]]

### 직전 작업 (2026-08-14 완료)
부상 부위 선택기를 인체 렌더 PNG + SVG 영역으로 재작성(#688). 좌표는 알파 마스크에서 추출 — **그림을 교체하면 좌표를 다시 추출**한다. PNG 는 반드시 `<svg>` 안 `<image>`(viewBox 공유).

---

## (이전) 2026-08-14 — 부상 부위 선택기 PNG 재작성

### 무엇을 고쳤나
`부상/주의사항 편집`의 `InjuryBodySelector`. 기존 구현의 결함:
- PNG 스틸컷 24장 + **별도 사각 hit-zone** → 이미지가 `object-fit: contain`으로 레터박싱되는 만큼 **터치 좌표가 밀림**(종횡비가 다른 상체 모델에서 특히 크게)
- 프레임 자체가 깨짐(`lower-270`은 발이 몸에서 분리, `upper-0`은 정작 허리·골반이 프레임 밖)
- 각도 9컷(0~360°)+화살표+드래그 3중 중복, 0°와 360°는 같은 화면
- 3D로 고르면 4탭(그룹→각도→영역→후보)인데 아래에 같은 부위 칩 24개가 또 있어 완전 중복

### 어떻게 바꿨나
- **인체 렌더 PNG 1장(앞/뒤/발바닥 시트) + SVG 부위 도형.** PNG를 **같은 `<svg>` 안 `<image>`** 로 넣어 viewBox 공유 → 좌표 밀림이 원천적으로 불가능
- 부위 도형은 기본 투명(`pointer-events: all`), 선택 시 반투명 초록으로 덮어 근육 음영이 비침
- **도형 좌표는 PNG 알파 마스크에서 추출**(행마다 실루엣 경계 → 폴리곤). 좌우도 미러가 아니라 각각 실측
- 뷰 3개(앞/뒤/발바닥), 누르면 바로 선택/해제, 선택 칩, `이름으로 찾기` 접힘 폴백, 부위별 통증 슬라이더
- viewBox는 뷰마다 다름(전신 200×480, 발바닥 200×300) → SVG `<text>` 라벨 크기는 CSS 아닌 뷰별 속성으로

### 파일
- `src/shared/ui/injuryBodyMap.ts`(신규, 좌표 SSOT) · `injuryBodyMap.test.ts`(카탈로그 21부위 전수 대응 4건)
- `src/shared/assets/body-models/body-sheet.png`(587KB, 알파 유지) — 옛 프레임 24장(2.4MB) 삭제
- `InjuryBodySelector.vue` · `styles.css` · `injuryAreas.ts`(`injuryStructureLabels` 추가로 joint/muscle 영어 노출 제거)
- 계약 문서 갱신: `ui-system-contract.md`(부상 선택 UI 절 전면) · `ui-guidelines.md`

### 다시 손댈 때 주의
- **그림을 교체하면 좌표를 다시 추출한다.** 눈으로 맞추지 말 것 — 알파 마스크에서 뽑는다
- PNG를 `<img>`나 CSS background로 옮기면 옛 좌표 밀림 버그가 그대로 재발한다
- 붙여넣은 이미지로는 투명 여부를 알 수 없다(합성돼 보임). 파일을 받아 canvas 픽셀로 측정한다 — `file://`은 canvas tainted라 로컬 HTTP 필요. [[image-gen-no-alpha-use-chromakey]]

---

## (이전) 2026-06-25 후반 — 감별 §5 정밀화 2건 출하: 답변 likelihood 그라데이션(#522) + monitoring 노출 게이트(#525)
- **이번 세션 완료(PR #526 머지·트리검증 IDENTICAL, Issue #522·#525 CLOSED):** 부상 감별(§5) 두 증분, 한 PR(squash) — 둘 다 #전문코치리뷰 PASS(must-fix 0).
  - **증분2.1 #522 — 답변 likelihood 그라데이션**: flat +1.5 부스트를 **옵션별 `favorWeight`(0~1)**로 그라데이션. 부스트 = `PROBE_FAVOR_BOOST × favorWeight`. 11개 `favors` 옵션 저작(§1 특이도: pathognomonic 0.9=ITBS '늘 같은 거리'·족저 '아침 첫발'·sprint-pop / 특징적 0.8 / 미특이 0.75=가자미근). `favoredHypothesisWeights`(같은 가설 다수답=max). 미설정 fallback **0.5(보수적 fail-safe**, evaluateRedFlags 철학 정렬 — should-fix 반영). comorbid top-2·§4 redFlag 우선 불변식 보존. 리뷰어 제안 `probeWeights[axis]`는 axis↔키 불일치로 오작동 → per-option 모델로 확장.
  - **#3 #525 — monitoring 프로브 노출 게이트**: 감별=급성기(active) 도구 → **"monitoring이면 중단, 재발 시 재개"(사용자 합의)**. `isInjuryProbeEligible`(model.ts): active=항상 / monitoring=`isInjuryReflaring`(최근14일 flare·악화 체크인·통증 반등)일 때만 / resolved·archived=안함. DashboardPage 스냅샷 게이트 교체. **안전 미감소**: 게이트는 *프로브*에만 — redFlag 게이트·escalation·이미 모은 자가검사 전송은 독립(코치리뷰 코드 근거 확정). 단발 재발신호=의도(안전망 재개; redFlag 진행성 2회연속과 별개, 주석 명시). 탈출구=악화 체크인 시 App.vue `lastFlareDate` 갱신(영구 갇힘 없음).
  - **검증**: 805 unit(신규 13) + vue-tsc + harness:check(test/build). #전문코치리뷰 PASS×2(#522 4렌즈/#3 3렌즈). **라이브(비파괴·실 계정·실 출하 함수)**: monitoring 게이트 전 분기 + #522 부스트 비율 1.2(=0.9/0.75) + 힌트("🔎가능성 족저근막염·조절 볼륨 동결")·프로브 카드 실렌더.
- **§5 = A+B+C+D+E + 증분2 + 증분2.1(#522) + monitoring 게이트(#525) 출하 완료.** 후속(별도·미착수): **#522 코멘트** 1차/2차 후보 차등(favored가 타가설을 *낮추는* 모델, 현재는 가산-only) · monitoring severity/recency 추가 게이트 · 재발 에피소드 스코프화 · 지면/페이스 데이터 신호(신뢰 베이스라인 확보 시). [[injury-focus-week-2026-06-24]] [[rri-risk-factor-evidence-2026-06]].
- 머지=squash 후 `git diff --quiet <tip> origin/main` 트리검증(--quiet=exit-code 의미있음). 훅 미설치 클론이면 커밋 전 `npm run harness:check` 직접.

## (이전) ⭐ 현재 위치 (2026-06-25) — 감별진단 KB §5 Phase C·E 출하 = §5 전부(A+B+C+D+E) 완료
- **PR #520(Phase C), #518(Phase E), #523(증분2 재가중) 머지:** 능동 코치 모먼트 grill(1문항, `injuryProbes[8]`·§1 결정적 지문 1:1) → `probeAnswers` 누적·아형 해소(`subtypeResolved`)·red-flag 자가검사(`redFlagSelfTest` 배열→evaluateRedFlags). 경계 래칫 #397: 페이지가 `selectNextProbe` precompute→`ctx.painProbe` plain 주입. 증분2(#523): favors에 +1.5 가산(이번 #522가 그라데이션화). [[injury-focus-week-2026-06-24]]

## (이전) ⭐ 현재 위치 (2026-06-24 추가) — 보류 (나) Trends E2E 마무리 + #473 클로즈 확인 (PR #513 머지)
- **이번 턴 완료(머지·트리검증):**
  - **(나) Trends 렌즈 stackpage E2E 수정 (PR #513)**: `goto('/trends')`→`goto('/#/trends')`(해시) **+ lens 행 `.click()`→`domClick`**(좌표 클릭 간섭, 다른 stackpage 테스트와 동일 패턴). goto 이슈에 가려 lens 클릭이 검증된 적 없어 두 번째 버그가 안 드러났던 것 — 라이브 QA로 포착. **안전 비파괴 배치 7개(stackpage 3 + session-detail 4) green**, harness:check 통과. 상세 [[auth-e2e-account-state-and-seed-safety]].
  - **#473 클로즈 확인 = task 정리 완료**: 이미 CLOSED(오늘 01:29), 후속 #501·#502 둘 다 CLOSED, PR #503·#504·#505 전부 MERGED. 열린 Phase 3(풀 휴식모드) 추적 이슈 없음(연기). 잔여 없음.
  - **세션 재생성 OTP 불요 교훈**: qa-storage 만료 시 **라이브 chrome 브라우저(:5175)부터 확인** — 살아 있으면(리프레시 토큰 회전으로 갱신 중, 그게 qa-storage 만료의 근본 원인) 그 localStorage 추출로 OTP 없이 재생성. 이번에도 OTP 불요였음.
- **여전히 보류((가) 나머지 = 6/29 이후):** `rest-return` ×2 + stackpage '다음 훈련' — 부상 휴식(**6/29까지**) 자연 해소 후 **비-휴식 계정에서 조작 0**으로 검증(rest-return은 휴식 변경=파괴적, 휴식 중 금지).

## (이전) ⭐ 현재 위치 (2026-06-24 종료) — 렌더 E2E 커버리지 확장 + 인증 E2E 견고화/시드 안전화 (PR #510·#511 머지)
- **이번 세션 완료(머지·트리검증):**
  - **walk-run 렌더 E2E #501 후속 (PR #510)**: `seedWalkRunReturn`(in-memory·persist 안 함·**인증 불필요**) + `e2e/walk-run-return.spec.ts`. 라우트 스모크 config(`playwright.config.ts`, Supabase OFF·`VITE_E2E_ROUTE_SMOKE`)에서 작전 카드의 걷기-뛰기 5단계 사다리·통증정지·redFlag·severity3 의뢰 렌더 DOM 단언. #501은 그동안 buildSessionBriefing 직접호출로만 검증됐던 렌더 공백을 메움. 인증 불요 스펙(app-smoke·walk-run-return)=기본 config, 인증 필요 스펙=rest config로 testMatch 분리.
  - **인증 E2E 견고화 + 시드 안전화 (PR #511)**: ① 활성 부상 시 뜨는 App 레벨 '부상 상태 체크인' 모달이 클릭을 가로채던 것 → `addInitScript`로 dismiss 플래그(`pacelab.injuryCheckIn.dismissed.*`) 항상-dismissed 억제(비파괴). ② **🚨 `seedReturnRamp`가 `goals:[raceGoal]`로 실 목표를 통째 덮어쓰는 파괴적 시드 → 인증된 실계정에서 돌자 사용자 실 목표 소실 → localStorage 원본 스냅샷으로 복구 완료(손실 0)**. 비파괴화(실 목표 보존)+복구 유틸 `restoreMemoryFromLocalSnapshot` 추가. 상세 [[auth-e2e-account-state-and-seed-safety]].
  - ✅ **검증**: `session-detail-overlay` 4/4, `stackpage-275` 2/4 통과(rest config). 나머지 2(stackpage '다음 훈련'=활성 휴식이 히어로 숨김·'Trends 렌즈'=`goto('/trends')` 해시라우팅 기존 이슈)+`rest-return`은 **계정 상태로 보류, 회귀 아님**.
  - **인증 복구**: QA 계정(lena0611@gmail.com) 세션 만료→앱 **OTP 재로그인**(사용자에게 코드 요청)→로그인된 chrome 브라우저 localStorage 추출로 `qa-storage.json` 재생성. ⚠ 토큰 회전으로 **또 만료될 수 있음** → 다음 인증 E2E 전 재로그인 필요할 수 있음.
- **보류(새 세션에서 진행):**
  - **(가) 나머지 인증 E2E 검증** — `rest-return`(2개)+stackpage 2건. 전제: 계정이 **비-휴식**일 때(부상 휴식 **6/29까지** → 이후 자연 해소) 또는 휴식 capture+restore. `rest-return`은 휴식을 변경하므로 휴식 중 실계정엔 capture+restore 없이 금지. + 인증 세션 만료 시 OTP 재로그인.
  - **(나) Trends goto 수정** — `e2e/stackpage-275.spec.ts`의 `goto('/trends')`→`goto('/#/trends')` 한 줄(해시라우팅). 안전·비파괴.

## (이전) ⭐ 현재 위치 (2026-06-24 후반) — #473 후속 2건(walk-run·coach-run 휴식) + 세션상세 App레벨 출하, #275·#473 클로즈
- **이번 턴 완료(전부 머지·트리검증, 코드 출하):**
  - **#275 CLOSE, #473 CLOSE.** (a)(b)를 #473에서 후속 분리 → 새 이슈 #501·#502 생성·구현·머지.
  - **(a) 부상 복귀 walk-run #501 (PR #503)**: `walkRunReturn.ts` — 게이트 active+sev≥2(급성 통증성만), 저강도 연속 세션을 P1~P5 사다리+통증정지로(제시형, 자동진행 아님), redFlag escape hatch 상시. 적대 코치검증 반영. [[rest-and-return-coaching]].
  - **(b) coach-run 휴식 인지 #502 (PR #504 + Edge 배포)**: restState client-summary 주입→채팅 코치가 휴식 중 처방 닦달 안 함. 후방호환.
  - **(d) 세션상세 App 레벨 오버레이 (PR #505, #275 후속)**: `sessionDetailStore`+`SessionDetailOverlay`(상세+편집+삭제), 대시보드/기록 중복·편집삭제 라우팅 제거, 딥링크 store화, z 880. 코치 패턴 미러. [[stacks-app-level-independence]].
  - ✅ **3건 라이브 검증 완료(chrome-devtools, 테스트 계정 5175 세션)**: (d) Playwright 4/4 통과(PR #506, `e2e/session-detail-overlay.spec.ts`) + z 880/882/900 확인, (a) 실행 번들 buildSessionBriefing 직접 호출로 walk-run 산출 확인, (b) 휴식 중 실제 코칭 1회=닦달 없이 복귀일(6/30) 인용. OTP 불필요였음(브라우저 기로그인→localStorage 추출로 qa-storage 재생성, origin 5175).

## (이전) ⭐ 현재 위치 (2026-06-24) — UI 스택 시스템 정리(#275 공통화·코치 App레벨 오버레이·바텀시트) 10개 PR 머지·라이브
- **이번 세션 완료(PR#490~#499, 전부 머지·배포·트리검증):**
  - **#275 스택 공통화**: 중복 스택 마크업을 공유 `src/shared/ui/StackPage.vue`로 추출, 전 화면 마이그레이션(#490·#491). 함정=자동 import 없음→컴포넌트 import 누락 시 build 통과·런타임 무음실패(리뷰로만 포착). 상세 [[stackpage-commonization-275]].
  - **스택 등장 애니메이션 규칙 정렬**(#492·#493·#494): 진입/첫 스택=밑→위(rise)+우상단 X, 전진 드릴인=우→좌(push)+좌측 뒤로. `transition ?? (back ? 'push' : 'rise')`. 1차 등장 240→360ms 완화. 추세→세션은 드릴인(push).
  - **AI 코칭 App 레벨 독립 오버레이**(#496): 코치 뷰를 `src/features/coach-session/CoachSessionOverlay.vue` + `coachStore`로 추출, App.vue가 탭 페이저 밖에서 항상 렌더 → 어느 탭에서 열든 그 탭 위에 뜨고 닫으면 그 탭(스크롤 보존)로 복귀. **사용자 결정=비-탭 스택은 전부 App 레벨 독립**. z 함정 `--z-coach:900`. 상세 [[stacks-app-level-independence]].
  - **부수 수정**: 부팅 스플래시 무한 고착 방지 `cleanupLegacyWebCaches` 2초 가드(#495) · 매 부팅 '일정 다시 짰어요' 토스트 스팸 → 스케줄 재앵커 멱등화(persisted `scheduleAnchorWeeklyKm`, #497) · 상단 코치 모먼트 중복(부상 고지·지속 휴식 응원=전용 카드/배너와 중복) 제거(#498) · 훈련 단계 '진행 평가' 팝업을 표준 바텀시트로(ad-hoc 모달 제거, #499).
  - **#499 CTA 동작 확인(코드 변경 없음)**: 진행평가 바텀시트 하단 CTA는 `v-if="shouldTransition"` — 전환 제안 있을 때만 `닫기`+`전환` 노출(평상시 숨김). 사용자 "그대로 둬" 결정. DEV 임시 훅으로 'Race Specific+레이스≤2주' 상태 라이브 재현→CTA 정상 렌더 확인 후 훅 되돌림.
  - ⚠ **연속 배포 금지 교훈**: 짧은 시간 다중 배포는 WKWebView 청크 캐시 stale로 앱 스플래시 고착 유발. 배포 간격 두기.
- **남은 iOS 후속(직전 세션, 미해결)**: 가짜 '새 러닝 감지' 배너는 제거됨(PR#488 머지·기기검증). 다음 = **워치 차고 실제 1회 뛰어 집 동기화 시 '제때 1번' 알림 오나** 확인(iOS 백그라운드 깨움 의존, 워치 실주행 필요). 미수신/잔존 오탐이면 "진짜 새 워크아웃 endDate 게이트". [[healthkit-detected-notify-gate]].
- **#473 휴식·복귀(직전 세션) Phase 1·2 코어 완료·라이브**: rested 닦달 차단·💤 배너·코치 보이스·복귀 램프(현재 체력 재앵커+초반 Easy·거리캡). 인증 E2E 검증 완료. **후속(미착수)**: (a) 부상 복귀 walk-run 점진 처방(reason-blind 거리램프=공백, injury KB §3-B), (b) coach-run LLM 휴식 인지(채팅 닦달 구멍), (c) #473 이슈 클로즈 정리. 상세 [[rest-and-return-coaching]].
- 🧪 **자율 QA 인프라(재사용)**: 테스트 계정(lena0611+qa) 저장 세션 + Playwright 인증 E2E + DEV 시드 훅(`window.__pacelabE2E`, `src/app/devE2ESeed.ts`). 실행 `npx playwright test --config playwright.rest.config.ts`. 규칙=CLAUDE.md "검증·보고 방식"·[[agent-verifies-via-local-qa]].
- ⚠ **머지 규칙**: squash 후 `git diff <tip> origin/main` 빈결과 트리 검증 필수(#463 24→11 누락 사고), 의심 시 `--merge`. [[pr-squash-merge-race-verify-tree]].

## 다음 1순위
0. ✅ **감별진단 KB §5 = A+B+C+D+E + 증분2 + 증분2.1(#522) + monitoring 게이트(#525) 출하 완료** — 이번 세션 PR #526(#522 likelihood 그라데이션 + #3 monitoring 노출 게이트). 남은 후속(별도·미착수): **#522 코멘트** 1차/2차 후보 차등(favored가 타가설을 *낮추는* 모델, 현재 가산-only) · monitoring severity/recency 추가 게이트 · 재발 에피소드 스코프화 · 지면/페이스 데이터 신호(신뢰 베이스라인 확보 시). [[injury-focus-week-2026-06-24]]
0b. **(가) 인증 E2E 나머지 = 6/29 이후**: 부상 휴식 자연 해소 후 비-휴식 계정에서 `rest-return` ×2 + stackpage '다음 훈련'을 **조작 0**으로 검증. 세션 만료면 라이브 chrome(:5175) localStorage 추출(OTP 불요) 우선, 죽었으면 OTP. [[auth-e2e-account-state-and-seed-safety]]
1. **iOS '새 러닝 감지' 실주행 확인** — 가짜 배너는 제거됨(PR#488). 다음 = 워치 차고 실제 1회 뛰어 집 동기화 시 '제때 1번' 알림 오나 확인(워치 실주행 필요). 미수신/잔존 오탐이면 "진짜 새 워크아웃 endDate 게이트". [[healthkit-detected-notify-gate]].
2. ✅ **#473 완전 종료** — 이슈 CLOSED, 후속 #501·#502 CLOSED, PR #503·#504·#505 MERGED. Phase 3(풀 휴식모드)는 추적 이슈 없이 연기됨(필요 시 신규 이슈로). [[rest-and-return-coaching]].
3. **스택 후속(같은 패턴 적용 대상)** — 세션상세 자체를 App 레벨 단일화(대시보드/기록 중복) + 편집/삭제 라우팅 제거(코치 오버레이와 동일 패턴). 코치 detail footer 라벨은 정적 "AI 코칭"으로 단순화됨 → 필요 시 store에 hasThread 노출로 "이어가기/받기" 복원. [[stacks-app-level-independence]].
4. **실기기 시각 스팟체크** — #462 강한 확인 오버레이 + #455 더블 카드 + 동적 gap 바(자연 발생 시, 위험 낮음).
5. **#454 나머지 플로우 실렌더 스팟체크** — 주 페이징·다른날로/스왑·포기 잔존·주말 트리아지. 통과면 에픽 #362 마무리.
6. **#359**(롱런 네거티브 스플릿) 토 LSD 스모크 · **#307** 인터뷰 스모크 · **#374** 주기화·개러지 실기기.
7. **grill 설계 백로그 정리** — 게이트 이슈(#260·#397·#411/#398/#408/#279/#375)·메모리-only 비전 → `needs:design-grill` 라벨/메모리 통합.
8. (이슈 미등록) 네이티브 fast-segment 임계 5:45→5:50 튜닝(수동 Xcode).

## 먼저 확인할 것
1. `git --no-pager status --short`
2. `. "$HOME/.nvm/nvm.sh" && nvm use` — npm/tsc/build/test/harness는 새 shell마다 다시.
3. `node_modules` 없으면 `npm ci`.
4. `.harness/session/active-context.md` (+ 있으면 루트 `HANDOFF.md`)
5. `.harness/session/developer-input-queue.md`

## 세션 시작 시 기억할 것 (상세 규칙은 기준 문서)
- 작업 설명 있으면 `npm run harness:context -- "<설명>"`로 읽을 기준 좁히기.
- **코칭 동작/지식 작업은 코드 전에 코치 SSOT(`running-coaching-standards`/`running-injury-knowledge`) 선독 → 배치 시 그릴 → 커밋 시 `Coach-Review` 게이트.** (`.harness/project/professional-coach-review-trigger.md`)
- Issue URL/번호 있으면 구현 전 Issue 본문/labels/Project 조회. 없으면 제목/목표/범위/완료조건으로 구체화 후 기존 Issue 검색·재사용 판단.
- 완료 승인 전 build/test/harness:check/배포/commit/push 금지(MVP 예외 흐름은 `workflow-rules.md`). `main` 직접 commit/push는 hook 차단.
- 긴 대화창을 마칠 때는 **이 파일과 `active-context.md`를 현재 상태로 갱신**(낡은 항목 제거). 상세는 루트 `HANDOFF.md`, 장기 지식은 메모리.
