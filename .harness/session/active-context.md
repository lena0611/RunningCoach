# 현재 컨텍스트

이 프로젝트의 최근 작업 상태와 다음 작업을 짧게 이어받기 위한 소비자 프로젝트 전용 문서입니다.
운영 규칙 본문은 여기서 중복하지 않고 `.harness/project/workflow-rules.md`와 `CLAUDE.md`를 가리킵니다.

> 하네스 본체의 개발 기록이 아닙니다. 설치된 프로젝트의 현재 작업 맥락만 기록합니다.
> 상세 인수인계는 (있으면) 프로젝트 루트 `HANDOFF.md`. 장기 지식은 에이전트 메모리.

## ⭐ 현재 작업 — 휴식/복귀(#473) **Phase 1 + Phase 2 복귀 램프 코어 완료**, 라이브 스모크만 (2026-06-23)
- **#473 Phase 1(PR#476·477·478) + Phase 2 복귀 램프 코어(PR#480) 완료·라이브**: Phase 1=rested 닦달 차단·💤 배너·코치 보이스. **Phase 2 PR#480=복귀 시 현재 체력 재앵커+초반 N개 세션 Easy·거리캡(≤직전30일 최장+10% BJSM), drift 무관 무조건 강제, 4주 경계 차등(durationDays <7무램프/7~27→2/≥28→3), 명시·자연 복귀 통일+복귀윈도 캡 보존**. 2회 적대리뷰 반영. **다음 1순위 = 라이브 렌더 스모크**(휴식 선언 + 복귀 시 첫 세션 Easy·짧게+"회복 후 정리"·닦달 미발동). 그 후 부상 walk-run 후속 PR(현재 공백) 또는 coach-run LLM 휴식 인지. 상세 [[rest-and-return-coaching]]·이슈 #473 코멘트.
- **직전 세션 라이브**: #462 더블 minGap 웹 강한 확인(PR#469)→**#455 에픽 클로즈** / 공통 하네스 0.2.70(PR#471)+루트 CLAUDE.md 마커(PR#472).
- **직전·라이브**: #454 제안훈련 응답+주간정산+주 고정 뷰, #402 코칭 인간화. `#전문코치리뷰`+코칭 SSOT 선독 의무+commit-msg `Coach-Review` 게이트. 메모리 [[coach-not-data-referee]], [[professional-coach-review-trigger]], [[schedule-response-and-weekly-settlement]].
  - ⚠ **머지 규칙**: squash 후 `git diff <tip> origin/main` 빈결과 트리 검증 필수(#463 24→11 누락 사고), 의심 시 `--merge`. 메모리 [[pr-squash-merge-race-verify-tree]].
- **그 다음**: 실기기 스팟체크(#462 강한 확인 오버레이·#455 더블 카드) → #454 나머지 플로우 → #359/#307/#374 스모크 → grill 설계 백로그.

## 현재 상태
- updatedAt: 2026-06-23
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
