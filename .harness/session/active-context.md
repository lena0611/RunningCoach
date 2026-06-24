# 현재 컨텍스트

이 프로젝트의 최근 작업 상태와 다음 작업을 짧게 이어받기 위한 소비자 프로젝트 전용 문서입니다.
운영 규칙 본문은 여기서 중복하지 않고 `.harness/project/workflow-rules.md`와 `CLAUDE.md`를 가리킵니다.

> 하네스 본체의 개발 기록이 아닙니다. 설치된 프로젝트의 현재 작업 맥락만 기록합니다.
> 상세 인수인계는 (있으면) 프로젝트 루트 `HANDOFF.md`. 장기 지식은 에이전트 메모리.

## ⭐ 현재 작업 — UI 스택 시스템 정리(#275 공통화·코치 App레벨 오버레이·바텀시트) 10개 PR 머지·라이브 (2026-06-24)
- **이번 세션(PR#490~#499, 전부 머지·배포·트리검증):**
  - **#275 스택 공통화**: 중복 스택 마크업을 공유 `src/shared/ui/StackPage.vue`로 추출, 전 화면 마이그레이션(#490·#491). 함정=자동 import 없음→누락 시 build 통과·런타임 무음실패. [[stackpage-commonization-275]].
  - **애니메이션 규칙 정렬**(#492~#494): 진입/첫 스택=밑→위(rise)+우상단 X, 전진 드릴인=우→좌(push)+좌측 뒤로(`transition ?? (back ? 'push' : 'rise')`), 1차 등장 240→360ms.
  - **AI 코칭 App 레벨 독립 오버레이**(#496): `CoachSessionOverlay.vue`+`coachStore`로 추출, App.vue 탭 페이저 밖 상시 렌더 → 어느 탭에서 열든 그 탭 위에 뜨고 닫으면 스크롤 보존 복귀. **사용자 결정=비-탭 스택 전부 App 레벨 독립**. z `--z-coach:900`. [[stacks-app-level-independence]].
  - **부수**: 스플래시 무한 고착 방지 캐시정리 2초 가드(#495)·재앵커 토스트 스팸→멱등화(#497)·상단 코치 모먼트 중복 제거(#498)·진행평가 팝업 표준 바텀시트화(#499). #499 CTA는 `v-if="shouldTransition"`(전환 제안 시만 노출) — 사용자 "그대로 둬", DEV 훅으로 라이브 재현 확인 후 원복(코드 무변).
  - ⚠ **연속 배포 금지**: 단시간 다중 배포 → WKWebView 청크 캐시 stale → 스플래시 고착. 배포 간격 둘 것.
- **남은 iOS 후속(직전 세션)**: 가짜 '새 러닝 감지' 배너 제거됨(PR#488). 다음=워치 실주행→집 동기화 시 '제때 1번' 알림 오나(워치 필요). [[healthkit-detected-notify-gate]].
- **#473 휴식·복귀(직전) Phase 1·2 코어 완료·라이브**: 닦달 차단·💤 배너·코치 보이스·복귀 램프(체력 재앵커+초반 Easy·거리캡). 인증 E2E 검증. **후속(미착수)**: (a) 부상 walk-run 처방(공백), (b) coach-run LLM 휴식 인지, (c) #473 클로즈. [[rest-and-return-coaching]].
- **🧪 자율 QA 인프라**: 테스트 계정(lena0611+qa) 저장 세션 + `playwright.rest.config.ts` + DEV 시드 훅(`window.__pacelabE2E`, `src/app/devE2ESeed.ts`). 규칙 [[agent-verifies-via-local-qa]].
- ⚠ **머지 규칙**: squash 후 `git diff <tip> origin/main` 빈결과 트리 검증 필수(#463 사고), 의심 시 `--merge`. [[pr-squash-merge-race-verify-tree]].
- **그 다음**: iOS 실주행 확인 → #473 후속 택1 → 스택 후속(세션상세 App 레벨 단일화) → 실기기 스팟체크 → #359/#307/#374 스모크 → grill 백로그.

## 현재 상태
- updatedAt: 2026-06-24
- baseHarness / activeStack / harnessMode: `.harness/policy/profile.json` 참고
- 코칭 작업 시 `.harness/project/professional-coach-review-trigger.md` 강제(SSOT 선독→배치 시 그릴→커밋 게이트).

## 제품 구조 (고정 사실)
- 제품명 `PaceLAB`. GitHub Pages 정적 프론트 + Supabase Auth/Postgres/Edge Function + OpenAI + iOS WKWebView/HealthKit 하이브리드.
- **모노레포(#250, 2026-06-08)**: 웹(repo root `src/`)과 네이티브(`native/`)가 **단일 .git/origin**. 브리지 계약은 웹↔네이티브 원자적 동시 변경. 네이티브 빌드는 harness:check 밖(수동 Xcode). 상세 [[native-repo-git-management]].
- AI 코칭은 세션 상세에서 열며 별도 Coach 탭 없음.

## 운영 기준 (단일 출처 포인터)
- 요청 단위 풀스택 창 운영, 완료 책임 창, Issue/worktree/branch 분리, 완료 승인 전 build/test/배포/commit/push 게이트, `main` 직접 commit/push 차단(`HARNESS_ALLOW_MAIN_*` 예외) → `.harness/project/workflow-rules.md` + `CLAUDE.md` 단일 출처.
- PaceLAB MVP 단계는 구현/버그/운영을 배포 확인까지 자동 진행 후 완료 승인 대기.

## 확인할 일
- 새 대화의 작업 유형을 먼저 선언하고 `.harness/project/workflow-rules.md` 시작 문서 표를 좁혀 읽는다.
- Supabase Edge Function(`coach-run` 등) 변경은 배포가 별도 필요.
