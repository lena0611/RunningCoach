# 결정 로그

이 문서는 이 프로젝트에서 내린 중요한 판단과 선택 이유를 남기는 소비자 프로젝트 전용 로그입니다.

> 하네스 본체의 변경 이력이나 릴리스 노트가 아닙니다. 하네스 본체 변경 기록은 하네스 저장소의 `CHANGELOG.md` 또는 릴리스 태그를 확인합니다.

## 2026-06-18 - 목표 타입 3종 아키타입으로 코칭 일반화 (#398, /grill-me 합의)

performance 전용 코칭을 **3종 아키타입**(성과·체중·체형·건강·습관)으로 확장. 기존 5 category 정규화 매핑(race→성과, fitness→체중·체형, health·habit·maintenance→건강·습관).

- **새 2종은 마감 없는 상시 꾸준함** — 주당 빈도·존2 시간·규칙성으로 성공. 체중·체형은 선택적 목표 체중. **주기화(피크/테이퍼) 안 함.**
- **처방/화면**: 같은 캐러셀 재사용, 비주기화 "반복 주간 리듬"(존2 중심). 유형별 빈도·시간·강도 가이드.
- **진행지표 맞춤**: 체중·체형=주간 존2 시간·빈도(+선택 체중 추세), 건강·습관=연속 주·규칙성. **레이스 예측·페이스 압박은 성과 유형에만.**
- **도메인 파라미터(리서치 반영)**: 체중·체형=존2/Fatmax 주3~4회·45~90분·~180분+/주(에너지 균형이 1차, 운동은 지속성), 건강·습관=WHO/ACSM 150~300분/주 분산·저부담. 상세·출처: `running-coaching-standards.md` "목표 타입별 코칭".
- **구현(1→2 순서, P1-ready)**: category→archetype 매핑 + 비성과용 상시 주간 리듬 생성기(신규 순수 함수). raceProjection·goalFeasibility는 성과 유형에만. 새 로직 순수·shared 역방향 import 안 늘림(경계 래칫 준수).
- **범위 밖**: 체중 기록/추세 입력 파이프라인은 v1 미포함(목표 체중 선택 표시만).
- → 권위: `running-coaching-standards.md` "목표 타입별 코칭", 이슈 #398. 교훈 [[design-interview-ask-product-not-science]].

## 2026-06-17 - 플랜 시작점을 "현재 체력 → 검증된 시스템 등급"으로 앵커링 (#326, /grill-me 합의)

`buildPeriodizedSchedule`의 phase는 `allocatePhases(totalWeeks, goalDistanceKm)`로 **목표일+목표거리만** 쓰고, `baseVolumeKm = 목표거리×2.5`로 시작 볼륨을 역산한다. 현재 체력/누적 볼륨(`chronicLoad.last30Km`, `readinessScore`, VDOT)은 페이스·요일에만 반영되고 **시작 phase/볼륨 결정엔 안 물려 있다** → 고볼륨 러너엔 과소, 초보엔 과다 처방 위험. /grill-me 설계 인터뷰로 다음 확정.

- **볼륨 앵커링(범위).** 현재 체력은 단계 *순서*가 아니라 **시작 등급/볼륨**을 정한다. 단계 순서(Base→Build→…→Taper)는 체력 무관 유지(Base 빌딩 생략 금지).
- **검증된 시스템을 정본으로.** 볼륨 공식을 발명하지 않고 명명된 코칭 시스템을 토대로 삼는다. 그 시스템들(Pfitzinger·Higdon·Hansons)은 이미 *현재 주행량/수준으로 플랜 등급 선택* 구조 → "현재 체력 앵커링" = "맞는 등급 선택". **거리별 대표 시스템 매핑**(5K·10K→Daniels, 하프·풀→Pfitzinger 등, 구체 매핑은 구현 시 보정).
- **현재 주행량 = 최근 한 달 평균.** 데이터 없으면(신규·복귀) **목표 설정 시 1회 입력**, 그것도 없으면 보수적 최저 등급.
- **점진적 부하는 절제된 근거로(내가 리서치·반영, 사용자에 안 물음).** 10% 룰은 근거 약함(Buist RCT). 대신 ~30%+ 급증 회피(Nielsen), ACWR 0.8~1.3(Gabbett), 3~4주 회복주. 상세·출처: `running-coaching-standards.md` "시작점 앵커링".
- **목표 과다 시 솔직히 경고 + 대안**(목표일 미루기/목표 낮추기) — "정직한 코치" 가치.
- **IP 주의**: 상용 플랜 표 복제 금지, 공개 원리·공식·등급 로직에 귀속+출처 명시.
- 교훈([[design-interview-ask-product-not-science]]): 설계 인터뷰에서 **제품/비전 결정만 사용자에 묻고, 근거 있는 도메인 파라미터(증가율 등)는 직접 리서치·반영**한다(사용자 지적).
- → 권위: `running-coaching-standards.md` "시작점 앵커링", 에픽 #326. 구현은 하위 이슈로 스펙.

## 2026-06-15 - 공통 하네스 0.2.56→0.2.64 업데이트 (CLAUDE.md 프로젝트 내용 복원 주의)

`npm run harness:update -- --base-only`로 base(harness-seed)를 0.2.64로 올림(스택 vue3-vite-pinia-router 0.1.32 최신 유지). 주요 변경: npm 없이 동작하는 `harness` 런처, git hook의 런처 호출, 스택 manifest `verify` 섹션, guard의 package.json-free 동작 등(상세 `npm run harness:changelog`).

- ⚠️ **부작용**: 업데이트가 `CLAUDE.md`에서 프로젝트 소유 내용을 삭제함 — `## 모노레포 구조 (#250)` 섹션 전체 + reading-list의 `ui-guidelines.md`/`ui-system-contract.md` 2줄. 커밋 전 수동 복원(HEAD 대비 CLAUDE.md 순변경 0 확인).
- **재발 방지**: 향후 `harness:update` 뒤 반드시 `git diff CLAUDE.md`로 프로젝트 고유 섹션(모노레포 구조, UI 선행 reading) 보존을 확인하고, 삭제됐으면 복원한다. CLAUDE.md는 일부 프로젝트 소유다.
- harness:check 통과(주의: SYNC GAP review 제안 1건 — 비차단).

## 2026-06-09 - 가상레이싱 데이터 모델 확정 (competition 1급 엔티티 + 솔로=실력측정/내 베스트 도전)

#232 UI 작업 중 데이터 귀속을 사용자와 함께 정리. 궁극 매력포인트 = **여러 명이 각자의 장소에서 실시간 레이싱**(#67, §3). 이 north star 기준으로 다음을 확정한다.

- **레이싱은 훈련이 아니다 — 직교(§10 재확인).** 물리적으로는 런(run_log)이지만 "경쟁 모드 + 결과 주석". 한 번 달린 건 **하나의 run_log**(HealthKit 정본, 통합 세션목록)이고, 레이싱은 그 위의 **주석/렌즈**로 표시한다. 별도 런 저장소를 만들지 않는다(이중 트래킹 금지, §9.1).
- **competition을 1급 엔티티로 설계, 솔로 = N=1 특수케이스.** 혼자하기(vs 고스트)와 크루(실시간 다자)는 같은 프리미티브 — 고스트 = "라이브 친구의 정적 버전". 틱 페이로드 `{participantId,...}`(§9.3)가 이미 broadcast 호환. 결과는 **competition_result로 저장**(런 주석만으론 멀티 못 감당) — 멀티 전제 스키마로 #233 재정의, 실시간 broadcast(Supabase Realtime)는 #67.
- **솔로의 고유 가치 = 실력 측정 / "내 베스트 도전"** (멀티의 곁가지 아님, 단독 출시 가치). 이 프레임이면 과거 기록을 상대로 두는 게 "경쟁"이 아니라 "내 최고 페이스 도전"이라 자연스럽다.
- **솔로 타겟 = '없음'(자유 타임트라이얼) 또는 '내 베스트'(거리별).** 내 베스트 **모수 = 훈련·레이싱 전체 통합 최속 1개**(컨텍스트 무관, 옵션1). 단 `computeDistancePbs` 정의상 "출발선부터 누적거리 D 도달 최속"이라 5km 전용 TT가 아니라 "어느 런이든 첫 D km 최속" 의미 — 한계 인지, 거슬리면 후속 품질필터(D가 총거리 큰 비중인 런만)로 보정. (앞서 검토한 "레이싱 PB/훈련 PB 따로 타겟"·"훈련 제외"는 폐기 → 통합 베스트로.)
- **업적 PB 사다리의 훈련/레이싱 분리(§9.2)는 표시용으로 유지**하되, **솔로 타겟 모수는 그것과 별개로 통합 최속**을 쓴다(두 질문을 분리).
- 적용: `raceTargets.listOpponents`를 없음/내 베스트(통합 최속)로 정리(완료). UI도 "레이싱 PB/훈련 PB 따로" → "내 N km 베스트"로.
- → 권위: 이슈 #229/#232/#233/#67, `.harness/project/competition-domain.md` §3·§9.2·§10. competition_result 스키마·실시간은 후속 구현.

## 2026-06-09 - #229 PoC① GO + iOS 서명/백그라운드 셋업 (가상레이싱 본구현 착수 가능)
- PoC① 결과(실기기 iPhone17,3, iOS 26.4.2): 백그라운드(화면잠금) 위치추적(틱·거리·경과 계속 증가)·1분 주기 음성·음악 ducking 동작, 배터리 99→97%/~17분 ≈ **~7%/h** → **GO**. Watch(#235) 우선순위 재검토 불요.
- force-quit(앱스위처 강제종료) 자동복원은 **iOS 설계상 일반 위치업데이트로 불가**(앱 재실행 안 됨). **결정(2026-06-09): force-quit 시 세션 종료** — 자동복원 미구현(SLC/region monitoring 복잡도·배터리 부담 회피). 사용자가 다시 시작하면 새 세션으로 시작한다. (Strava/나이키런도 force-quit 미복원과 동일 정책.)
- **PoC 코드 위치(중요)**: 전부 브랜치 `issue-229/live-run-poc`(origin 푸시됨, PR #265, **미머지**). main엔 없음. 재개 = `git checkout issue-229/live-run-poc`.
  - 포함: `native/RunningCoach/LiveRunPoCView.swift`(측정 하니스), `Info.plist`(UIBackgroundModes=location,audio — Xcode Background Modes capability로 생성), `DEVELOPMENT_TEAM=3GCS2R55TJ`(lena0611) 통일, `.voicePrompt`+volume 1.0 음성, allowsBackgroundLocationUpdates 크래시 가드.
  - ⚠️ **진입점 swap 주의**: 그 브랜치 `RunningCoachApp.swift`가 `ContentView()`→`LiveRunPoCView()`로 임시 변경됨. **main 머지 전·실앱 사용 전 반드시 `ContentView()`로 되돌릴 것.**
- **iOS 서명 교훈(재발 방지)**: 폰 iCloud=lenas0611 / 개발자계정=lena0611. 모노레포 `native/` pbxproj가 lenas0611 팀(NMQC64885X)으로 박혀 있어, 빌드 서명 신원이 폰의 lena0611 설치와 달라지면 "미신뢰·새 설치(데이터 초기화)"로 떨어진다. → `DEVELOPMENT_TEAM`은 lena0611(`3GCS2R55TJ`)로 유지. **main pbxproj는 아직 lenas0611이므로 본구현 브랜치에서 lena0611 확인 필수.** 또 `INFOPLIST_KEY_UIBackgroundModes`는 이 Xcode(26.5)에서 안 먹음 → **GUI Capability(Background Modes)로 물리 Info.plist 생성이 정답**. Xcode 열린 채 외부에서 pbxproj 수정하면 안 먹을 수 있음(Xcode 내부 편집 우선).
- 다음(본구현, 네이티브·실기기 빌드 핑퐁 각오): #229 `LiveRunTracker.swift`·`GhostRaceEngine.swift`(#230 `ghost.ts` 포팅)·`runContextLiveRun` 브리지(웹 `liveRunBridge.ts` + 네이티브 핸들러, 원자적), #231 `SpeechManager.swift`(`speechQueue.ts` 포팅)·PoC③ 음질, #232 레이싱 UI(와이어프레임 합의됨, 요약탭 진입).
- → 권위: 이슈 #229(PoC① 결과 코멘트), #230/#231 순수로직(머지됨), #232 와이어프레임 합의 코멘트.

## 2026-06-08 - 개인 업적 도메인(#181): 파생 계산 + 코칭 인용은 client-summary 주입
- 설계 게이트: #181은 Inbox·초안("설계 확정 후 착수")이라 구현 전 4개 결정을 사용자 확인. 결과(모두 추천 채택): (1) 범위=PB·기록류 우선(최장 거리/시간·최속 평균 페이스·거리 마일스톤 첫 달성, 누적류 스트릭/볼륨은 후속), (2) coach-run 인용 포함, (3) 표시 UI는 후속(와이어프레임 게이트), (4) 저장=파생 계산(테이블 없음).
- 저장 결정: 업적은 전부 `run_logs` 파생·stateless 재산출(`src/shared/lib/achievement/achievements.ts`). 별도 테이블/트리거 없음 → 새 기록 import 시 재호출만으로 자동 갱신. distancePb(#228)와 동일 패턴, 이중 출처·동기화 복잡도 회피.
- 컨텍스트 분리: PB·기록류는 'self-race'로 훈련/레이싱 상호 배타. 누적류는 통합(후속). race 사다리는 self-race 0건이면 비어있음(부트스트랩).
- **코칭 인용 = client-summary 주입(미러 대신)**: coach-run은 `run_logs`를 최근 120건만 조회 → 서버 재계산 시 올타임 기록(예: 130런 전 최장거리)을 놓침. 그래서 vdotPaces류 "양측 미러" 대신, **웹이 전체 런으로 산출한 컴팩트 요약을 payload로 전달**하는 `currentWeather` 패턴을 채택. coach-run은 `normalizeAchievements`로 검증·주입만. 이유: (a) 올타임 정확, (b) distancePb 적분(150줄) Deno 미러 회피, (c) 프롬프트 크기 절약(PB 2버킷·마일스톤 목록만). 단점=클라이언트 신뢰지만 사용자 본인 데이터·비권위 인용이라 수용. 인용 지침: 과장/날조 금지, 맥락 맞을 때 1~2개, 값 재계산 금지.
- 검증/배포: Edge(coach-run) 변경 → 배포 후 로그인 상태 실제 코칭 1회 스모크가 완료 조건([[edge-auth-deploy-smoke]]). 인증/토큰 경계 미변경(선택적 context 필드 추가).
- → 권위: 이슈 #181, `.harness/project/competition-domain.md` §9.2(PB 분리). UI·누적류는 후속 이슈.

## 2026-06-08 - PoC② metricSamples 밀도 측정 → 거리별 PB(#228) 착수 게이트 GO
- 게이트: 2026-06-07 결정의 "착수 게이트 PoC②"(metricSamples로 현실적 PB 곡선 생성 가능 비율 측정, #228 완료조건 1번)를 닫는다. **production 코드 없이** Supabase SQL Editor에서 집계 SQL만 실행해 측정(원시 PII 미반출). 측정 SQL은 repo root `poc228-metric-samples-density.sql`(재현용, 추적).
- 측정 결과(전체 188런, 5km↑ 140런이 5km PB 사다리 모집단):
  - 샘플 보유율 **97%(136/140)** — 순수 균등 fallback이 강제되는 무샘플 런은 **3%(4건)뿐**.
  - paceSec 커버리지 평균 0.98, 시간(offsetSec) 커버리지 평균 ~1.0 → 적분 입력(offsetSec/paceSec)이 거의 항상 존재.
  - 밀도 중앙값 15.2 샘플/km, 샘플 간격 중앙값 30.2초(≈80~100m/점) → 5km 경계 위치 오차 ±~18초로 PB 산출에 충분.
  - 밀도 히스토그램(5km↑): 무샘플 4 / <5km 1 / 5–10km 31 / 10–20km 104 / ≥20km 0.
  - source는 **전부 HealthKit**(188/188, 평균 73샘플/런). file_import·manual·image_extracted 경로의 샘플 부재는 이 데이터셋으로는 검증 불가(향후).
  - `self-race` 태그 런 **0건** → 레이싱 PB 사다리 현재 비어있음(이슈 부트스트랩 전제와 일치).
- 판정: **GO**. 근거 — 곡선 생성 가능 실질 비율 97%, 순수 fallback 3%로 균등 fallback 비중 우려 없음 → 고스트(#67) 입력 품질 재검토 불요.
- 구현에 고정할 결정 2가지:
  1. `computeDistancePbs` 분기는 **"샘플+paceSec 있으면 적분, 없으면 durationSec/distanceKm 균등"의 2단**으로 충분. 초기 측정에 쓴 `10샘플/km` 같은 밀도 컷오프는 **사용성 게이트로 쓰지 않는다**(성긴 5–10/km 22%도 실측 pace가 등속 가정보다 우월 → 적분 사용). 밀도 컷오프 도입 시 22%가 불필요하게 fallback으로 떨어짐.
  2. **race 분리 케이스는 실데이터가 없어 합성 fixture Vitest로만 검증** 가능(self-race 0건). #228 완료조건 "훈련·레이싱 분리 케이스" 테스트는 이 전제를 명시.
- → 권위: 이슈 #228 완료조건, `.harness/project/competition-domain.md` §9. 후속 구현(`src/shared/lib/achievement/distancePb.ts`)은 본 게이트 통과 후 진행.

## 2026-06-08 - 웹+네이티브 모노레포 이행 (#250, ultracode 9-에이전트 계획)
- 배경: 웹·네이티브가 `runContext*` 브리지 스키마로 결합돼 있는데 별 repo라 브리지 변경이 두 repo로 쪼개져 원자성이 깨짐. 라이브 트래킹(#229)·워치(#235)·레이싱 등 크로스커팅 작업이 곧 본격화 → 모노레포로 결정.
- 핵심 결정: (1) 웹 repo를 기준 모노레포로 유지(새 repo 안 팜 — 하네스·Pages·Actions·Supabase Vars·하드코딩 URL이 웹에 바인딩). (2) **웹은 root 그대로**(서브디렉터리化 금지 — `vite base '/RunningCoach/'`·`pages.yml`·`repoRoot`·상대경로 스크립트가 web-at-root 가정, 옮기면 전부 깨짐. 웹/하네스 변경 표면 0). (3) 네이티브만 `native/` 프리픽스로 `git subtree add` 흡수(history 보존, 2중첩 평탄화). (4) 네이티브 remote는 archive(삭제 금지), #248 parked는 보존 브랜치로 push.
- 검증으로 밝혀진 단순화: native/ 추가가 harness:check(web lint/test/build)·harness:impact에 영향 없음 → 계획이 우려한 stack scoping(scope-gate.mjs)은 **불필요**. WebApp gitignore분도 subtree에 안 딸려옴.
- 비가역 지점은 **E4(통합 브랜치→main 머지) 하나뿐**. 그 전까지는 통합 브랜치 삭제로 완전 복구. 백업 태그 `premonorepo-web-backup`/`premonorepo-native-backup` + 네이티브 미러(`~/backup/native-mirror.git`) 확보.
- 후속(별도): 브리지 계약 단일화(`shared/contracts/runContext.bridge.ts`), WebApp 빌드 자동복사, 메모리 모노레포판 갱신(`native-repo-git-management`·`worktree-edit-path`), #248 DeviceCheck.
- → 권위: root `CLAUDE.md` 모노레포 섹션, 이슈 #250.

## 기록 원칙
- 프로젝트 기준, 스택 기준, 템플릿 계약, 개인 기준이 충돌할 때 선택 이유를 남깁니다.
- 테스트 전략, 예외 허용, 아키텍처 경계, 운영 절차처럼 이후 작업에 영향을 주는 판단을 남깁니다.
- 단순 작업 로그나 일회성 구현 세부사항은 남기지 않습니다.
- 임시 예외는 가능하면 `.harness/policy/waivers.json`에 범위와 만료 조건을 함께 남깁니다.

> 아카이브: 2026-05 결정 61건과 2026-06 완료·통합·해소 항목은 `decision-log-2026H1.md`로 분리했습니다(하네스 v0.2.55 기억 표면 정리). 현재 파일은 최근 또는 아직 유효한 결정만 유지합니다.

## 2026-06-01 - 추세 Lens 하단 탭 신설
- 결정: `추세`를 4번째 하단 탭으로 추가(목표 진전/유산소 효율/강도 분포/세션 품질/회복 비용 Lens, 각 Lens는 변화·신뢰도·근거 세션·처방 영향). `RunLog`/목표/부상 편집·AI 코칭 변경은 미담당. 의료/부상 예측 단정 없이 처방 보수성 조정 신호로만 제한.
- → 권위: `.harness/project/navigation-information-architecture.md`. UI 반영은 `03-ui-ux` workstream.

## 2026-06-01 - HealthKit 과거 이관 임시 UI (완료·아카이브)
- #25 2025-11~2026-04 HealthKit 과거 이관용 1회성 UI를 기록 페이지에 추가했다가 이관 성공 후 제거. 비노출 브리지/저장 로직(`requestHistoricalMigration`/`requestHealthKitRunsInRange`/네이티브 `requestRunningWorkoutsInRange`)은 향후 범위 이관·운영 복구용으로 유지한다. 전문 → `decision-log-2026H1.md`.

## 2026-06-01 - 완료된 Issue worktree 정리 기준
- 결정: 완료 worktree 정리는 Issue Closed + Project Done + worktree clean + 후속 확인 불필요를 모두 만족할 때만 후보. Open/Deployed·미커밋 변경은 사용자 확인까지 보류·보고, 명시 삭제 지시에만 소실 알리고 force 제거.
- → 권위: `.harness/project/workflow-rules.md`, `github-issue-management-guide.md`, `commit-push-rules.md`.

## 2026-06-01 - 하단 네비 탭 수는 컴포넌트 상태를 기준으로 렌더링
- 문제: Issue #68에서 하단 네비가 4개 탭으로 늘었지만 전역 CSS 그리드는 3개 컬럼에 고정되어 모바일에서 네 번째 탭이 두 번째 줄로 밀리고 active pill이 화면을 가렸다.
- 결정: `BottomNav`가 항목 수를 CSS 변수로 내려주고, 모바일/데스크톱 그리드는 해당 값을 사용한다. 모바일 네비 폭과 항목 패딩은 4탭 기준에서 라벨이 한 줄로 유지되는 값으로 보정한다.
- 선택 이유: 탭 수 변경은 앱 쉘의 제품 구조 변경이므로 스타일에서 숫자를 중복 고정하면 같은 회귀가 반복된다. 컴포넌트의 실제 항목 수를 단일 기준으로 삼아 레이아웃을 맞춘다.
- 적용 범위: `src/shared/ui/BottomNav.vue`, `src/app/styles.css`.

## 2026-06-01 - Root tab pager 내부 fixed 요소는 비활성 탭에서 숨김
- 결정: tab-local fixed chrome은 비활성 `.tab-swipe-panel[aria-hidden='true']` 아래에서 숨긴다. fixed는 부모 패널 overflow를 벗어나 z-index만으로는 다른 탭 누수를 못 막으므로 active panel scoping 필요.
- → 권위: `.harness/project/ui-guidelines.md`. 통합 계약은 2026-06-05 "하단 네비 스와이프 탭" 항목 + `.claude` memory `tab-swipe-pager-contract`.

## 2026-06-01 - Teleport fixed 요소는 route 조건으로 렌더링 제한
- 결정: `Teleport to="body"` 요소(Run Log 월 heading)는 CSS descendant scoping이 안 닿으므로 route가 `/runs`일 때만 렌더링. tab-local 좌우 드래그 UI는 `data-no-swipe`+pointer/touch stop으로 root pager 이벤트 차단.
- → 권위: `.harness/project/ui-guidelines.md`. 통합 계약은 2026-06-05 "하단 네비 스와이프 탭" 항목 + memory `tab-swipe-pager-contract`.

## 2026-06-01 - AI 코칭은 코드 판단 엔진과 구조화 장기기억을 분리
- 문제: AI 코칭이 장기 컨텍스트를 사용하고 있었지만, 러너 정체성/반복 belief 같은 구조화 계층과 코드가 먼저 계산하는 판단 엔진이 명확히 분리되어 있지 않았다.
- 결정: `coach-run`에서 `runningAnalysisEngine`을 만들어 HR drift, 부하 변화, 회복 상태, 부상 위험, 과훈련 경고, 훈련 적합성 점수를 먼저 계산한다. `TrainingMemory`에는 `runnerIdentity`와 `coachBeliefs`를 추가하고, OpenAI 응답은 Responses API strict JSON schema로 강제한다.
- 선택 이유: 계산 가능한 판단은 코드가 책임지고, OpenAI는 그 판단을 설명/코칭 언어로 바꾸는 역할로 좁혀야 개인화 품질과 재현성이 올라간다.
- → 권위: `.harness/project/ai-coaching-goal.md`, `running-coaching-standards.md`, `architecture-rules.md`, `domain-rules.md`. 핵심 경로 `supabase/functions/coach-run/index.ts`는 `npm run supabase:functions:check`로 Deno 타입 체크.

## 2026-06-02 - 추세 Lens 원본 신호와 표시용 처방 게이트 분리
- 결정: `buildTrendLensResult`는 단일 Lens 원본 분석으로 유지하고, 화면은 `buildTrendAnalysis`가 5개 Lens 계산 후 recovery/intensity warning을 전역 safety gate로 적용한 표시용 결과를 쓴다. 좋은 신호 hero는 보존하되 최종 처방 문구는 게이트 통과 반영. (Lens 계산에 타 Lens 상태 직접 주입은 독립성·테스트 경계 흐려 미채택.)
- → 권위: `.harness/project/domain-rules.md`.

## 2026-06-02 - 추세 종합 판단 클릭은 렌즈 선택만 수행
- 문제: 종합 판단 항목 클릭 시 해당 Lens를 선택한 뒤 `scrollIntoView({ block: 'start' })`로 Lens 상세까지 강제 이동하면서 모바일 화면 위치가 튀거나 사용자가 현재 맥락을 잃는 회귀가 생겼다.
- 결정: 종합 판단 항목 클릭은 관련 Lens 탭 선택만 수행한다. Lens 상세 영역으로의 강제 자동 스크롤은 제거하고, 버튼 기본 브라우저 스타일 영향은 CSS에서 명시적으로 차단한다.
- 선택 이유: 종합 판단 카드와 Lens 탭은 상하로 인접해 있어 선택 변경만으로도 연결성이 유지된다. 자동 스크롤은 모바일 WebView와 root tab pager 맥락에서 화면 위치를 예측하기 어렵게 만든다.
- 적용 범위: `src/pages/trends/TrendsPage.vue`, `src/app/styles.css`.

## 2026-06-02 - 브릿지 체크는 UX 차단, 서버 앱 세션은 보안 경계
- 문제: GitHub Pages 공개 프론트에서 `window.webkit`/`NativeBridge` 존재 여부만 확인하면 사용자가 브라우저 개발자도구나 스크립트로 bridge 모양을 흉내내 서버 기능을 호출할 수 있다.
- 결정: 프론트 bridge 체크는 일반 브라우저 UX 차단으로만 유지한다. AI 코칭처럼 OpenAI 비용과 사용자 러닝 데이터 접근이 있는 Edge Function은 사용자 인증 뒤 `app-session` Edge Function이 발급한 짧은 수명의 서버 앱 세션, 승인 사용자 allowlist, 함수별 rate limit을 추가로 검증한다.
- 구현 기준: MVP 임시 운영은 `APP_SECURITY_MODE=allowlist`로 둔다. 서버는 승인된 로그인 사용자에게만 HMAC 서명 앱 세션을 발급하고, `coach-run`은 앱 세션과 rate limit을 통과해야 OpenAI 호출을 수행한다. 무료 Apple 계정(Personal Team)이라 DeviceCheck/App Attest key 미발급 → allowlist 모드는 deviceToken 없이 통과하므로 iOS 네이티브 변경 불필요. 유료 전환 시 `APP_SECURITY_MODE=devicecheck`로 바꾸고 네이티브 `runContextAppSecurity` 브리지만 추가(서버 `verifyDeviceCheckToken` 경로는 구현됨). App Attest는 미구현 시 501.
- 배포 순서 주의: `coach-run`이 `x-pacelab-app-session` 검증을 강제하므로 프론트 배포 전에 (1) Supabase secret(`APP_SESSION_HMAC_SECRET`, `APP_SECURITY_MODE=allowlist`, `PACELAB_ALLOWED_EMAILS`, `COACH_RUN_RATE_LIMIT_PER_HOUR`), (2) `app_sessions`/`edge_function_rate_limits` 마이그레이션, (3) `app-session`·`coach-run` 배포가 선행돼야 한다. 순서가 어긋나면 모든 사용자의 AI 코칭이 403/500으로 끊긴다.
- → 권위: `.harness/project/architecture-rules.md`, `config-contract.md`, `github-pages-supabase-playbook.md`. 신규: `supabase/functions/app-session/index.ts`, `src/shared/api/appSecurity.ts`.

## 2026-06-04 - Edge Function 인증/토큰 변경은 배포 후 실제 흐름 스모크가 완료 조건
- 결정: Edge Function의 인증·세션·토큰·rate limit 같은 보안 경계를 추가/변경하면 타입체크·빌드·단위 테스트만으로 완료로 보지 않는다. 배포 후 승인 사용자 로그인 상태에서 실제 코칭 1회(보호 대상 호출 1회) 스모크를 완료 조건에 포함한다(캐시된 옛 토큰은 비운 뒤). 정적 검사는 토큰 직렬화/서명/구분자 충돌·런타임 비동기 폴백 버그를 잡지 못함(#93 배포 후 연속 차단: 동기 throw로 폴백 무력화 + `expiresAt` 밀리초 `.`가 토큰 `split('.')` 조각 수를 넘겨 전부 403. PR #156/#158).
- → 권위: `.harness/project/workflow-rules.md` 검증 규칙, `.claude` memory `edge-auth-deploy-smoke`.

## 2026-06-04 - 심박존·템포/이지/회복 상한을 개인 심박 기준으로 공식 파생 (#123→#127, 165 상수 전역 제거)
- 배경: 템포 상한 165와 Z0~Z5 존이 개발자 개인값으로 4곳(`heartRateZones`·`coach-run`·`performanceProjection`·`trendInsights`)에 하드코딩, 개인 심박 입력·환산 경로 부재(#123 조사). 165는 2달 전 ChatGPT 개인값이라 "코드 어디에도 상수 금지" 요구.
- 결정(최종): 165/145/130 상수를 코드 전역에서 제거하고 존 경계를 anchor(LTHR)의 %LTHR 비율로만 정의(Z1 0.79·Z2 0.88·Z3 0.94·Z4 1.0). anchor 우선순위 manual=LTHR>측정 HRmax, auto=max(Tanaka 208−0.7×나이 추정, 누적 RunLog 관측 최대심박)×0.9(표본 3개↑·4개↑면 최고 1개 제외, 올리는 방향만 보정). `AthleteProfile.heartRateMode:'auto'|'manual'`. 근거 전무 시 상한 null(165 fallback 없음)→페이스/RPE/드리프트 평가+입력 권유. UI에 현재/추천값·source·산출식·외부 근거 링크(Tanaka PMID 11153730, Joe Friel LTHR, ASICS).
- 후속(잔재 정리, #127 후속): 저장 처방/루틴은 `training_memory.memory` 단일 JSON upsert(이력 없음·항상 최신본)라 stale 165 텍스트를 load 시 `stripStaleHeartRateCeilings`로 일반 표현 치환(웹 normalize + coach-run sanitize). coach-run은 심박 숫자를 항상 heartRateModel만 단일 출처로 사용. coach_reports append 이력은 불변(새 턴부터 정합).
- 안전: Tanaka/나이 추정은 보수 신호로만, 레벨·나이로 안전 상한 안 낮춤, 의료 단정 금지.
- → 권위: `.harness/project/domain-rules.md`. 단계별 전문(#127 구현/v2/후속) → `decision-log-2026H1.md`. 페이스/VO2max 미러는 `.claude` memory `vo2max-vdot-pace-model`.

## 2026-06-05 - 하네스 base v0.2.53 적용 (worktree silent-skip 상류 수정 반영, Issue #194)
- 적용: `npm run harness:update -- --base-only`로 base 0.2.52 → 0.2.53. stack 0.1.32 최신(무변경). worktree에서 hook `harness:check`가 추적 상태(`profile.json` activeStack + 커밋된 `.harness/stacks/.applied/<stack>/manifest.json` 스냅샷)로 적용 여부를 derive해 lint/test/build를 **실제 실행**(`Stack applied state derived from tracked snapshot` 출력) — 과거 silent-skip 결함 종료. 본체 결함 전문 → `decision-log-2026H1.md`.
- 표준 계층 결정: 이 업데이트가 base-managed `CLAUDE.md`/`AGENTS.md`의 인라인 PaceLAB 전용 문구를 generic base로 되돌렸으나, 권위 규칙은 `.harness/project/workflow-rules.md`·`commit-push-rules.md`에 보존돼 동작 손실 없음. 재인라인하지 않고 generic base 수용 — 프로젝트 전용 규칙 단일 출처는 `.harness/project/*`(엔트리 인라인은 base 업데이트마다 덮여 drift 재발). surface는 UserPromptSubmit hook이 매 요청 주입해 유지.
- 주의: fresh worktree는 `node_modules` 없으면 검증이 실제 실행돼 `vitest: command not found`로 실패 → `npm ci` 선행 필수(하네스 문제 아님).

## 2026-06-05 - 하단 네비 스와이프 탭: 스크롤 모델 + iOS 제스처 계약 (#196·#198·#200·#204·#206·#208·#210·#212 완료처리)
- 배경: 하단 4탭(요약/기록/추세/기억)은 App.vue가 4페이지를 한 트랙에 동시 마운트해 좌우 스와이프로 전환. 번들 다이어트 + iOS 스와이프 불안정(세로 끌림·mid-drag 네비·sticky 잔상) 해결에 8개 이슈·연쇄 회귀가 있었어 핵심 계약을 고정한다. (2026-06-02 root swipe 개별 결정 2건은 이 계약으로 통합·아카이브.)
- 아키텍처(#196·#198):
  - 4탭 페이지는 `defineAsyncComponent` 지연 로드(독립 청크). 활성 탭만 초기, `onTabPointerDown` 시 좌우 이웃 로드, 유지. **App.vue에서 페이지 정적 import 금지**(라우터 `() => import()` 무력화 → 전부 entry로 합쳐짐).
  - 탭 홈 스크롤 모델 = 상세 스택(`.memory-stack-page`)과 동일: `.app-shell.is-tab-home` `height:100dvh` 고정 grid + `.app-main` 내부 스크롤 행 + **각 `.tab-swipe-panel`이 독립 내부 스크롤러**(`overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior:contain`). 바디 미스크롤 → 상단 오버스크롤로 웹뷰 뒤 미노출, 내부는 바운스(pull-to-refresh 대비).
- iOS 제스처/스크롤 계약(회귀 교훈, 위반 금지):
  1. **Pointer Events `preventDefault()`는 iOS 네이티브 스크롤을 못 막음 — non-passive `touchmove`만 가능.** 수평 락 중 document `{passive:false}` touchmove로 preventDefault.
  2. **스크롤 시작된 touchmove는 취소 불가** → 첫 유의미 move(≥6px)에서 방향 확정(absX>absY=수평), 수평이면 즉시 preventDefault(dead-zone 대기 금지).
  3. **제스처 도중 스크롤러 `overflow`/`touch-action` 토글 금지** → reflow가 `pointercancel` 유발, `@pointercancel`이 종료처리에 묶이면 mid-drag 네비(#200→#204). 세로 억제는 토글 아닌 scrollTop 핀 + touchmove preventDefault.
  4. **`pointercancel`은 네비 커밋 금지(스냅백). 네비는 `pointerup`에서만.**
  5. **내부 스크롤러에선 `window` scroll 리스너를 capture(`{capture:true}`)로** — 버블 리스너는 자식 스크롤러 scroll을 못 받음(#210 sticky 잔상 원인).
  6. **스크롤 위치는 패널별 독립** → 탭 도착 시 active 패널 `scrollTop=0` 리셋(#208). AppShell `window/app-main.scrollTo`는 탭 라우트에선 무효(잔존 무해).
  7. **스크롤-구동 sticky는 스와이프 확정 즉시 정리** → 확정 시 `CustomEvent('pacelab:tab-swipe-commit')` 발화, 페이지가 수신해 해제(#212). 도착-후 처리는 슬라이드 종료 후 늦게 떨어짐.
- 한계: iOS 첫 move 이전 미세 세로 끌림 잔존 가능. 검증 실기기 필수(헤드리스 불가). 미채택: 비활성 탭 완전 지연 마운트, 부상 이미지 최적화(부상 전면개선 시 별도).
- 적용: `src/app/App.vue`(arbiter·지연로드·commit 이벤트), `src/app/styles.css`(is-tab-home·panel), `src/shared/ui/AppShell.vue`(is-tab-home), `src/pages/run-log/RunLogPage.vue`(capture scroll·sticky 이벤트). `.claude` memory `tab-swipe-pager-contract`.

## 2026-06-05 - 날씨 도메인 러너 중심 재설계: 기상청 교체·Edge 프록시 (Issue #219)
- 배경: Open-Meteo(글로벌)는 국내 정확도가 약하고 로드 실패가 잦음. 국내 정확도 높은 기상청 단기예보(VilageFcstInfoService_2.0)로 교체.
- 결정:
  - **출처 교체 + 프록시**: 운영 기본을 기상청으로 교체. serviceKey가 `VITE_WEATHER_*`(프론트 노출, config-contract 위반)였던 문제를 Edge Function `weather-run`에서 `KMA_SERVICE_KEY_DEC/ENC` 서버 secret으로 옮겨 해결. Edge가 격자 룩업·디코딩·발표시각 캐시·rate limit·app-session 검증을 담당(coach-run 패턴).
  - **좌표→격자**: Lambert 변환식 대신 행정동↔격자 룩업표(`grid.json`, 3834행) 최근접 매칭. 역매핑으로 동네명 라벨 동시 제공.
  - **체감온도 계절분기 자체 산출**: 기상청 미제공 → 여름 열지수(Stull 습구)/겨울 풍속냉각/중간 기온. 웹 `runningWeather.ts` ↔ Edge `weather-run` **미러 유지**(pace/HR 모델과 동일 패턴).
  - **일출/일몰**: 외부 API 없이 위경도 천문계산(`sunTimes.ts`, NOAA solar-noon).
  - **시점 전환**: 3일 스냅샷 한 번 받고 클라이언트 날짜 필터(추가 호출 없음). 3일 초과는 "예보 범위 밖" 안내(중기예보 미사용).
  - **복장 추천**: 러닝 체감온도 5℃ 단위 10버킷(≤−10~≥30) + 강수·강풍 가점. 규칙기반(오프라인).
  - **공유 인증 모듈**: `_shared/appSession.ts` 신설(weather-run 사용). coach-run(critical)은 인라인 유지해 risk 격리.
  - **Open-Meteo 보존**: 삭제하지 않고 Supabase 미설정/비로그인 개발 fallback으로만 유지.
- 미완 수동 단계(배포 전 필수): Supabase Edge secret `KMA_SERVICE_KEY_DEC/ENC` 설정 후 `weather-run` 배포. 배포 후 실제 위치 1회 스모크(인증/프록시 토큰 경로 포함) — `.claude` memory `edge-auth-deploy-smoke` 기준.
- → 권위: `.harness/project/architecture-rules.md`(날씨 계약), `domain-rules.md`(WeatherSnapshot·외부 시스템 계약), `config-contract.md`(KMA secret), `weatherkit-data-contract.md`, `.claude` memory `weather-runner-domain`.

## 2026-06-05 - 세션 파일 슬림 구조 채택 + 운영 규칙 단일 출처 고정
- 문제: `next-session-reminder.md`와 `active-context.md`가 `.harness/project/workflow-rules.md`의 "요청 단위 풀스택 창 운영" 규칙 본문을 거의 1:1로 복붙해 비대해졌다. 두 파일은 매 세션 SessionStart hook과 always-on 기준으로 로드되므로 중복이 매 세션 토큰을 두 번 먹고, 규칙 단일 출처가 무너진다.
- 결정: 두 파일은 **부트스트랩/핸드오프 계층**으로 한정한다. `next-session-reminder.md`=부팅 체크리스트, `active-context.md`=프로젝트 고정 사실+최신 상태+핸드오프. 운영 규칙 본문은 `.harness/project/workflow-rules.md`와 `CLAUDE.md`를 **단일 출처**로 가리키고 session 파일에 중복 기재하지 않는다.
- 계층 근거: `standards-layers.md` — 세션 운영 기준은 "기본 운영 기준" 층이라 프로젝트가 구체화 가능. 두 파일은 `install-manifest.json`의 `projectOwnedFiles`라 본체 업데이트가 내용을 보존.
- 후속: 슬림 유지 "원칙"은 본체로 승격 요청해 하네스 v0.2.54/0.2.55에 반영됨(축적형 기억 파일까지 확장). 본 2026-06-06 정리가 그 기준의 첫 전면 적용.

## 2026-06-07 - 가상레이싱(나와의 대결) 도메인 분류 + 구현 스펙 확정 (Issue #67 후속, #228~#233)
- 배경: #67 기획 위에 구현 계약을 얹으며 (a) 레이싱 타겟 모델, (b) 가상레이싱의 세션 데이터 분류를 확정해야 했다. 분류는 부상·추세·추천·코칭 4대 경로로 흐르므로 결정 단위로 고정한다.
- 타겟 모델 결정: 타겟은 "과거 RunLog 1건"이 아니라 **거리별 PB**(출발선부터 5km 단위 누적거리에 가장 빨리 도달한 기록). PB 산출·업적 등록 엔진은 **#181 업적 도메인이 소유**(#228), `나와의 대결`은 소비만. PB 런의 곡선이 고스트 입력.
- PB 사다리 분리 결정: 업적 PB는 **훈련간 PB / 레이싱간 PB를 상호 배타로 분리**한다. 분리 키 = `RunLog.tags`의 'self-race' 포함 여부(#233 태깅의 이중 목적 — 식별 + PB 분리). 레이싱 PB가 훈련 PB 사다리를 오염시키지 않게 partition 후 각각 min. 타겟 선택(#232)은 두 사다리 모두 노출. `DistancePb`에 `context:'training'|'race'` 추가.
- 분류 결정(핵심): **가상레이싱 = 훈련 분류와 직교하는 경쟁 도메인의 "수행 모드 + 결과 주석". 별도 RunType도 별도 활동도 아니다.**
  - 근거: `type:'Race'`는 Riegel 예측(`performanceProjection.ts:303,312`)·회복 비용·테이퍼·하드세션 부하(`ruleBasedCoach.ts:208,388`, `runStats.ts:164`, `trendInsights.ts:118`)에 직접 투입되는 무거운 신호. 가상레이싱(쉬운 날 PB 추격 포함)을 'Race'로 강제하면 이 경로가 오염된다. 또 별도 "레이싱 활동"을 만들면 HealthKit→RunLog 정본과 거리·부하가 **이중계산**된다.
  - 처리: 정본 활동 = HealthKit→RunLog(`type`은 `inferRunType` 판정, 불변) + `tags += 'self-race'` 경량 태그. 레이싱 결과 = 경량 `competition_result{mode:'self-pb',targetPb,racedDistanceM,resultGapSec,outcome,linkedRunId,racedAt}` (종료 후 import된 RunLog와 시간·거리 근접 매칭). competition_result는 볼륨·부하·추세 집계 **미포함**(업적·동기부여·코칭 인용 전용).
- 선행 갭(불변): PaceLAB는 라이브 인-런 데이터를 안 받음 → iOS 라이브 트래킹(#229)이 1순위 선행. 브리지 2종 신설(`runContextLiveRun`, `runContextSpeech`)은 기존 healthKit 브리지 패턴 확장.
- 착수 게이트: PoC②(metricSamples 밀도로 고스트 생성 가능성, #228 — 코드 없이 가장 싸게 검증)를 **최우선**. PoC①(iOS 백그라운드 위치+오디오 60분+ 안정성, #229) 막히면 Watch 우선순위 상승.
- child 분해: #228(PB·업적, Ready/P2/최우선) #229(iOS 라이브, 선행) #230(고스트 엔진, 틱 모킹 선개발) #231(음성) #232(UI — 와이어프레임·glossary 게이트) #233(결과 분류·링크).
- → 권위: `.harness/project/competition-domain.md` §9·§10에 구현 스펙·분류 반영. UI 착수는 와이어프레임 합의 후(design-before-implementation), 사용자 노출 용어는 /glossary 동반 갱신.

## 2026-06-15 - 자기진화 2분리: 결정론 적응(구현 완료) vs 게이트형 지식확장(에이전트 자율 웹소싱 금지)
- 배경: 에픽 #326(Adaptive Training Engine) 완료 후, "사용자 레벨/코칭 분석에 따라 외부에서 새 훈련 프로그램을 자동 공수해 DB에 넣고 코칭에 반영하는 자율형"을 검토. 핵심 우려 = 에이전트가 자율로 웹을 서칭해 훈련법을 DB화하고 자동 반영하는 경로의 안전성.
- 결정(분리): "자기진화"를 두 축으로 분리하고 위험 경로만 차단한다.
  - **(A) 적응(adaptation) — 허용·구현 완료, 결정론적.** 외부 지식 없이 사용자 run 데이터만으로 처방 경계를 스스로 상향: Tempo/Easy/LongDrift/Recovery 적응값(#333~335, 추정→검증→채택, 상향만·cap), ProgressionCriteria 평가(#336), Phase 자동전환(#337, requiresUserConfirm). "레벨/분석 기반 자율 상향"의 안전한 코어는 이미 (A)가 담당.
  - **(B) 지식확장(knowledge expansion) — 사람 승인 게이트 필수.** 라이브러리에 새 훈련법 *종류*를 추가하는 것만 외부 출처 필요. 에이전트는 **제안자(draft)**까지만, 승격(`approved=true`)은 사람/명시 배치만. coach-run에는 **승인된 구조화 규칙만** 주입(자유 웹텍스트 직접 주입 금지).
- 금지(확정): 에이전트가 트리거에 반응해 **자율로 웹 서칭 → 원문 저장 → approved 없이 코칭 자동 반영**하는 풀-자동 경로는 금지. 근거 위험: ①부상/안전(검증 안 된 처방 자동 적용) ②간접 프롬프트 인젝션/데이터 포이즈닝(웹텍스트→DB→프롬프트) ③저작권(원문 전문 저장 금지 — 기존 정책) ④환각/출처 신뢰 ⑤감사·롤백 불가.
- 이미 정합: `.harness/project/training-knowledge-ops.md`가 "요청 저장 시 웹검색/OpenAI 자동 실행 금지, 승인 전 코칭 미포함, 원문 전문 저장 금지, 요약+규칙만"을 이미 규정 → 본 결정은 그 위에 (A)/(B) 분리와 에이전트 자율 소싱 가드레일을 명문화.
- → 권위: `.harness/project/training-knowledge-ops.md`에 "자율 지식 소싱 가드레일" 섹션 추가. 안전 파이프라인 구현은 후속 이슈(트리거 정의·staging·관리자 승인 UI·인젝션 방어).

## 2026-06-16 - 훈련 스케줄 모델: 하이브리드 B(D-day 주기화 골격 + 적응형 재정렬) 확정
- 배경: 요약탭 개러지/라커룸 재설계 검토 중 현재 시스템의 세 약점 확인. (a) 목표를 받아도 **D-day까지 날짜별 스케줄을 안 짜고** 요일반복 `weeklyPattern`(예: 화 Easy+Strides/목 Tempo/토 LSD)을 무한 반복(`runStats.ts:getNextPlannedWorkout`). (b) "다른 훈련 제안"이 목표를 무시한 **기계적 한 단계 하향**일 뿐(`buildSessionIntentDraft.ts:easierAlternative`), 변경이 미래 일정에 파급 0. (c) 목표 예상이 **단일 기록 Riegel 외삽**(`performanceProjection.ts:toProjectionSignal`, 지수 1.06)이라 D-day까지의 훈련 궤적을 반영 못 하고 "현재 스냅샷"만.
- 조사: 전문 코치 실제 관행을 deep-research workflow로 5각도 검색·15+ 출처 fetch·3표 적대적 검증(2026-06-16). 근거 전문은 `.claude` memory `coach-scheduling-research`.
- 딥리서치 결론(검증 통과 claim 기준):
  - **주기화는 풀 골격을 미리 짠다(date-first/work-backward).** macrocycle→mesocycle(3~6주)→microcycle(1주), base→build→peak/competition→recovery. 레이스 날짜 고정 후 거꾸로 계산. 단 "경직된 고정물이 아니라 정기 검토 후 조정하는 살아있는 골격"(경직 플랜은 이득 10~15% 손실·부상위험↑).
  - **단일 세션 변경은 국소 처리**, 전체 파급 없음. 누적 이탈이 임계치를 넘을 때만 **목표일 고정 채 '오늘부터' forward 재계산**(Runna: 워크아웃 3개 초과 or 1주치 결손 트리거). ※ 임계 수치는 단일 벤더 제품 설계이지 보편 코칭 원칙 아님.
  - **기록 예측: 단일 Riegel 한계 명확** — 하프까지 OK, 마라톤은 절반 러너에서 10분+ 과대예측. **주간 훈련량+다중 기록 결합 모델이 우월**(MSE 380.7→208.3, 10분+ 과대예측 ~50%→~25%). 정립된 단일 표준식 없음(36연구/114식, R² 0.10~0.99) → 어떤 예측도 확정 아닌 **신뢰구간** 동반. Critical-speed/hyperbolic은 외삽 부적합(초장거리 과대예측), power-law가 더 안전. "적응형이 정적보다 성과 우월" 주장(bioRxiv)은 검증 만장일치 기각 — 적응형 가치는 성과극대화가 아니라 **현실 이탈 흡수**.
- 결정: **하이브리드 B 확정.** "D-day까지 풀 주기화 스케줄 생성 → 주간 단위 노출(요약탭 주간 캐러셀, 오늘 기준) → 하루치 변경은 국소 처리 → 누적 이탈/실측 추세가 임계치 초과 시 목표일 고정 forward 재정렬." 요일반복 `weeklyPattern`을 날짜축 주기화 스케줄로, 단일기록 Riegel 예측을 훈련량 결합+신뢰구간으로 교체. 순수 고정형/순수 적응형 롤링은 단독 기각.
- 에픽 #326(Adaptive Training Engine, 하위 #327~#339 전부 Closed/완료)과의 관계: #326은 "진화하는 요일패턴 + Phase 라벨 자동전환"까지 완성했으나 **날짜축 주기화 스케줄·forward 재정렬은 범위 밖**. 하이브리드 B는 #326 기반(온보딩 weeklyPattern 생성, `adaptive_training_metrics`/`training_phase_history` 스키마, Phase 상태머신) 위에 **시간축을 새로 얹는 후속 에픽**.
- 미결(후속 설계): (1) 주기화 골격 생성 방법론 차용(Daniels VDOT/Pfitzinger 등) (2) forward 재정렬 트리거 임계치·재계산 규칙 (3) 요약탭 개러지 IA·주간 캐러셀 와이어프레임(design-before-implementation 게이트) (4) "작전 바꾸기" 유효범위(그 주 vs 전체 일정). 착수 전 신규 에픽 Issue 분해 + 와이어프레임 합의 필요.
- 출처(검증 통과 1차/관행 근거):
  - 주기화 구조·살아있는 플랜: TrainingPeaks "Macrocycles, Mesocycles, and Microcycles" https://www.trainingpeaks.com/blog/macrocycles-mesocycles-and-microcycles-understanding-the-3-cycles-of-periodization/ ; 세션 조정 관행: Fleet Feet "Ask a Coach: How to Adjust Your Training Plan" https://www.fleetfeet.com/blog/ask-a-coach-how-to-adjust-your-training-plan ; 80/20 https://www.8020endurance.com/easy-ways-to-customize-your-readymade-endurance-training-plan/ ; Mile by Mile https://www.milebymileblog.com/adjust-training-for-missed-workouts/
  - 누적이탈 재정렬·forward 재계산(제품 사례): Runna 재정렬 https://support.runna.com/en/articles/10026375-how-to-use-the-plan-realignment-feature ; Runna 스케줄 조정 https://support.runna.com/en/articles/6206024-adjusting-your-running-schedule
  - 기록 예측 한계·우월 모델: Vickers & Vertosick 2016 (n=2,303) https://pmc.ncbi.nlm.nih.gov/articles/PMC5000509/ , https://bmcsportsscimedrehabil.biomedcentral.com/articles/10.1186/s13102-016-0052-y ; Keogh & Smyth 2019 systematic review (PMID 31575820) https://www.researchgate.net/publication/336163271_Prediction_Equations_for_Marathon_Performance_A_Systematic_Review ; Critical-speed 외삽 한계 Vandewalle 2018 https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6192093/ ; power-law vs hyperbolic Drake 2024 https://pubmed.ncbi.nlm.nih.gov/37563307/ ; 개인화 ML 예측 Qin/Lee/Kim 2025 https://www.nature.com/articles/s41598-025-25369-7
- 스키마 노트(F1 #363): `training_schedule.goal_id`는 **`text`** — `TrainingGoal.id`가 UUID 아닌 `goal-N`/`defaultGoalId` 문자열이라 의도적. 기존 `pacelab_session_intents.goal_id uuid`는 잠재 불일치(이 작업 산물 아님, 후속 정합 검토).
- 코드 리뷰(엔진 레이어): 핵심가치 5개 충족, blocker 2건(B1 주 앵커 첫주 비움→오늘 기준 롤링윈도우 / B2 Threshold 미생성→allocatePhases 추가) + should-fix(run_id stale 제거·테이퍼 점진감량·회복주 base 바닥·표본부족 신뢰구간 페널티) 반영. UI 레이어(C·D) 미배선은 의도(후속 phase).
- → 권위: `.harness/project/running-coaching-standards.md`에 "훈련 스케줄 모델(주기화)" 기준 추가. `.claude` memory `summary-page-garage-vision`·`coach-scheduling-research`.

## 2026-06-17 - 포스트런 인터뷰 정규화 + 코칭 데이터 B-하이브리드 정책
- 원칙: 인터뷰는 **HealthKit가 못 주는 주관 신호 중, 코칭 로직이 실제 소비하는 항목만** 묻는다(필드별 소비처 코드 확인).
  - 유지: RPE(난이도) — performanceProjection·sessionQuality·tempo/easy/recovery 적응이 소비. 통증(severity·부위) — 부상 회복 factor·적응이 소비.
  - 추가: **컨디션 점수(conditionScore)** — recoveryCycle/tempo 적응·trendInsights가 소비하는데 인터뷰가 안 받던 갭. 1~10(나쁨~좋음), RunForm과 동일.
  - 미수집: 수면(sleepQuality)·스트레스(stressLevel) — 로직 소비처 없음(묻는 비용만).
  - 자유메모 제거: workoutFeeling은 결정론 미사용·AI 전용 → 인터뷰에서 빼고 자유 표현은 **기존 세션 코치 대화(coach input bar, requestCoachRun)** 로 연계.
- 데이터 정책(B-하이브리드): **정규화 = 결정론 로직/상태의 단일 출처(SSOT)**, **자유텍스트 = AI 코치 대화·뉘앙스 전용**(로직·상태 미변경), **상태 변화는 제안→사용자 확인**(자유텍스트가 부상 severity 등 자동 변경 금지 — 안전, [[coach-always-on-block-deterministic]]).
- 후속 증분: (a) 통증 변화(나아짐/그대로/심해짐) 캡처 → 부상 severity 갱신 "제안" 코치 모먼트 (b) 추가런 이유 캡처 → extra-run 모먼트 분기 (c) 인터뷰 메모 입력 시 세션 코치 대화 자동 시드.
- → 권위: `.claude` memory `coach-proactive-communication-vision`. 인터뷰 = `PostRunInterviewSheet`/`buildInterviewRunPatch`.

## 2026-06-19 - 제안훈련 응답 완성 + 주간 정산 모델 + 주 고정 데이터-스트립(에픽 #362)
- 배경: 미래 카드 제안훈련에 승락 3종(제안대로/더쉽게/더강하게)만 있고 포기·조정·원본가시성·되돌리기가 없었다. 전제로 주간 정산(missed 확정 시점)이 모호했다. (전 세션 그릴·코치리뷰 통과, 본 세션 코드정합 후 확정)
- 두 시계 분리(코치 SSOT 승격): **주간 정산(닫힌 주, 월~일)=확정·결산·재정렬만 / 실시간 코칭=세션·부하가드·넛지**. 현재 주는 "열린 장부" — 지난 날도 open(따라잡기 가능), 주 닫혀야 missed 확정.
- 정산 단일 소유: `open→missed` 확정을 **`trainingScheduleStore.settleClosedWeeks(goalId, weekStart)` 하나로** 모음. `realign`은 미래 supersede+insert만(확정 책임 제거). `detectScheduleDeviation` 결손 경계를 today→**weekStart**로(닫힌 주만 집계 → 현재 주 미수행이 무한 재정렬 트리거 안 됨, B2 유지). `doEnsureSchedule`가 realign 시도 뒤 무조건 정산.
- `ScheduledSessionStatus`에 **`skipped`**(능동 포기, ≠ 수동 missed) 신설 + DB CHECK 마이그레이션(`202606190001`). skipped는 active/주간집계 제외, UI 카드 계속 보임·재시도 가능. periodizedSchedule/buildWeekSummary·scheduleRealign 윈도우 필터에서 superseded와 함께 제외.
- 액션 순수로직: `reschedule.ts`(proposeReschedule=**처방 보존 이동**[재파생 금지 #405]·주넘기 소프트경고 / proposeMoveToToday / proposeSwap=충돌해결) + `weeklyTriage.ts`(weeklyHardLoadGuard=harder 소프트경고 / weekEndTriage=키세션 하나 살리고 나머지 release). 충돌=**스왑**(더블/N세션은 후속 분리 — 현 모델 하루 1세션, 네이티브 6h minGap 동반 필요).
- IA 결정(사용자 합의·와이어프레임 게이트 통과): **데이-스트립을 오늘±롤링 → 월~일 고정**(주 페이징). 주가 정산·회고·트리아지의 단일 단위. open/missed/skipped를 캐러셀 상태로 추가, 안 뛴 날 탭 → 슬롯 인라인 액션 카드(오늘로/다른날로/놓아주기). 브리핑에 포기·조정·원본표시·되돌리기. 주말 트리아지 coachMoment+바텀시트.
- 아키텍처(#397 래칫): 새 코칭 순수로직이 entities 직접 import로 베이스라인(83)을 올리지 않도록, 타입을 코칭 허브(`periodizedSchedule` 재노출) 경유로 받음. 래칫 정합(역방향 엣지 0).
- 검증: harness:check(test 607 + vue-tsc build) 통과. 남은 게이트(웹 변경 정석 [[web-change-verify-render-and-migration]]): 렌더 E2E(되돌리기 실렌더 확인됨, 나머지 플로우 스팟체크) + 마이그레이션 `supabase db push`.
- 적용 범위: `src/entities/training-schedule/model.ts`, `supabase/migrations/202606190001_*`, `src/app/stores/trainingScheduleStore.ts`, `src/shared/lib/coaching/{scheduleRealign,periodizedSchedule,coachMoments,reschedule,weeklyTriage}.ts`, `src/pages/dashboard/{DashboardPage,SessionBriefingCard,WeekTrainingCarousel,RescheduleSheet,WeekendTriageSheet}.vue`, `.harness/project/running-coaching-standards.md`.
