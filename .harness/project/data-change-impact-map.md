# 데이터 변경 영향 맵 (Data Change Impact Map)

PaceLAB의 핵심 데이터/이벤트를 **건드리기 전에** "이걸 바꾸면 어디어디도 같이 봐야 하는지"를 한눈에 보는 **변경 전 필독 게이트**입니다. 진입점별로 하류(downstream) 연쇄를 트리로 펼치고, 각 노드에 `파일:라인`과 함정(gotchas)을 답니다.

관련 SSOT: [[critical-paths]] · [[domain-rules]] · [[architecture-rules]] · [[running-coaching-standards]] · [[running-injury-knowledge]]

---

## 사용법 (변경 전 이 맵을 먼저 본다)

1. **무엇을 바꾸려는지로 진입점을 찾는다.** 아래 8개 진입점 중 내 변경이 닿는 데이터/이벤트를 고른다.
   - 런이 들어옴(임포트/동기화) → [[#1. 런 인입 (runStore.addRuns / addRun → matchSessionIntent)]], [[#2. HealthKit 자동 동기화]]
   - 스케줄 상태가 바뀜(재정렬/정산/리스케줄/스킵/되돌리기/더블) → [[#3. doEnsureSchedule 오케스트레이션]], [[#5. 스케줄 변이 진입점]], [[#7. 페이스·체력 드리프트·재앵커]]
   - 부상 severity/status를 바꿈 → [[#4. 부상 severity/status 변경]]
   - 휴식 선언/복귀 램프 → [[#6. 휴식 선언 / 복귀 램프 (#473)]]
   - 런 삭제 → [[#8. runStore.deleteRun 역연쇄]]
   - 레이싱/self-race 유입 → [[#9. 레이싱/self-race 유입]]
   - 활성 목표 전환 → [[#10. 활성 목표 전환]]
   - 능동 코치 메시지(모먼트) → [[#11. 코치 모먼트 감지기]]
2. **해당 섹션의 노드 트리 전체를 위에서 아래로 훑는다.** 내 변경이 닿는 노드의 `mustCheck`와 섹션 끝 `gotchas`를 반드시 읽는다. "한 줄만 고치면 되는 것처럼 보여도" 하류가 길다 — 트리 전체가 같이 움직인다.
3. **코칭 도메인 노드(🩺 표시)에 닿으면** 구현 전에 [[running-coaching-standards]](부상이면 [[running-injury-knowledge]])를 선행하고, 커밋 시 `Coach-Review:` 트레일러 + `#전문코치리뷰` 교차검증 대상이다.
4. **여러 진입점에 동시에 걸치면** 둘 다 본다. 진입점들은 `doEnsureSchedule`·`memoryStore.update`·`matchSessionIntent`에서 서로 수렴한다.

### 갱신 규칙

- **노드/연쇄가 바뀌면 이 맵을 같이 갱신한다.** 진입점 코드(`파일:라인`)를 옮기거나 새 하류 소비처를 추가하면, 대응 노드의 `location`과 `mustCheck`를 함께 고친다. 라인 번호는 시간이 지나면 어긋나므로 **노드 이름·함수명**을 1차 기준으로 보고 라인은 보조로 본다.
- **새 진입점이 생기면 섹션을 추가**하고 위 사용법의 진입점 목록에도 등록한다.
- **함정(gotcha)을 새로 발견하면** 해당 섹션 `gotchas`에 1줄로 추가한다. 특히 시점 경합(순서) / 신뢰 시점(어떤 status·스냅샷) / 스냅샷 화석화 / status만 바뀜 / 다중 유입경로 / best-effort 무음 / Supabase no-op 7대 패턴은 거의 모든 진입점에 공통이므로, 새 진입점도 이 7개 렌즈로 점검한다.
- **한 개념이 여러 섹션에 흩어져 있으면** [[#부록: 진입점 간 수렴점 (어디서 만나는가)]]의 "교차-섹션 충돌 개념" 표에 등록한다. 충돌은 대개 "한 변경자가 한 섹션만 보고 다른 섹션을 놓쳐서" 나므로, 그 표가 착지 보장 장치다.
- 이 맵은 "읽기 전용 안내"다 — 진실의 출처는 코드와 각 SSOT 문서다. 코드와 어긋나면 코드를 따르고 맵을 고친다.

### 거의 모든 진입점에 공통인 7대 함정 패턴 (체크리스트)

- **① 시점 경합 (함수 호출 순서·같은 틱)**: `addRuns→matchSessionIntent`는 동기 직후 실행, 그런데 self-race 태그는 `linkPendingResults`가 늦게 붙임 → 그 찰나 처방을 잘못 소비. `healSelfRaceLink`가 같은 틱 안전망. **이 종류 경합은 정적·단발 E2E로 못 잡는다** — 누가 먼저 이기느냐가 비결정적이라, 실기기/반복 실행/`devE2ESeed` 결정론 시드로만 재현된다([[auth-e2e-account-state-and-seed-safety]]). "내 변경은 순서를 안 건드린다"고 ②를 면제받지 못한다.
- **② 신뢰 시점 (어떤 status·스냅샷을 '지금 진실'로 읽나)**: ①과 구분된다 — 호출 순서를 다 지켜도, "지금 오늘 세션이 뭐냐"를 어떤 status 집합(`planned`만? `missed` 포함? `rested`/`superseded` 제외?)으로 또는 어느 스냅샷(라이브 vs 화석)으로 읽느냐가 틀리면 거짓 단정이 난다. 새 단정·라벨을 만들 때는 "내가 신뢰하는 status 술어가 데이-스트립·브리핑과 같은 SSOT인가"를 명시 점검.
- **③ 스냅샷 화석화 vs 재추론/재정렬**: 런 type·세션의도·부상 스냅샷은 생성 시점에 박제 → 나중 재추론/재정렬과 어긋남. `reinfer→ensureSchedule→ensureTodayIntent` 순서 강제로 방어. 단 **이미 닫힌 의도(completed/superseded)는 순서를 지켜도 소급 변조되지 않아 화석으로 남는다** — 강도/타입 강등과 충돌(#6↔#3).
- **④ status만 바뀜(행은 안 지움)**: `done/completed/rested/superseded/skipped`는 active 뷰 필터에서 빠질 뿐 데이터는 살아있음 → "화면 소실 ≠ 데이터 소실".
- **⑤ 다중 유입경로**: 같은 데이터가 여러 경로로 들어옴(정규 sync/마이그레이션/importCompetitionRun/repair, 편집/체크인 등) → 한 곳만 고치면 멱등성 깨짐.
- **⑥ best-effort try/catch 무음**: 매칭/정합/적응은 대부분 catch 무음 → 정적검사로 회귀 못 잡음, 라이브/렌더 E2E 필요([[web-change-verify-render-and-migration]]).
- **⑦ Supabase 미설정 시 no-op**: 세션·의도·정합 액션은 `isSupabaseConfigured=false`면 조용히 return → 로컬 QA는 이 경로 안 탐.

---

## #1. 런 인입 (runStore.addRuns / addRun → matchSessionIntent)

런이 `runs[]`에 들어올 때 함께 변경·확인해야 할 모든 노드. 입력 `ExtractedRunData` 모양을 바꾸면 하류 매칭·집계 전부가 영향받는다.

진입점: [[runStore]] · 차단점: [[matchSessionIntent]] · 정합 SSOT: [[doEnsureSchedule]]

```
runStore.addRun() / addRuns()                              src/app/stores/runStore.ts:62/91 (push :87/95/119)
├─ matchSessionIntent(run)                                 runStore.ts:298  ← SELF_RACE_TAG 가드 1순위
│  ├─ sessionIntentStore.matchRun → selectIntentForRun     sessionIntentStore.ts:83 / matchSessionIntent.ts:23 (윈도우 ±1 :14)
│  │  └─ 의도 done 소비처 (디브리핑 달성 / MemoryPage)      sessionIntentStore.ts:96 (unmatchRun)
│  └─ trainingScheduleStore.matchRun → selectSessionForRun trainingScheduleStore.ts:192 / model.ts:133 (윈도우 :122)
│     └─ settleClosedWeeks (매칭 누락 시 missed 오확정)      trainingScheduleStore.ts:101
├─ flagInterviewForImport → pendingInterviewRunId          runStore.ts:125 (state :29)  ← addRuns만, source==='healthkit'만
│  └─ App.vue PostRunInterviewSheet 발동/제출              App.vue:51/53/887 / buildInterviewRunPatch.ts:47
└─ (반응형) DashboardPage runs/trainingRuns/sortedRuns 재계산  DashboardPage.vue:117/120
   ├─ chronicLoad (getChronicLoadTrend)                    DashboardPage.vue:320 → currentWeeklyKm:322 / restGuidance:843 / coachMoments:853
   ├─ raceProjection (getRaceProjection)                   DashboardPage.vue:181 (benchmark :187 / goalProgress :853)
   ├─ nextSession (getNextSessionRecommendation)           DashboardPage.vue:128 (상세 StackPage :2001)  ← runs.value(레이싱 포함) 입력!
   ├─ coachMoments / topCoachMoment 🩺                     DashboardPage.vue:853/888 / coachMoments.ts
   ├─ restGuidance / evaluateExtraRun 🩺                    DashboardPage.vue:843/763 / restGuidance.ts
   └─ doEnsureSchedule 정합 파이프라인 (마운트/포커스)      DashboardPage.vue:415-517  → #3 참조
      ├─ reinferMislabeledLongRuns (로드타임 타입 치유)     runStore.ts:164 (호출 DashboardPage.vue:1386)
      ├─ reconcileRuns / repointReinferredRuns             trainingScheduleStore.ts:204/223
      ├─ 처방 채택(shouldAdoptPrescribedRunType, 2026-07-05)  entities/training-schedule/model.ts (호출 useTrainingWeek ensure 파이프라인, repoint 뒤)
      │   — done 연결된 롱런 계열 처방을 70%+ 이행한 Easy/Recovery 라벨 런 → 처방 타입 채택(+tag type:prescribed).
      │     초보 램프 짧은 LSD(<10km)가 inferRunType 게이트에 안 걸리는 갭 보정. type:user·self-race 제외.
      └─ settleClosedWeeks                                 trainingScheduleStore.ts:101 (호출 :511)
```

**상류 진입점(런을 넣는 쪽):**
- `healthKitSyncStore` 인입 게이트 + self-race 태깅 + `importCompetitionRun` — `healthKitSyncStore.ts:191/248/357` (addRuns), `:486` (isAfterLatestSaved), `:508` (denylist), `:305` (importCompetitionRun), `:570` (self-race 태그)
- `competitionStore.linkPendingResults / reclaimResultsForRun` (지연 self-race 태깅) — `competitionStore.ts:109` / `runStore.ts:273` (healSelfRaceLinks), `:285` (healSelfRaceLink)

**핵심 mustCheck:**
- `addRun`(단건)은 `matchSessionIntent`만 호출, `flagInterviewForImport`는 **안 함**(인터뷰 비대칭 — 단건=UploadRunPage 수기 입력은 인터뷰 미발동). 인터뷰는 `addRuns` + `source==='healthkit'`에서만.
- `matchSessionIntent`의 `SELF_RACE_TAG` 가드(`runStore.ts:302`)가 1순위. 태그가 **늦게** 붙는 경로(`linkPendingResults`, `healKitBridge`)면 가드를 못 타고 처방 세션을 잘못 소비 → `healSelfRaceLink`(unlink+unmatch)가 안전망.
- `run.type`·`run.startAt`·`run.date`가 `selectSessionForRun`의 슬롯(AM/PM)·타입 매칭에 직결. `startAt` 누락이면 슬롯 중립, `type` 누락이면 typeRank 무력.

**gotchas:**
- 시점 경합(지연 self-race 태깅, 7대 함정 ①): `addRuns→matchSessionIntent`는 동기 직후, 레이싱은 `linkPendingResults`가 나중에 태그를 붙임 → 그 찰나 부상복귀 Easy 등 처방 세션·의도를 done/completed로 잘못 소비. `healSelfRaceLink`가 같은 틱 안전망, `doEnsureSchedule`의 `healSelfRaceLinks`가 다음 마운트 청소. (#235 50m 레이싱이 처방을 '완료'로 먹던 버그) **비결정 경합이라 단발 E2E로 못 잡음 — 실기기/반복/`devE2ESeed` 시드 필수([[auth-e2e-account-state-and-seed-safety]]).**
- 다중 유입경로 비대칭: `addRun`(단건)은 인터뷰 미발동. `importCompetitionRun`도 `'healthkit'` source로 `addRuns`를 타므로 레이싱 임포트가 인터뷰를 띄울 수 있음(self-race 필터 부재).
- 스냅샷 화석화 vs 재추론: 런 type은 임포트 시점 고정. forward 수정만으론 과거 오분류 안 고쳐짐 → 로드타임 `reinferMislabeledLongRuns`(멱등)가 교정, `repointReinferredRuns`가 세션 재연결. 인입 당시 type과 재추론 type이 달라질 수 있음.
- status만 바뀜: `matchRun`은 status를 planned→done / planned→completed로 바꿀 뿐 행을 안 지움. active 뷰 필터에서 빠져 '오늘 세션 카드'가 사라진 듯 보임(데이터 소실 아님, #235 교훈).
- 정합 누락→missed 오확정: `addRuns` 시점 `matchRun`은 '그 런 1건·±1일'만 처리. 진짜 일괄 정합은 `doEnsureSchedule.reconcileRuns`. 그게 `settleClosedWeeks` 전에 안 돌면 수행 세션이 missed로 오확정→디브리핑 달성카드 소실(#378). 순서 절대조건: heal→reconcile→repoint→settle.
- 멱등 도돌이(self-race 재부착): `reconcile/repoint` 입력에서 self-race를 안 빼면 heal이 떼어낸 세션을 reconcile이 다시 done으로 붙여 무한 도돌이. 두 곳(trainingRuns computed, doEnsureSchedule 별도 filter)이 같은 `isSelfRaceRun` 규칙 중복 보유.
- Supabase 미설정 시 무음 no-op: 매칭/정합 액션 전부 `isSupabaseConfigured=false`면 조용히 return. 로컬 모드는 런만 localStorage에 쌓이고 done 표시·디브리핑 없음.
- best-effort try/catch가 실패를 삼킴: `matchSessionIntent` 두 await 모두 catch 무음 → 매칭이 조용히 실패해도 런은 남고 세션은 planned로. 라이브/렌더 E2E 필요.
- 반응형 연쇄 비용: `runs.push` 한 번이 chronicLoad·raceProjection·nextSession·coachMoments·restGuidance·injuryCoachSignals를 동시 재계산. `ensureSchedule`은 ensureInFlight 가드가 있지만 `matchRun` 자체는 가드 없음.
- 🩺 코칭 도메인: coachMoments·restGuidance·nextSession·raceProjection은 [[running-coaching-standards]] 대상. 처방·디브리핑 로직 변경 시 Coach-Review·#전문코치리뷰.

---

## #2. HealthKit 자동 동기화

`addRuns('healthkit')` 이후 매칭·결과·적응·인터뷰·반응형 재계산 노드. 4개 유입경로(정규/마이그레이션/importCompetitionRun/repair)가 같은 하류를 공유한다.

진입점: [[useHealthKitSyncStore]] · 차단점: [[matchSessionIntent]] · 적응: [[applyTempoCeilingAdaptation]]

```
useHealthKitSyncStore.handleRuns / handleHistoricalMigrationRuns   healthKitSyncStore.ts:171-231 / 232-272
├─ runStore.addRuns(items,'healthkit')                             runStore.ts:91-123
│  ├─ matchSessionIntent(run)  (self-race면 early-return :302)      runStore.ts:298-314
│  │  ├─ sessionIntentStore.matchRun → matchSessionIntentToRun(DB)  sessionIntentStore.ts:83-91 (unmatchRun :96)
│  │  └─ trainingScheduleStore.matchRun → setStatus(done,runId)     trainingScheduleStore.ts:192-198
│  └─ flagInterviewForImport → pendingInterviewRunId               runStore.ts:125-131 → App.vue:51/53/887 → buildInterviewRunPatch.ts
├─ notifyHealthKitNewRuns(settings, insertedCount)                 healthKitSyncStore.ts:193 → notificationBridge.ts:27
├─ linkSelfRaceResults → competitionStore.linkPendingResults       healthKitSyncStore.ts:222/260/360/406 → competitionStore.ts:83-144
│  └─ addResult → CompetitionResult + 레벨/업적 보상                competitionStore.ts:120-144 → App.vue:82-102 (syncRewards)
├─ applyTempoCeilingAdaptation → memoryStore.update(tempoCeiling)🩺 healthKitSyncStore.ts:223/416 → tempoAdaptation.ts
│     readers: trendInsights.ts:148 / AppHeader.vue:152 / MemoryPage.vue:208 / buildSessionIntentDraft.ts:52 / performanceProjection.ts:225
├─ App.vue watch(lastChangedAt) → requestInjuryCheckInPrompt       App.vue:284-287
├─ DashboardPage 재계산: reinferRunTypesOnce → doEnsureSchedule    DashboardPage.vue:1382-1411 / 415-551  → #3 참조
└─ repairExistingHealthKitRuns / mergeHealthKitRepairTags          healthKitSyncStore.ts:528-590 (self-race 태그 주입 :566)
```

**핵심 mustCheck:**
- 두 경로(정규/마이그레이션)가 같은 하류(addRuns→link→tempo)를 호출 → 한쪽 수정 시 다른쪽 미러. 마이그레이션은 `releaseDeniedForCandidates`(:244)로 deny-list를 풀고 들어옴(정규와 다름).
- `isAfterLatestSaved`의 strict `>`(:487)는 '같은 날 이미 기록 있으면' 같은날 새 런 누락 → `importCompetitionRun`이 externalId 단건으로 우회.
- Supabase 경로만 matchSessionIntent/flagInterview 발화, 로컬 경로(:103-122)는 flagInterview만.
- `applyTempoCeilingAdaptation`: `memoryStore.loaded` 가드(:421) 필수(기본값 덮어쓰기 사고 방지), 상향만, 부상 시 차단. 채택값(adoptedBpm) 변경이 처방 페이스·추세·표시를 자동 진화시킴 → 공식 변경 시 위 4 reader + 처방·캡 동시 점검.

**gotchas:**
- 시점 경합(정규 sync vs importCompetitionRun): 같은 워크아웃이 정규 sync로 '무태그' 먼저 유입되면 matchSessionIntent가 처방을 done으로 소비. 뒤늦은 linkPendingResults가 태그 붙인 직후 `healSelfRaceLink`(competitionStore.ts:114)로 같은 틱 되돌려야 함. 둘 다 'healthkit' source라 비결정적.
- `isAfterLatestSaved` strict `>`: 오늘 이미 기록 있으면 같은 날 새 런(특히 레이싱) 통째 누락. importCompetitionRun이 날짜필터 없이 우회(:305). 정규 sync만 고치면 재발.
- status만 바뀜·done이 active 뷰서 빠짐: 잘못 매칭되면 실제 수행 세션이 planned로 남아 settleClosedWeeks가 missed로 오확정 + 디브리핑 달성률 카드 소실(runStore.ts:96-98 주석).
- 스냅샷 화석화: sessionIntent는 처방 시점 타입으로 박제 — 스케줄(복귀램프/realign)이 세션 타입 재작성 '전에' 의도가 만들어지면 폐기된 처방으로 채점. `reinfer→ensureSchedule→ensureTodayIntent` 순서 강제(DashboardPage.vue:1401-1408).
- 다중 유입경로(4개): (1)정규 handleRuns (2)과거 handleHistoricalMigrationRuns(deny 무시·해제) (3)importCompetitionRun(self-race 단건) (4)handleRunUpdate/repair. 각 경로의 self-race 태깅·dedupe·deny·matchSessionIntent 발화가 달라 한 곳 변경 시 4경로 멱등성 동시 검증.
- deny-list 비대칭: isAlreadySaved(:508)·importCompetitionRun(:348)은 deny로 차단, 과거 마이그레이션(:244)은 사용자가 직접 부른 것이라 deny 해제. deny 영속 실패 시 in-memory만 막혀 다음 부팅 fetch가 덮음.
- Tempo 적응 영속의 silent 가드: loaded 아니면 no-op, 상향만, 부상 시 차단. 적응 공식 수정은 사용자에게 무음으로 처방을 바꿈 → Coach-Review 게이트.
- persist 머지 경합: applyTempoCeilingAdaptation·persistScheduleAnchor·phase 전환·인터뷰 patch가 모두 `memoryStore.update(adaptiveTrainingProfile 스프레드 머지)`를 같은 틱 근처에서 호출 — 마지막 쓰기가 이김. 서로 필드 안 덮는지 확인.
- best-effort try/catch 무음 / 로컬 vs Supabase 분기: 위 공통 패턴 참조.

---

## #3. doEnsureSchedule 오케스트레이션

스케줄 게이트 orchestrator. realign/settle를 비롯한 모든 자동 변이가 **고정된 순서**로 실행된다. 어떤 진입점을 손대도 이 순서 불변식과 함께 봐야 한다.

진입점: [[doEnsureSchedule]] · 순서 절대조건: heal→reconcile→repoint→(build/ramp/realign)→settle→declareRest 재적용

```
ensureSchedule() in-flight 가드                            DashboardPage.vue:387-395 (ensureInFlight)
└─ doEnsureSchedule()                                      DashboardPage.vue:415-522 (전체 try/catch :519)
   ├─ ① runStore.healSelfRaceLinks()                       runStore.ts:273 (단건 :284, unlink scheduleStore:242)
   ├─ ② reconcileRuns(trainingRunsForSchedule)             trainingScheduleStore.ts:204 (selectSessionForRun model.ts:133)
   ├─ ③ repointReinferredRuns(trainingRunsForSchedule)     trainingScheduleStore.ts:223 (selectBetterTypeMatchForRun model.ts:173)
   ├─ ④ 분기:
   │  ├─ A 비성과: buildSteadyWeeklyRhythm→insertMany→persistAnchor   DashboardPage.vue:440-455
   │  ├─ B 성과·콜드스타트: buildPeriodizedSchedule→insertMany→persistAnchor  DashboardPage.vue:456-468
   │  ├─ C-1 자연만료 복귀램프: unrestFrom→returnRampPayload→applyReturnRampDrafts  DashboardPage.vue:469-483/530/542
   │  └─ C-2 운영중 재정렬: buildRealignedSchedule→realign→persistAnchor→deviation토스트  DashboardPage.vue:484-507
   ├─ ⑤ settleClosedWeeks(goalId, trainingWeekRange(today).start)  DashboardPage.vue:509-511 / store:101
   └─ ⑥ declareRest 멱등 재적용 (untilDate>=오늘)            DashboardPage.vue:512-518 / store:119
선행: reinferRunTypesOnce()  (ensure 직전)                  DashboardPage.vue:1382-1397 / runStore.ts:164
후행: ensureTodayIntent()    (ensure 직후)                  DashboardPage.vue:1352-1359 / sessionIntentStore.ts:68
하류 표시:
   ├─ scheduleStore.sessions → scheduleDays 캐러셀          DashboardPage.vue:562-593
   ├─ activeSession / activeSessions / activeOpenSession    DashboardPage.vue:640-659
   ├─ weekSummary / detectScheduleDeviation / doubleSuggestion / weekendTriage  DashboardPage.vue:631/817/848/1205/1255
   ├─ 코칭 컨텍스트(coach-run) 주입 — sessions·runId 집합 🩺  DashboardPage.vue:747-761/848
   └─ persistScheduleAnchor → memoryStore.adaptiveTrainingProfile.scheduleAnchorWeeklyKm  DashboardPage.vue:401-413
```

**핵심 mustCheck (순서 절대조건):**
- ① heal→reconcile→settle, reconcile/repoint 입력에서 self-race 제외(:429) 안 하면 heal이 떼도 reconcile이 다시 붙이는 도돌이.
- ② realign이 settle보다 **먼저** — 닫힌 주 누락이 detectScheduleDeviation 트리거로 먼저 평가된 뒤 settle가 missed로 확정해야 무한 재정렬 안 남.
- ③ settle 뒤 declareRest 재적용 — realign/콜드스타트가 휴식 구간에 planned를 새로 깔면 다시 rested로 복원(닦달 차단).
- 전체가 `try/catch{}`로 통째 삼킴(:519) → 새 단계 추가 시 silent failure 주의.

**gotchas:**
- 시점 경합(in-flight 단일화): watch 3개(loaded / activeGoal.id / returnFromRestNow·onDeclareRest)가 한 ensureInFlight로 직렬화. `returnFromRestNow`는 'ensure watcher가 loaded·goalId만 보고 activeRest엔 안 묶인다'는 전제로 drain 후 재호출(:1123). 향후 activeRest를 watcher에 묶으면 가정 붕괴 → 가드 재도입 필요.
- 순서 절대조건 heal→reconcile→repoint→settle: 어긋나면 (a)도돌이 (b)수행 런 missed 오확정 (c)더블 오매칭이 missed로 굳음.
- reinfer→ensure→ensureTodayIntent 순서(:1406-1408): reinfer 먼저여야 repoint가 새 타입을 봄. ensureTodayIntent가 ensure 뒤여야 램프가 Easy로 낮춘 타입으로 의도 생성 — 아니면 폐기된 'Easy+Strides' 처방으로 디브리핑 채점되는 화석(#473).
- 스냅샷 화석화: `ensureIntentFor`는 planned 의도만 타입 동기화, completed/skipped/superseded는 안 건드림(소급 변조 금지). 이미 completed된 의도는 옛 타입 영구 박제 — 의도된 동작이나 '왜 어제 채점이 새 타입과 다른가' 혼란의 근원. **→ 복귀 램프의 강도/타입 강등(capReturnSession)과 충돌하는 경로는 [[#6. 휴식 선언 / 복귀 램프 (#473)]]: 강등이 닫힌 의도를 못 고쳐 폐기 강도로 채점된다. 순서 준수로 안 풀린다.**
- rested가 active 뷰서 빠짐 + supersede가 rested를 안 건드림: `sessionOnDate/sessionsOnDate`(isActiveSession)은 planned|missed만. `supersedeSessionsFrom`도 rested를 안 비움 → 자연만료 복귀에서 unrestFrom 선행 빼면 옛 rested 잔존(💤) 또는 같은날 rested+planned 공존(:476-480 가드).
- status만 바뀜(done↔planned 왕복): repoint는 잘못 크레딧된 세션을 planned로 '되돌리기만' 하고 missed 확정은 settle에 맡김. 둘 순서 어긋나면 planned로 잠깐 떠 '오늘 할 일' 오인.
- done이 active 뷰서 빠짐 + self-race done 금지: 캐러셀은 run 유무로 done을 그림. 단 self-race만 있는 날은 done 금지(레이싱≠훈련완료) — trainingRuns 기준으로 도출(:570).
- 다중 유입경로: loaded-watch(immediate)·activeGoal.id 전환·returnFromRestNow·onDeclareRest·runScheduleOp 핸들러에서 호출. activeGoal.id 전환 watch(:1418)는 prev==null 스킵(초기는 loaded-watch 담당) — 조건 바꾸면 콜드스타트 이중 빌드.
- self-race 첫 수렴 가짜 토스트: self-race를 부하서 빼는 첫 빌드는 weeklyKm 한 단계↓ → '체력 변화' deviation 토스트 1회 오발. `selfRaceAnchorSettledOnce`(세션 플래그)+suppressSelfRaceDrift로 1회만 억제(:500). 새로고침마다 리셋.
- 앵커 미초기화 가짜 재정렬: 기존 사용자 첫 부팅 scheduleAnchorWeeklyKm null → anchorForCheck를 currentWeeklyKm로 즉시 초기화하고 넘겨야 ratio≈1 드리프트 비발동(:490). 빼면 매부팅 가짜 forward 재정렬+닦달.
- best-effort 무음 / Supabase 전용 게이트: 위 공통 패턴 참조.

---

## #4. 부상 severity/status 변경

부상 severity/status 변경이 흐르는 4대 경로(준비도/예측 · 추천 · 추세/coachMoments · AI코칭) + 진입/스냅샷/게이트. 🩺 전 노드가 코칭 도메인이다.

진입점(라이터 2개): [[MemoryPage]] 편집 · [[App.vue]] 체크인 · 공통 입구: [[getActiveInjuryItem]]
SSOT: [[running-injury-knowledge]] · [[injury-impact-paths]]

```
편집 진입점: updateInjuryAreas/addInjury/updateInjury (draft)   MemoryPage.vue:601-659 (deriveSeverity :652) → save :736
체크인 라이터: App.vue submitInjuryCheckIn (별개 라이터)        App.vue:527-571 (severity :561, lastFlareDate :564, resolved :567)
└─ memoryStore.update → normalizeTrainingMemory/normalizeInjuryItems  model.ts:769-805 (activeInjuryItemId 재배정 :795, severity 재파생 :1308)
   └─ getActiveInjuryItem (4대 경로 공통 입구)                 model.ts:668-671
      ├─ [경로1 준비도/예측] getRaceProjection→getInjuryRecoveryFactor  performanceProjection.ts:69-96 / 303-320
      │  └─ 소비처 4곳: DashboardPage 준비도 :182 / trendInsights goalLens :223 / CoachSessionOverlay :58 / buildSessionIntentDraft :14
      ├─ [경로2 추천] getNextSessionRecommendation→applyInjuryGate/applyPreviousInjuryRisk  runStats.ts:224-280 (gate :389, prevRisk :374)
      │  └─ 소비처: DashboardPage nextSession :128/1476/2007 (shouldOfferRecoveryRun :368)
      ├─ [경로3 추세/coachMoments] collectCoachMoments(ctx.injury)  coachMoments.ts:294-348 (DETECTORS :507) / ctx DashboardPage:853-861
      │  └─ 활성부상 watch→isInjuryProbeEligible→injuryProbeSnapshot→painProbeCtx→detectPainProbe  DashboardPage.vue:147-167 / model.ts:684-709
      ├─ [경로4 AI코칭] buildInjuryCoachSignals→injurySignals→coach-run §5  injurySignals.ts:143-169 / DashboardPage:133 / coachRepository:107
      ├─ evaluateDoubleEligibility (더블 게이트 — status만 봄)    doubleSession.ts:152-194 (injuryMet :161)
      └─ getRecentInjuryHistory (전역 12개월 재부상 위험창)       model.ts:739-757 → runStats.ts:272 / App.vue:3 / coachRepository:99
coach-run 별도 입구(시점필터): getActiveInjuryItemForRunDate     coach-run/index.ts:962-964/1288-1295
└─ buildInjuryContextSnapshot → coach_reports.injury_context_snapshot (화석화)  coach-run/index.ts:240-296 / 표시 CoachSessionOverlay:654
```

**핵심 mustCheck:**
- severity는 areas 편집으로 자동 재파생, status는 수동 → 분리돼 status만 바꿔도 severity가 stale일 수 있음. `deriveInjurySeverity`가 areas 기반 SSOT라 사용자 수동 severity를 정규화에서 덮어쓸 수 있음.
- status를 resolved/archived로 바꾸면 `getActiveInjuryItem`이 다른 active 부상으로 갈아타거나 null → 4대 경로 입력이 동시에 바뀜.
- coach-run은 라이브 `getActiveInjuryItem`이 아니라 시점필터 `getActiveInjuryItemForRunDate`를 씀 → 두 입구가 다른 활성 부상을 볼 수 있음(의도).

**gotchas:**
- 시점 경합(라이터 2개): MemoryPage 편집(:649/652)과 App.vue 체크인(:561/567)이 각각 cloneMemory→update로 전체 memory를 덮어씀 → 한쪽 in-flight 중 다른 쪽 저장 시 유실. 편집/체크인 간 공유 가드 없음(onMomentSelect는 probeSaving 가드 있음).
- status만 바뀜 vs severity만 바뀜: `applyInjuryGate`·`getInjuryRecoveryFactor`는 severity로 가르지만 `evaluateDoubleEligibility`는 severity 무시·status만 봄. severity 4→1로 낮춰도 더블 게이트 안 풀리고, status를 resolved로만 내리면 강도 게이트는 꺼지지만 12개월 위험창·applyPreviousInjuryRisk는 살아남음.
- watch가 id에만 반응(프로브 재발화 누락): `DashboardPage:148 watch(activeInjury.value?.id)`는 같은 부상의 status active→monitoring 전환·severity 변경엔 재발화 안 함. injuryProbeSnapshot이 stale인 채 게이트와 어긋날 수 있음.
- done/resolved 연쇄 토글: active→resolved면 `detectInjuryEscalation`은 꺼지고 `detectPainFollowup` 억제가 풀려 '부상 등록 권유' 모먼트가 정반대로 다시 켜짐.
- 스냅샷 화석화 vs 라이브: `buildInjuryContextSnapshot`(:240)이 그때 severity/status를 jsonb로 얼려 저장(CoachSessionOverlay '🩹 당시 부상'). 지금 값을 바꿔도 과거 리포트는 당시값 유지 — 표시/마이그레이션 변경 시 라이브+화석 둘 다 점검(배포: 마이그→coach-run→웹).
- severity null 기본값 차이: `getInjuryRecoveryFactor`는 `severity ?? 2`, `applyInjuryGate`는 `?? 0`, `buildInjuryCoachSignals`는 null 그대로 전달 → null일 때 세 경로 다르게 동작.
- 정규화가 사용자 severity 덮어씀: `normalizeInjuryItems`(:1308)와 `updateInjuryAreas`(:652)가 areas 기준 재파생 → 수동 severity가 save 후 덮어써짐('왜 내 값이 안 남지' 버그 후보).
- resolved와 archived 분기 차이: `getRecentInjuryHistory`는 archived만 제외·resolved는 12개월 이내 포함, `isInjuryProbeEligible`은 둘 다 불가, gate들은 둘 다 해제. status 값 선택이 4대 경로에 비대칭 전파.

---

## #5. 스케줄 변이 진입점 (realign/settle/reschedule/skip/revert/addDouble)

스케줄 status를 바꾸는 진입점들의 하류. 모든 자동 변이는 [[doEnsureSchedule]](#3)에서 고정 순서로 실행되고, 수동 변이(reschedule/skip/revert/addDouble)는 별도 핸들러다.

진입점: [[doEnsureSchedule]] (자동) · runScheduleOp 핸들러 (수동) · 매칭축: [[selectSessionForRun]]

```
trainingScheduleStore (변이 함수군)
├─ realign + supersedeSessionsFrom                         store:88-95 / repository:96 (planned/missed만 비움, rested 보존)
├─ settleClosedWeeks (정산 단일소유)                        store:96-107 / repository markPastPlannedMissed:112
├─ reschedule / proposeReschedule·Swap·MoveToToday         store:150 / reschedule.ts:52 (draftFrom 처방 보존 :35)
│     호출 DashboardPage onDayMove/openReschedule :1014/1172, 더블 :1299
├─ skip (능동 사용자 의사)                                  store:108-111 / setStatus:247 (run_id 강제 null)
├─ revert (작전 되돌리기)                                   store:182-187 (호출 :1005)
├─ addDouble + evaluateDoubleEligibility/buildPmEasy/proposeDouble  store:164-181 / doubleSession.ts:152/221/300
├─ 런↔세션 매칭축: selectSessionForRun/matchRun/reconcile/repoint/unlink  store:192-246 / model.ts:133/173
└─ 휴식·복귀축: declareRest/unrestFrom/markSessionsRested/unmarkRestedFrom  store:119-145  → #6 참조
하류 표시·소비:
├─ 캐러셀 데이-스트립 scheduleDays (월~일 고정)             DashboardPage.vue:562-593
├─ weekMission / weekSummary / activeExtraEval             DashboardPage.vue:813/631/750/846
├─ activeSession/activeBriefing + ensureTodayIntent/intentArgs 🩺  DashboardPage.vue:640/689/1324/1398
├─ CoachSessionOverlay upcomingSchedule (AI 코치 주입) 🩺   CoachSessionOverlay.vue:405 / store upcoming:49
├─ RunLogPage done-runId 세트                              RunLogPage.vue:390 (load :141)
└─ selfRace 회복 (다중 유입경로)                            runStore healSelfRaceLinks:273 / isSelfRaceRun 필터 DashboardPage:429/572/822
```

**핵심 mustCheck:**
- `reschedule`의 `draftFrom`(:35)은 prescription을 얕은복제로 보존 — 페이스 라벨 재계산하면 #405 관측 Easy 페이스 퇴행 회귀. crossesWeek는 경고만(막지 않음, 사용자 주권).
- `skip`(능동)과 `missed`(수동적 정산)는 다른 의미. isActiveSession은 둘 다 제외하지만 캐러셀 state·doubleSession 백로그·weeklyTriage에서 구분.
- `setStatus`는 status!=='done'이면 run_id 강제 null(repository :64) — skip/revert/missed 전환이 stale runId 비움.
- `addDouble`: 부하·적격 게이트는 store가 아니라 coachinglib 책임(store↔coaching 의존 회피). slot 변경은 `selectSessionForRun`의 slotRank로 런 매칭 결정성에 직결.

**gotchas:**
- 순서 경합(절대조건): heal→reconcile→repoint→(build/ramp/realign)→settle→declareRest 재적용. realign이 settle보다 먼저, reconcile/repoint는 settle 전. (#3과 동일)
- 스냅샷 화석화: SessionIntent가 ensureSchedule 전에 만들어지면 폐기 처방으로 채점. reschedule의 draftFrom은 prescription 보존 필수(#405).
- status만 바뀜 / done이 active 뷰서 빠짐: isActiveSession=planned|missed만. upcoming=isPlannedSession(planned&&!runId)만. settle/skip/rest/realign이 status만 바꿔도 캐러셀·미션·AI코치 upcoming·런로그 귀속이 동시에 달라짐. 캐러셀 done은 세션 runId 링크가 아니라 trainingRuns.find(그 날 실주행, 레이싱 제외)로 도출.
- rested(휴식) 자매 버그: realign이 rested 위에 planned 덮으면 같은날 공존·복귀 후 💤 잔존. unrestFrom(:480)·declareRest 재적용(:515)이 가드. summarizeUpcomingWeek·weeklyHardLoadGuard·detectScheduleDeviation 모두 rested를 부하/누락에서 빼야 '휴식인데 재정렬' 자가모순 방지.
- 다중 유입경로 경합: self-race가 부상복귀 Easy를 done으로 먹던 버그 — matchSessionIntent(:302)·입력 필터(:429)·healSelfRaceLink 세 군데서 막음. HealthKit 무태그/늦은태깅도 같은 날 세션 경합.
- 경계·SSOT 주입: weekStart는 `trainingWeekRange(today).start`(월~일)를 coachinglib이 소유하고 store는 주입만 받음(store→coachinglib 의존 회피). 미션 창과 요약 창이 같은 월~일 SSOT 써야 볼륨 일치(과거 월~일/일~토 어긋남 버그).
- 앵커는 처방 볼륨이 아니라 영속 기준선: 드리프트는 currentWeeklyKm(30일 평균) vs 영속 anchorWeeklyKm(±25%). 처방 볼륨 기준이면 매부팅 오발동. → #7 참조.
- best-effort 침묵: doEnsureSchedule 전체 try/catch{}(:519), matchSessionIntent·unlink·heal도 catch{}.

---

## #6. 휴식 선언 / 복귀 램프 (#473 rest-and-return)

휴식 선언과 복귀 램프의 하류. status 전환(declareRest)과 메타(setActiveRest)가 **별개 레이어**라 항상 동반돼야 한다. 🩺 코칭 도메인.

진입점: [[onDeclareRest]] · [[returnFromRestNow]] · 자연만료 분기(doEnsureSchedule) · SSOT: [[returnRamp]] / [[rest-and-return-coaching]]

```
휴식 진입(3경로): openRestSheet / openRestAdjust / 부상체크인 restRequest watch  DashboardPage.vue:1051-1073
├─ onDeclareRest → declareRest + unrestFrom(tail) + setActiveRest + weekOffset=0  DashboardPage.vue:1085-1104
복귀 진입(3경로): 명시(버튼) / 자연만료(ensure 분기) / E2E 시드
├─ returnFromRestNow: unrestFrom(오늘)→setActiveRest(어제)→ensure drain→ensureSchedule  DashboardPage.vue:1112-1131
└─ doEnsureSchedule 분기:
   ├─ 자연만료 (untilDate<today && !returnRampApplied): unrestFrom→payload→applyReturnRamp→returnRampApplied=true  :469-483
   ├─ 운영중 복귀윈도 (restState.isOver): returnRamp 재전달(캡 보존)+deviation 토스트 억제  :484-507
   └─ 휴식 보존 재적용 (untilDate>=today): declareRest 멱등 재적용  :512-518
스케줄 status 레이어: declareRest/unrestFrom                store:119-145 (markSessionsRested/unmarkRestedFrom)
메타 레이어: memoryStore.setActiveRest                      memoryStore.ts:96 / ActiveRest+normalizeActiveRest model.ts:46/813
파생: deriveRestState (restState computed)                 restWindow.ts:56 / DashboardPage:336
└─ restMomentCtx 🩺                                        DashboardPage.vue:344-376/883
   ├─ collectCoachMoments rest 억제 필터 🩺                 coachMoments.ts:534-543
   └─ detectRestSupport / detectReturnDay 🩺                coachMoments.ts:415-475
복귀 램프 SSOT: returnRampPayload→returnRampWindowSessions/returnSessionCapKm  DashboardPage:530 / returnRamp.ts:25-50
└─ applyReturnRampDrafts→buildPeriodizedSchedule(returnRamp)→capReturnSession  DashboardPage:542 / periodizedSchedule.ts:82/418
   └─ realign + supersedeSessionsFrom                      store:88 / repository:96
      └─ settleClosedWeeks                                 store:101 (호출 :511)
표시·만료:
├─ 데이-스트립 scheduleDays (rested 💤 렌더)               DashboardPage.vue:562-587
├─ 💤 배너 + 복귀 컨트롤                                    DashboardPage.vue:1772/1780/1833
├─ expireRestMetaIfOver                                    DashboardPage.vue:1449 (호출 :1434)
├─ CoachSessionOverlay restState 페이로드→coach-run 🩺      CoachSessionOverlay.vue:416 / coachRepository:98
└─ devE2ESeed 복귀 램프 시드                                devE2ESeed.ts:27/61/77/130/159
```

**핵심 mustCheck:**
- `declareRest`(스케줄 status)와 `setActiveRest`(메타)는 별개 레이어 — 항상 동반돼야 정합. 한쪽만 호출하면 restState·데이-스트립·코치 닦달 억제가 모순.
- `returnRampWindowSessions`/`returnSessionCapKm` 상수(MIN_LAYOFF 7·LONG 28·EMPTY_CAP 3·MULT 1.1)가 [[running-coaching-standards]] 라인 84~89와 1:1 — 코드 변경 시 #전문코치리뷰·Coach-Review 필수, SSOT 동시 갱신. '주차별 %' 단정 금지.
- **복귀 램프가 세션 강도/타입을 낮추면(capReturnSession 강등) → 이미 생성된 `sessionIntent`(특히 completed/superseded)는 `ensureIntentFor`가 소급 변조하지 않으므로 옛 강도로 화석화된 채 디브리핑 채점된다.** 강등 규칙을 바꿀 때는 [[#3. doEnsureSchedule 오케스트레이션]]의 "`ensureIntentFor`는 planned만 동기화" gotcha와 디브리핑 채점 기준을 **동시 점검**한다. 이건 순서(reinfer→ensure→ensureTodayIntent) 준수만으로 안 풀린다 — 닫힌 의도는 순서와 무관하게 박제된다.
- **복귀/휴식 카드가 '오늘 무엇' 단정(todaySessionLabel 등)을 만들면 → [[#11. 코치 모먼트 감지기 (coachMoments)]]의 `restMomentCtx` + `sessionOnDate`의 status 술어(`isActiveSession`=planned|missed인지)를 함께 확인.** 단정 라벨은 데이-스트립·브리핑과 **동일 SSOT(같은 status 필터)** 에서 뽑아야 '오늘 Easy' 거짓 단정이 안 난다(7대 함정 ②).
- `layoffDays`=untilDate-startDate+1(휴식 '기간'이지 경과일 아님). `durationDays`와 동일 측정 통일(둘 다 +1 inclusive).

**gotchas:**
- 시점 경합(직렬화): `returnFromRestNow`가 in-flight ensure를 drain한 뒤 재실행하는 이유는 watcher가 loaded·goalId만 보고 activeRest엔 안 묶이기 때문. activeRest를 watcher에 묶으면 가정 붕괴 → ensureInFlight 가드 재도입(:1123 경고).
- 자매 버그(rested 잔존): `supersedeSessionsFrom`은 planned/missed만 비우고 rested는 안 건드림. 복귀 시 옛 rested가 살아남아 💤 잔존·공존. 자연만료·명시복귀 모두 realign 전 `unrestFrom(오늘)` 선전환 필수(:469-480/1116).
- 스냅샷 화석화: onMounted 순서 reinfer→ensureSchedule→ensureTodayIntent 절대조건. ensure가 'Easy+Strides→Easy' 재작성 끝나기 전 ensureTodayIntent 돌면 옛 타입 박제→폐기 처방 채점(:1401-1408).
- 다중 유입 경로: 휴식 진입 3경로(선언 버튼/복귀일 조정/부상 체크인 restRequest), 복귀 3경로(명시/자연만료/E2E 시드). 모두 같은 declareRest/setActiveRest·자연만료 경로로 수렴해야 정합.
- status만 바뀜(레이어 분리): declareRest는 status만, setActiveRest는 메타만 — 어긋나면 무음 불일치(빌드 통과·런타임에서만).
- done이 active뷰서 빠짐 / rested 자동제외: rested·skipped·superseded는 isActiveSession=false라 정산·트리아지·재정렬·런매칭·weekMission·doubleSession에서 자동 제외(닦달 차단). 새 집계 술어 추가 시 rested 명시 제외 안 하면 '쉬는 주'를 닦달하거나 missed 오확정.
- 멱등 가드 수명 결합: returnRampApplied ↔ expireRestMetaIfOver((applied&&daysSinceReturn>2)||>14) ↔ detectReturnDay showReturn(isOver&&0~2일) ↔ 복귀윈도 returnRamp 재전달(isOver). 네 임계값(2/14/28/7일) 중 하나만 바꿔도 카드 사라질 때 메타 안 지워지거나 램프 두 번 걸림.
- off-by-one/경계: returnDate=until+1, daysUntilReturn(오늘=until이면 D-1), durationDays/layoffDays +1 inclusive, unrestFrom 경계(복귀=오늘/단축=dayAfter), returnFromRestNow setActiveRest(어제). 날짜 함수가 분산돼 정의 변경 시 전 경로 동시 검토.
- TZ 어긋남: restMomentCtx에서 declaredAt(UTC ISO)을 로컬 날짜로 환산해 todayIso와 비교(:349). 통일 안 하면 자정 근처 justDeclared/회복주 제안 오발.
- 🩺 SSOT·도메인 게이트: returnRamp.ts 상수·capReturnSession 강등 규칙·휴식 억제 화이트리스트는 [[running-coaching-standards]] §휴식과 복귀와 1:1. coach-run Edge LLM의 restState 인지는 #473 후속 미완.

---

## #8. runStore.deleteRun 역연쇄

삭제 시 크레딧 회수·재유입 차단·FK SET NULL/CASCADE를 정밀 추적. **순서가 절대조건**: 1~4가 DB delete '전'이어야 runId 역참조 가능(SET NULL이 끊기 전).

진입점: [[runStore.deleteRun]] · UI 진입점: [[SessionDetailOverlay]].confirmRemove

```
SessionDetailOverlay.confirmRemove (유일 UI 호출부)         SessionDetailOverlay.vue:96-120 (coachStore.close)
└─ runStore.deleteRun (오케스트레이터)                      runStore.ts:194-245
   ├─ ① trainingScheduleStore.unlinkRunSessions            store:242-246 (done&&runId→planned,null, runId 직접 역참조)
   │     └─ setStatus/replace/updateScheduledSessionStatus  store:247-256
   ├─ ② sessionIntentStore.unmatchRun                       sessionIntentStore.ts:96-101 (completed만 회수)
   ├─ ③ (self-race면) competitionStore.reclaimResultsForRun store:150-159 (deleteCompetitionResultsByRunId)
   │     ↔ 거울: competitionStore.linkPendingResults (좀비 재링크 위험원)  store:83-144
   ├─ ④ (healthkit면) deny-list 동기 push(+영속)            healthKitSyncStore deny:186/508/345 / runStore insertDeniedExternalId:224
   ├─ ⑤ deleteRunLog (DB delete) + FK                       runRepository.ts:125
   │     · scheduled_sessions.run_id / session_intents.run_id / competition_results.linked_run_id → ON DELETE SET NULL
   │     · coach_reports.selected_run_id → ON DELETE CASCADE → coach_memory_items.source_report_id CASCADE
   │       migrations: 202606160001 / 202606150001 / 202606110001 / 202605250002
   └─ ⑥ in-memory runs 필터/persist
거울 진입점(별개): runStore.healSelfRaceLink/healSelfRaceLinks  runStore.ts:273-289 (G4 청소, DashboardPage reconcile 전 호출)
CASCADE 사각지대: 코치 store/리포트 in-memory (갱신 안 됨)  coachRepository.ts:223 / coach-run/index.ts:290/4297 / CoachSessionOverlay
```

**핵심 mustCheck:**
- 1~3은 try/catch best-effort(좀비는 G4가 청소), ④의 in-memory push는 await 전 동기 실행(같은 틱 ObserverQuery 차단). deny 영속 실패는 this.error로 사용자 경고.
- `unlinkRunSessions`는 runId 직접 역참조(날짜 재매칭 금지 — 그새 끼어든 세션 오해제 방지). `unmatchRun`은 completed만 회수(수동 skipped/superseded 보존).
- `reclaimResultsForRun`은 `isSelfRaceRun(target)` true일 때만 호출.

**gotchas:**
- 시점 경합(순서 절대조건): unlink/unmatch/reclaim은 반드시 deleteRunLog '전에'. FK가 ON DELETE SET NULL이라 delete가 먼저면 run_id가 null로 끊겨 어느 세션/의도/결과가 묶였었는지 영원히 못 찾음(#235 G2/G3/M2).
- 같은 틱 ObserverQuery sync: deny 적재가 네트워크 await '전에' in-memory push로 동기 실행돼야 같은 틱 HealthKit ObserverQuery 단건 유입 차단. await 뒤로 옮기면 재유입 창 열림.
- deny 영속 실패의 화석화: insert 실패 시 in-memory엔 deny 있어 당장은 막히지만 다음 부팅 fetch가 덮으면 재유입 → 영속 실패를 사용자 경고로 노출.
- CASCADE in-memory 사각지대: coach_reports/coach_memory_items는 DB에서 CASCADE 자동 삭제되지만 deleteRun 경로는 코치 리포트 in-memory store를 전혀 갱신 안 함 → 화면에 떠 있던 과거 코칭이 DB엔 없는데 메모리엔 남는 stale. 다음 fetch까지 불일치.
- status만 바뀜(done→planned, completed 회수): 세션/의도는 삭제가 아니라 status 되돌림. done이 active 집계서 빠지며 missed 확정 등 2차 효과가 weekly settlement에 흐름 → '삭제했는데 주간 통계가 바뀐다'는 의도된 연쇄.
- 다중 유입경로 거울: deleteRun 역연쇄(unlink/unmatch/reclaim)는 linkPendingResults 정연쇄(태깅→heal→addResult)와 거울. 한쪽 동작/순서 바꾸면 좀비 결과 재링크·유령 사다리 재발 → 양쪽 동시 점검.
- self-race 분기 누락 위험: reclaim은 isSelfRaceRun(target) true일 때만 → 태그 늦게 붙은(무태그) 레이스를 그 전에 삭제하면 competition_result 회수 안 됨 → G4/M2 치유(healSelfRaceLinks) 의존.
- best-effort 부분 실패: 1~3 try/catch로 삼킴(삭제 진행). deleteRunLog 자체가 throw하면 1~4 in-memory 변경(deny push 등)은 적용된 채 DB는 안 지워져 갈림.
- 멱등 수렴 전제: DashboardPage가 healSelfRaceLinks를 reconcileRuns '전에' 돌리고 reconcile/repoint/reinfer 입력서 self-race 제외해야 도돌이 방지.

---

## #9. 레이싱 / self-race 유입

레이싱(self-race) 데이터·이벤트 변경 시 함께 볼 노드. 핵심 규약: **레이싱은 훈련 세션을 점유하지 않고 부하·추세·예측·정산에 안 들어간다**(#235 §10).

진입점: [[RacePage]].recordRaceResult · [[competitionStore]].recordFinish · **워치 릴레이(#552)** · 차단점: [[matchSessionIntent]] 가드

```
RacePage.recordRaceResult / endRace                        RacePage.vue:272-285 (targetPb 소싱 :265)
└─ competitionStore.recordFinish (PendingSelfRace localStorage)  competitionStore.ts:65-76 (deriveResultFields)
워치 릴레이(#552 Phase 3, 결과가 recordFinish 로 수렴):
├─ 워치 완주 → WatchRaceController.emitResult → WCSession transferUserInfo (시스템 큐잉)
├─ 폰 PhoneWatchRelay.didReceiveUserInfo → UserDefaults 큐 → 웹 pull/ACK   native/RunningCoach/PhoneWatchRelay.swift
├─ 웹 watchRaceStore.handleResult → recordFinish(watchResultId 멱등) + 즉시 linkPendingResults  watchRaceStore.ts
└─ 워치 워크아웃 태깅 = HK 메타 PaceLABCompetition (생성시점, healthKitBridge:273 소비와 미러)  WatchRaceController.beginWorkout
카탈로그 하강(설정): runs 변경 → App.vue 디바운스 → buildWatchRaceCatalog(race_last_settings_v1 미러) → applicationContext
유입경로(3+1):
├─ #1 importCompetitionRun (단건, 생성시점 태깅)            healthKitSyncStore.ts:305-365 (태그 :355)
├─ #2 handleRuns / handleHistoricalMigrationRuns (정규 sync) healthKitSyncStore.ts:171-272 (태그 :566)
└─ (repair) mergeHealthKitRepairTags                       healthKitSyncStore.ts:566-572
└─ competitionStore.linkPendingResults                     competitionStore.ts:83-144
   ├─ (a) self-race 태깅(멱등, updateRun)
   ├─ (a-2) healSelfRaceLink (태깅 늦으면 같은 틱 복원)      runStore.ts:285
   └─ (b) addResult → CompetitionResult                    competitionStore.ts:161-179 / model.ts:38
분기 차단점: runStore.matchSessionIntent (SELF_RACE_TAG면 return)  runStore.ts:298-314 (가드 :302)
치유: healSelfRaceLink/healSelfRaceLinks                   runStore.ts:273-297 (unlink+unmatch 재사용)
부하/표시 분리:
├─ DashboardPage.doEnsureSchedule (G4 + 부하/앵커 제외)     DashboardPage.vue:415-522 (제외 :429, 억제 :500)
├─ scheduleDays state·lastRace 카드·recentTimeTrial         DashboardPage.vue:120-122/302-304/562 (trainingRuns vs runs.value!)
├─ reclaimResultsForRun (삭제 라이프사이클)                 competitionStore.ts:150 / runStore deleteRun:211  → #8
├─ distancePb.computeDistancePbs (PB 사다리 + 루프백)        distancePb.ts:39 / raceTargets.listOpponents:40
├─ achievements.summarizeAchievementsForCoach/RacingResults 🩺  achievements.ts:59/247 / CoachSessionOverlay:400
├─ coach-run 서버 미러 (recentRacingResults 정규화) 🩺      coach-run/index.ts:511/575/1159
├─ levelModel.lastSelfRaceDate (폼 재측정·승급)             levelModel.ts:191/214
└─ reinferMislabeledLongRuns (재추론 제외)                  runStore.ts:164-193 (제외 :169)
```

**핵심 mustCheck:**
- 생성시점 태깅(`healthKitSyncStore.ts:355`)이 §10 핵심 안전장치 — matchSessionIntent(:302) 가드가 SELF_RACE_TAG면 즉시 return. 태그 빠지면 레이싱이 처방 세션을 done으로 먹음.
- `recordFinish`가 보내는 racedAt/racedDistanceM/racedDurationSec/finalGap 모양이 PendingSelfRace 매칭 키·ghost.ts 부호의 출처. 필드 변경 시 deriveResultFields·matchScore 동시 검토.
- `linkPendingResults`가 호출되는 3곳(importCompetitionRun·handleRuns·handleHistoricalMigrationRuns) 모두 linkSelfRaceResults() 래퍼 경유.

**gotchas:**
- 시점 경합(가장 위험, 7대 함정 ①): 단건 importCompetitionRun과 정규 sync(handleRuns)가 같은 워크아웃 경합. 정규 sync가 먼저 '무태그'로 이기면 matchSessionIntent가 처방을 done으로 소비 → (a-2) healSelfRaceLink가 '같은 틱' 복원해야 하고, 못 하면 다음 doEnsureSchedule G4까지 먹힌 채 남음. **누가 먼저 이기느냐가 비결정적 — 정적·단발 E2E로 못 잡는다. 실기기/반복/`devE2ESeed` 결정론 시드로만 재현([[auth-e2e-account-state-and-seed-safety]], #235 교훈).**
- 다중 유입경로(3+1): RunLog 유입이 (1)importCompetitionRun 단건 (2)handleRuns 정규 (3)과거범위 + repair. 각 경로 태그 주입 지점 다름 — 한 경로라도 태그 누락하면 isSelfRaceRun 레이더에 영영 안 잡혀 부하 제외·G4 치유·reclaim 전부 누락.
- status만 바뀌는 함정: heal/unmatch는 'done→planned', 'completed→planned' status만 되돌림. 좁은 조건(done/completed AND runId 일치)만 풀어 수동 skipped/superseded는 안 건드림.
- done이 active뷰서 빠짐: scheduleDays(:572)는 trainingRuns(self-race 제외)로 done 판정 → 레이싱만 한 날은 done(✅) 아님. 반면 lastRace(:122)·recentTimeTrial(:304)은 의도적으로 runs.value(레이싱 포함)로 따로 집음. **두 데이터소스(trainingRuns vs runs.value) 섞으면 레이싱한 날이 사라지거나 훈련완료로 오표시.**
- 스냅샷 화석화: PendingSelfRace는 localStorage 임시(3일 만료)·targetPb는 종료 시점 best PB 박제. 더 빠른 런이 들어와도 옛 타겟 기준 그대로. CompetitionResult로 영속되면 고착.
- SELF_RACE_TAG 상수 다중 재선언: `entities/competition/model.ts`(SSOT)를 두고 `achievements.ts:19`·`distancePb.ts:29`·`levelModel.ts:191`이 각자 리터럴 'self-race' 재선언. runStore matchSessionIntent는 리터럴 직접 비교 — 판정 로직 변경 시 산재한 5곳 전부 점검.
- localStorage 모드 무력화: 세션·의도가 Supabase 전용이라 비로그인 모드에선 heal·unmatch·unlink·reconcile 전부 no-op. §10 정합은 집계 필터(isSelfRaceRun)로만.
- 루프백(연쇄가 닫힘): self-race RunLog의 PB가 `raceTargets.listOpponents`에서 통합 최속으로 다음 레이싱의 best 상대(targetPb)가 됨 → RacePage.recordFinish 입력으로 되돌아와 연쇄 재시작.
- 삭제≠원본삭제 + 회수 순서: deleteRun은 DB delete '전에' unlink/unmatch/reclaim. reclaim은 isSelfRaceRun 게이트라 태그 누락 레이싱은 좀비 위험. → #8.
- 워치 릴레이 멱등(#552): WCSession ACK 유실 시 재전송 → recordFinish 의 `watchResultId` 가드가 이중 보류 차단. 이미 소비(매칭)된 뒤 재전송은 가드에 안 걸리지만 매칭될 런이 없어 3일 만료. 워치 결과 페이로드 모양 바꾸면 watchRaceBridge.ts ↔ PhoneWatchRelay.swift ↔ WatchRaceController.emitResult 3곳 동시 변경.
- 워치 태깅은 WC 독립(#552): 승패(결과 릴레이)와 달리 태그는 워치가 박은 HK 메타로 정규 sync 가 붙인다 — WC 끊겨도 §10 부하 제외는 유지되고, 승패만 재연결 시 늦게 생성.
- `race_last_settings_v1`(RacePage LS) 소비처 2곳: RacePage 복원 + **워치 카탈로그 announceConfig/lastSelection**(watchRaceCatalog.ts). 키/모양 바꾸면 둘 다.

---

## #10. 활성 목표 전환 (addGoal/updateGoal/setActiveGoal → memoryStore.update)

활성 목표 전환의 하류 — 스케줄 재로딩·재생성·예측·코치모먼트. **지연 저장**: '저장' 버튼을 눌러야 연쇄가 시작된다.

진입점: [[MemoryPage]].save → [[memoryStore]].update · SSOT: [[getActiveGoal]] · 분기: [[goalArchetype]]

```
MemoryPage addGoal/updateGoal/setActiveGoal/removeGoal (draft만)  MemoryPage.vue:356/383/388/394 (syncLegacyGoal :310)
└─ save() (isDirty 버튼) → memoryStore.update(JSON 깊은복제)       MemoryPage.vue:736-743
   └─ normalizeTrainingMemory (goals/activeGoalId/category 정규화)  memoryStore.ts:86 / model.ts:769 (normalizeGoalCategory :1239)
      └─ getActiveGoal(memory) (대시보드 활성 목표 SSOT)         model.ts:664 / DashboardPage activeGoal :129
         ├─ watch(activeGoal.id) → scheduleStore.load(id) + ensureSchedule()  DashboardPage.vue:1415-1422 (loaded-watch :1398)
         │  └─ ensureSchedule/doEnsureSchedule (goalArchetype 분기)  DashboardPage.vue:415-522  → #3
         │     └─ goalArchetype(goal.category) (성과 vs 비성과 SSOT)  periodizedSchedule.ts:444 (사용처 :419/611/630)
         ├─ raceProjection → getRaceProjection 🩺                 DashboardPage.vue:181 / performanceProjection.ts
         ├─ goalFeasibility → assessGoalFeasibility 🩺            DashboardPage.vue:324 / coachMoments detectGoalFeasibility:350
         ├─ coachMoments → detectGoalProgress/detectGoalFeasibility 🩺  DashboardPage.vue:853 / coachMoments.ts:281/350
         ├─ weekSummary/hasSchedule/expectsSchedule/scheduleDays  DashboardPage.vue:609-633/562
         ├─ ensureIntentFor (오늘 의도, activeGoalId 연결) 🩺      DashboardPage.vue:1340/1398 / sessionIntentStore.ensureIntentFor
         └─ sessionBriefing → buildSessionBriefing({goal}) 🩺      DashboardPage.vue:710-719
레거시 미러: syncLegacyGoal / draft.goal (단일 문자열)         MemoryPage.vue:310 / model.ts:1072/1222
스케줄 store: load/insertMany/realign/settle/declareRest/unrestFrom + loadedGoalId  trainingScheduleStore.ts:58-145/34
빌더: buildPeriodizedSchedule/buildSteadyWeeklyRhythm/buildRealignedSchedule  periodizedSchedule.ts / scheduleRealign.ts
앵커: persistScheduleAnchor → adaptiveTrainingProfile.scheduleAnchorWeeklyKm  DashboardPage.vue:401-413  → #7
```

**핵심 mustCheck:**
- addGoal/setActiveGoal/updateGoal는 reactive draft만 바꿈 — '저장' 버튼(:756, `:disabled=!isDirty`)을 눌러 save→update가 돌 때만 하류 연쇄 시작.
- draft.activeGoalId/goals/goal 세 가지가 한 번에 나가므로 셋의 정합(activeGoalId가 goals에 실재하는지) 항상 같이 봄.
- `goalArchetype`: 'race'→performance(주기화), 그 외→상시리듬. category 바뀌면 주기화/예측/단계카드 노출 전체가 갈림. category 변경 시 goalArchetype 매핑·normalizeGoalCategory·NON_PERF_SUMMARY 함께.

**gotchas:**
- 지연 저장 함정: 저장 안 하고 대시보드로 가면 아무것도 안 바뀜.
- 다중 유입경로(스케줄 재생성 트리거): ensureSchedule은 (a)activeGoal.id 전환 watch (b)loaded-watch(immediate) (c)returnFromRestNow (d)route '/' watch에서 호출. ensureInFlight 가드 하나가 이중 골격 방어선 — 가드 우회/직접 doEnsureSchedule 호출 추가 금지.
- 시점 경합(전환 watch는 거리/날짜 변경을 안 봄): watch는 `activeGoal.value?.id`만 추적. 같은 목표에서 distanceKm/targetDate만 바꾸면 이 watch 안 돌고 앵커-드리프트 realign이나 다음 부팅 loaded-watch에 의존 → 즉시 재생성 안 될 수 있음.
- prev==null 스킵: 전환 watch는 prev==null(초기)을 일부러 건너뜀(:1418, 초기는 loaded-watch 책임). 분리 깨지면 콜드 부팅 이중 생성 또는 미생성.
- archetype 무음 early-return: performance인데 targetDate/distanceKm 비면 :421에서 조용히 return → 스케줄 안 생기는데 expectsSchedule(:614)는 true라 placeholder가 영원히 떠 '로딩 중'처럼 보이는 무음 실패.
- status만 바뀜 + 낙관적 미러: realign/settle/declareRest/unrestFrom은 DB 호출과 별개로 this.sessions status를 in-place로 바꿈 → DB push 실패 시 화면(낙관적)과 DB 갈림.
- done이 active 뷰서 빠짐: isActiveSession은 done/superseded/skipped/rested 제외 → 세션 전부 done이면 hasActive=false라 롤링 재생성이 다시 돔. 데이-스트립은 done을 run 존재로 별도 칠해 화면엔 보임.
- realign이 rested를 안 건드림(휴식 잔존): #6 자매 버그와 동일. 목표 전환과 휴식 메타 겹치면 declareRest 재적용(:516) 충돌 점검.
- 스냅샷 화석화(의도/브리핑): 목표 전환으로 세션 타입 바뀌면 옛 sessionIntent가 폐기 처방으로 박제 → reinfer→ensureSchedule→ensureTodayIntent 순서 강제(:1401).
- 다중 표현(신규 goals[] vs 레거시 memory.goal): goals[]/activeGoalId가 SSOT지만 레거시 단일 문자열 memory.goal도 공존(syncLegacyGoal 미러). setActiveRest/persistScheduleAnchor 경로는 goal 문자열 안 만져 stale 가능.
- 역방향 쓰기 경합 + 직렬화 가정: doEnsureSchedule이 persistScheduleAnchor/setActiveRest로 update를 다시 호출. ensure watcher가 activeGoal.id/loaded뿐이라 재발화는 안 되지만(:1123), activeRest/anchor에 ensure 묶으면 무한 루프 → 새 watch 추가 시 재확인.
- 🩺 코칭 도메인 게이트: buildSessionBriefing/coachMoments/raceProjection은 코칭 동작 → [[running-coaching-standards]] 선행 + Coach-Review.

---

## #7. 페이스·체력 드리프트·재앵커 (doEnsureSchedule 운영중 분기)

`chronicLoad.last30Km → currentWeeklyKm → ratio 드리프트 판정 → realign → 앵커 재영속`의 하류. #3의 C-2 분기를 데이터 흐름 관점으로 펼친 것.

진입점(소스 신호): [[getChronicLoadTrend]] · 판정: [[detectScheduleDeviation]] · 멱등 고리: [[persistScheduleAnchor]]

```
getChronicLoadTrend / last30Km (소스 신호, trainingRuns만)  runStats.ts:121-137 / 호출 DashboardPage:320
└─ currentWeeklyKm computed = (last30Km*7)/30 또는 null      DashboardPage.vue:322
   ├─ detectScheduleDeviation (ratio=current/anchor, 1±0.25)  scheduleRealign.ts:105-157 (임계 :29)
   │  └─ buildRealignedSchedule (forward 재구축, source:'realign')  scheduleRealign.ts:171-204 (호출 :495)
   │     └─ scheduleStore.realign (supersede+insert, rested 보존)  store:88 / repository:96
   │        ├─ persistScheduleAnchor 재영속 (ratio≈1 수렴)    DashboardPage.vue:498-499
   │        ├─ settleClosedWeeks (realign 뒤)                 store:101 / 호출 :511
   │        ├─ declareRest 재적용 (휴식 보존)                  store:119 / :515
   │        └─ 체력 변화 토스트 (deviation.reason, 억제 조건)  DashboardPage.vue:500-505
   ├─ deriveObservedEasyPace / observedEasyPace (EWMA τ=28)   observedEasyPace.ts:55 / DashboardPage:175
   │  └─ buildPeriodizedSchedule (anchorKm·observedEasyPace·returnRamp)  periodizedSchedule.ts:357/418
   ├─ 복귀 램프 분기 (drift 무관 적용)                        DashboardPage.vue:470-483/542  → #6
   └─ goalFeasibility computed                                DashboardPage.vue:324-333
앵커 모델: scheduleAnchorWeeklyKm (>0 아니면 null)           model.ts:196/555/1048
표시: scheduleStore.sessions → 캐러셀/데이-스트립/activeBriefing  DashboardPage.vue:562/689/344
```

**핵심 mustCheck:**
- `last30Km` 산식(30일 합)을 바꾸면 currentWeeklyKm·ratio·드리프트 임계가 통째로 이동. #235/§10 self-race 제외(trainingRuns)가 여기서 시작.
- `persistScheduleAnchor`: 재앵커 직후 앵커를 현재값으로 올려야 다음 부팅 ratio≈1 수렴(영구 재발동 방지). 콜드스타트(:453/467)·미초기화 초기화(:492)·재앵커(:499) 3경로 모두에서 호출 — 한 경로만 누락하면 가짜 재정렬.
- `detectScheduleDeviation`: Taper/Recovery 단계면 up-drift 억제. anchorWeeklyKm은 '처방 볼륨'이 아니라 '영속 기준선'(처방 볼륨 쓰면 매부팅 오발동). 임계 0.25 변경 시 ACWR 유지밴드 근거(Gabbett) 함께 갱신.

**gotchas:**
- 시점 경합 / 재발화 누락(가장 중요): ensureSchedule fire watch는 loaded·activeGoal.id 뿐. 새 런이 last30Km→currentWeeklyKm를 바꿔도 그 computed에 doEnsureSchedule가 안 묶여 있음 → 같은 세션에서 런만 추가되면 ratio는 재계산돼도 재정렬은 즉시 안 돔. 다음 store reload·목표 전환·대시보드 재진입 때 발동.
- in-flight 가드 단일화: ensureInFlight로 watch 다발 시 1회만. 새 메타로 다시 돌려야 할 땐 returnFromRestNow처럼 drain 후 재호출 필요.
- 앵커=영속 기준선 ≠ 처방 볼륨: ratio 분모를 plannedWeeklyKm로 바꾸면 주기화 정당한 주별 변동이 매부팅 재정렬·토스트 영구 발동(scheduleRealign.ts:25-27, 188이 plannedWeeklyKm 일부러 안 씀). 화석화된 함정.
- self-race 첫 수렴 down-토스트 오발: self-race 빼는 첫 빌드에 weeklyKm 한 단계↓ → down 드리프트 토스트 1회 오발, selfRaceAnchorSettledOnce로 1회 억제(:503). 세션 1회성(영속 아님).
- status만 바뀌고 active뷰서 빠짐: realign은 fromDate 이후 활성 세션을 superseded로 비우고 새 drafts insert. 캐러셀·brief는 superseded 제외라 '사라진 듯' 보이나 DB행 보존.
- rested vs supersede 비대칭(자매 버그): #6과 동일 — supersedeSessionsFrom은 rested 안 비움 → realign 전 unrestFrom 선행.
- 순서 절대조건 3개: (1)heal→reconcile→settle (2)realign→settle (3)ensureSchedule→ensureTodayIntent.
- 다중 유입경로 — 앵커 영속 3곳·재정렬 실행 3곳: persistScheduleAnchor(콜드스타트·미초기화·재앵커), buildPeriodizedSchedule(콜드스타트·realign·복귀램프). 하나 고치면 셋 다 같은 입력 규약(currentWeeklyKm·observedEasyPace·returnRamp) 동기 확인.
- Taper/Recovery up-drift 억제는 upcomingPhase 종속: summarizeUpcomingWeek가 가장 이른 활성 세션 phase로 대표 단계 산출. rested/superseded/skipped 제외(휴식 섞이면 'down' 오재정렬).
- null 전파: currentWeeklyKm null이면 드리프트 비발동+coldStartBaseKm 폴백. anchorWeeklyKm null/≤0이면 비발동(caller 조용히 초기화). observedEasyPace null(표본<3)이면 VDOT 폴백. 세 null 경로 독립.
- best-effort 침묵: doEnsureSchedule 전체 try/catch(:519), 앵커 영속 실패도 삼켜짐 — '재앵커 안 됐는데 에러도 없는' 디버깅 함정.

---

## #11. 코치 모먼트 감지기 (coachMoments)

`DashboardPage coachMoments computed → collectCoachMoments + 13 DETECTORS → topCoachMoment → CoachMomentCard`. reactive 코칭 연쇄의 단일 수렴점. 🩺 코칭 도메인.

진입점: [[collectCoachMoments]] · UI: [[CoachMomentCard]] · ctx 조립: DashboardPage coachMoments computed

```
입력 reactive 소스군 (런·부상·휴식·목표·TT·부하·스케줄)    DashboardPage.vue:107-130/171-186/303-333/746-751/846
└─ DashboardPage coachMoments computed (ctx 조립, 12개 파생)  DashboardPage.vue:853-887
   ├─ painProbeCtx + injuryProbeSnapshot (detectPainProbe)  DashboardPage.vue:147-170 / onMomentSelect:905  → #4
   ├─ restMomentCtx + restState (detectRestSupport/ReturnDay)  DashboardPage.vue:344-376  → #6
   ├─ doubleSuggestionData (detectDoubleSuggestion, prio 54)  DashboardPage.vue:1255-1264 / doubleSession.ts
   ├─ weekendTriageData (detectWeekendTriage, prio 55)        DashboardPage.vue:1205-1236 / WeekendTriageSheet:1903
   └─ detectScheduleDeviation (inline, 매 재계산마다 실행)    DashboardPage.vue:864 / scheduleRealign.ts
└─ collectCoachMoments (엔진 본체, 13 DETECTORS)             coachMoments.ts:527-545 (DETECTORS :507, rest 억제 :534)
   └─ topCoachMoment computed ([0]만 노출, 동률=등록순서)     DashboardPage.vue:888
      └─ CoachMomentCard.vue (1건 렌더, :key=topCoachMoment.key)  CoachMomentCard.vue:1-44 / 마운트 :1672
         ├─ dismissMoment / dismissedMomentKeys (비영속 Set)  DashboardPage.vue:852/889
         └─ onMomentAction → 3개 시트 브리지                  DashboardPage.vue:892-897
            ├─ open-injury-screening → injuryFlowStore.requestScreening → App.vue watcher  injuryFlowStore.ts:19 / App.vue:161
            ├─ open-weekend-triage → triageOpen=true          (WeekendTriageSheet save/release가 실제 변경)
            └─ open-doubles-add → openDoublesAdd(amSession)
테스트 계약: coachMoments.test.ts                           coachMoments.test.ts:23-380
```

**핵심 mustCheck:**
- 감지기 추가/삭제하거나 CoachMomentKind(line 17)를 늘리면 ① DETECTORS 배열 등록 ② rest.active 억제 필터(534-543) 화이트리스트 분류 ③ priority 충돌(54/55 상호배타, 58/55, 65~80 띠) ④ key 안정성(dedupe/dismiss) 4가지 동시.
- 억제 필터는 kind 문자열 하드코딩 → 새 kind는 기본 '억제됨'. 휴식 중 떠야 할 안전 신호면 명시적으로 추가.
- CoachMomentContext 필드(coachMoments.ts:144-213) 추가/변경 시 ctx 매핑(:853)도 갱신.

**gotchas:**
- 시점 경합(today 고정): `today=ref(new Date())`로 마운트 순간 고정(:107). 자정 넘기면 daysAgo·daysUntilReturn·justDeclared(0~1일)·showReturn(0~2일)·escalation 일수가 어제 기준 stale → 모먼트가 하루 늦게 켜지거나 안 꺼짐.
- 스냅샷 화석화(painProbe): injuryProbeSnapshot은 activeInjury.id 변경에만 watch(148-159). probeAnswers 변화엔 재스냅 안 함 → 같은 부상에서 답 골라도 다음 프로브는 다음 앱 열림/부상 변경 때만(의도된 '한 세션 1문항').
- 다중 유입경로(attributedRunIds): scheduleStore.sessions[].runId 와 sessionIntentStore.intents[].runId 양쪽에서 모음(846). 한쪽만 링크돼도 귀속 → 두 store 동기 어긋나면 추가런 판정 흔들림.
- trainingRuns vs runs(레이싱 분기): 부하·추세·추가런은 trainingRuns(self-race 제외, :120), timeTrialResult는 self-race/Race 포함(:304). 같은 self-race 런이 감지기별로 포함/제외 갈림.
- status만 바뀜(deviation/triage): detectScheduleDeviation·weekEndTriage는 세션 status로 누락/백로그 판정. skipped(신설)·superseded·done 추가/변경 시 집계가 조용히 어긋남. priority 54/55 상호배타 가정도 status 조건 의존.
- 신뢰 시점(rest 복귀 카드 거짓 단정, 7대 함정 ②): restMomentCtx.todaySessionLabel은 sessionOnDate(오늘) 종속(:354). 오늘이 run-day 아니면 null=진짜 쉬는 날 → 'nextReturnSession' 분기. **라벨이 신뢰하는 status 집합을 반드시 확인하라 — `sessionOnDate`가 `isActiveSession`(planned|missed)만 보는가? rested/superseded를 '오늘 세션'으로 오인하면 '오늘 Easy' 거짓 단정이 난다.** 단정 라벨은 데이-스트립·브리핑과 **같은 SSOT(같은 status 필터)** 에서 뽑아야 한다(#473 후속). → 복귀 카드 문구를 바꾸는 변경은 [[#6. 휴식 선언 / 복귀 램프 (#473)]]에서도 진입하므로 양쪽 확인.
- priority 동률 tie-break = 등록 순서: topCoachMoment는 [0] 하나만 노출. sort 안정정렬이라 같은 priority면 DETECTORS 배열 등록 순서(507-521)가 승부 → 같은 priority 새로 주면 의도치 않게 가림.
- 억제 필터 화이트리스트 하드코딩: rest.active 억제(534)는 kind 문자열 화이트리스트, 새 kind는 기본 억제 → 휴식 중에도 떠야 할 안전 신호면 명시 추가(누락 시 휴식 중 무음).
- dismiss 비영속 + pain-probe 가변 key: dismissedMomentKeys는 ref(메모리)라 새로고침 시 리셋→부활(852). pain-probe key='pain-probe:{probeId}'로 프로브마다 달라 dismiss해도 다른 프로브는 새로.
- CoachMomentAction.kind ↔ onMomentAction 분기 정합: kind 추가하면(coachMoments.ts:20) onMomentAction(892)에 분기 안 넣으면 dismiss만 하고 무음 no-op. 부상 스크리닝은 store→App.vue watcher 우회(직접 못 엶)라 양끝 문자열 일치해야 시트 열림.
- onMomentSelect 비파괴·in-flight 가드: probe 영속은 cloneMemory→1키 add + subtypeResolved만(905), probeSaving 가드로 덮어쓰기 방지. 파괴적 확장 금지.

---

## 부록: 진입점 간 수렴점 (어디서 만나는가)

### A. 함수/상태 수렴점 — "이 함수를 고치면 누가 같이 움직이나"

여러 진입점이 같은 함수/상태에서 만난다. 한 진입점을 고치면 수렴점을 공유하는 다른 진입점도 봐야 한다. **"신규 콜러 추가 시 보장 의무" 열**: 이 함수에 새 호출부를 추가하는 변경(4·5번류 회귀의 재발 경로)은 그 칸의 불변식을 반드시 통과시켜야 한다.

| 수렴점 | 만나는 진입점 | 핵심 | 신규 콜러 추가 시 보장 의무 |
| --- | --- | --- | --- |
| `matchSessionIntent` (`runStore.ts:298`) | #1 #2 #9 | self-race 가드(:302)가 분기 차단점. 런 인입·HK 동기화·레이싱 모두 여기 통과 | 새 콜러는 self-race 필터(SELF_RACE_TAG)를 먼저 통과시킬 것. 늦은 태깅 경로면 같은 틱 `healSelfRaceLink` 안전망을 보장 |
| `doEnsureSchedule` (`DashboardPage.vue:415`) | #1 #2 #3 #5 #6 #7 #9 #10 | 순서 절대조건 heal→reconcile→repoint→(build/ramp/realign)→settle→declareRest. 모든 자동 스케줄 변이의 SSOT | 직접 `doEnsureSchedule`를 새로 호출하지 말 것 — 반드시 `ensureInFlight` 가드 경유. 새 메타로 재실행이 필요하면 `returnFromRestNow`처럼 drain 후 재호출 |
| `memoryStore.update` (머지) | #2(tempoCeiling) #4(부상) #6(activeRest) #7(anchor) #10(목표) | adaptiveTrainingProfile 스프레드 머지 — 같은 틱 동시 write 시 마지막 쓰기가 이김 | 새 콜러는 다른 콜러의 필드를 덮지 않는지(스프레드 머지 충돌) 확인. cloneMemory 후 최소 키만 변경 |
| `healSelfRaceLink(s)` (`runStore.ts:273`) | #1 #3 #5 #8 #9 | unlink+unmatch 재사용. 지연 태깅 같은 틱 복원 + G4 청소 두 진입점 | 새 콜러는 reconcile/repoint '전에' 돌리고, reconcile 입력에서 self-race를 빼 도돌이를 막을 것 |
| `getActiveInjuryItem` (`model.ts:668`) | #4 (4대 경로 공통 입구) | status 전환이 4대 경로 입력을 동시에 바꿈 | coach-run은 라이브가 아니라 시점필터 `getActiveInjuryItemForRunDate`를 쓴다 — 새 소비처가 어느 입구를 쓰는지 명시 |
| `selectSessionForRun` (`model.ts:133`) | #1 #2 #5 #8 #9 | matchRun·reconcile·repoint 공유 selector. 윈도우/정렬 변경 시 done 크레딧 대상 통째 변화 | 윈도우/정렬을 바꾸면 matchRun·reconcile·repoint 세 콜러 모두 같은 결정성으로 재검증 |
| `isActiveSession` (planned\|missed) | #3 #5 #6 #7 #10 #11 | done/superseded/skipped/rested 제외 — 'status만 바뀜·active뷰서 빠짐' 함정의 뿌리 | 새 집계 술어를 추가하면 rested/superseded/skipped를 명시 제외했는지 확인(안 빼면 '쉬는 주'를 닦달하거나 missed 오확정) |

### B. 교차-섹션 충돌 개념 — "이 데이터/필드를 바꾸면 어느 섹션들이 충돌하나"

A 표가 "함수→진입점"(정방향)이라면, 이 표는 **역방향**이다. 하나의 개념이 여러 섹션에 흩어져 있을 때, 한 변경자가 한 섹션만 보고 다른 섹션을 놓치는 것이 충돌의 진원이다(복귀 카드 거짓 단정·강등 vs 화석화가 둘 다 여기서 막힌다). **한 행의 어느 칸을 건드리든 같은 행의 나머지 칸을 전부 확인하라.**

| 흩어진 개념 | 충돌하는 섹션/관점 | 한 변경자가 놓치기 쉬운 교차점 |
| --- | --- | --- |
| `sessionIntent` (세션 의도) | #1 생성 / #2 처방 시점 박제 / #3 강등 동기화(planned만) / #6 복귀 램프 강등 / #10 목표 전환 재작성 / 디브리핑 채점 | 강도/타입을 강등(#6)해도 이미 닫힌(completed/superseded) 의도는 `ensureIntentFor`가 안 고쳐 폐기 강도로 채점(#3 gotcha). 순서 준수로 안 풀림 |
| `restState` / `activeRest` | #6 선언·복귀·메타 / #11 코치 모먼트 억제·복귀 카드 / #7 부하/드리프트에서 rested 제외 | declareRest(status)와 setActiveRest(메타)는 별개 레이어 — 한쪽만 바꾸면 무음 불일치. 카드 라벨(#11)이 #6과 다른 status를 신뢰하면 거짓 단정 |
| "오늘 무엇" 단정 (today 고정·label) | #11 today=ref 마운트 고정·todaySessionLabel / #6 복귀 카드 / 데이-스트립·브리핑 SSOT | 자정 경계로 today가 stale(#11) + 라벨이 신뢰하는 status 술어(planned만?)가 데이-스트립과 어긋나면 '오늘 Easy' 거짓 단정 |
| self-race 태그 / 부하 제외 | #1 #2 #9 매칭 가드 / #3 G4·앵커 제외 / #5 #8 삭제 회수 / #7 드리프트 제외 / scheduleDays done 판정 | trainingRuns(제외) vs runs.value(포함) 두 데이터소스를 섞으면 레이싱한 날이 사라지거나 훈련완료로 오표시. 태그 누락 1경로면 전 하류 누락 |
| `scheduleAnchorWeeklyKm` (앵커) | #7 드리프트 분모·재영속 / #3 콜드스타트·미초기화 초기화 / #10 목표 전환 시 재영속 | 영속 3경로(콜드스타트·미초기화·재앵커) 중 하나만 누락하면 매부팅 가짜 재정렬. 분모를 처방 볼륨으로 바꾸면 영구 오발동 |

### C. 검증 게이트 — 어떤 함정은 정적·단발 E2E로 못 잡는다

- **비결정 시점 경합(①류, self-race 점유·HK 같은 날 경합)**: 누가 먼저 이기느냐가 비결정적이라 단발 E2E로 재현 불가. **실기기 / 반복 실행 / `devE2ESeed` 결정론 시드 필수**([[auth-e2e-account-state-and-seed-safety]]). #235 교훈 — 코드만 보고 실기기 검증을 미루면 사용자가 더위에 뛰며 발견한다.
- **best-effort 무음(⑥류)**: catch가 삼켜 정적검사로 회귀를 못 잡음 → 라이브/렌더 E2E([[web-change-verify-render-and-migration]]).
- **Supabase 전용 경로(⑦류)**: 로컬 QA는 안 탐 → 배포 후 실제 코칭 1회 스모크.
