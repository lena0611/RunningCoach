# 현재 컨텍스트

이 프로젝트의 최근 작업 상태와 다음 작업을 짧게 이어받기 위한 소비자 프로젝트 전용 문서입니다.
운영 규칙 본문은 여기서 중복하지 않고 `.harness/project/workflow-rules.md`와 `CLAUDE.md`를 가리킵니다.

> 하네스 본체의 개발 기록이 아닙니다. 설치된 프로젝트의 현재 작업 맥락만 기록합니다.
> 상세 인수인계는 (있으면) 프로젝트 루트 `HANDOFF.md`. 장기 지식은 에이전트 메모리.

## ⭐ 현재 작업 — 코칭 인간화 대수술(#402) 배포 완료, 검증·정리 단계 (2026-06-19)
- **완료·라이브**: coach-run을 "데이터 판정단"에서 **흐름으로 서사 읽는 안내자**로 재정의(원칙 0~5). 스트라이드 비채점·전후반 드리프트 소스 차단·Easy/LSD 초반통제·삭제 UX·인터뷰 라벨 정합. 모두 머지+엣지 v105 배포(PR #443~448). 메모리 [[coach-not-data-referee]].
- **신설 운영장치**: `#전문코치리뷰` 트리거 + 코칭 작업 전 SSOT 선독(의무) + commit-msg `Coach-Review` 게이트. 메모리 [[professional-coach-review-trigger]].
- **다음**: ① **#359**(롱런 네거티브 스플릿 오판) 이번 작업으로 해결됐을 가능성 → 실코칭 1회 확인 후 close ② #307 에픽 인터뷰 스모크(새 임포트 필요)·#374 실기기 ③ grill 설계 백로그 정리(라벨 `needs:design-grill` 또는 메모리).

## 현재 상태
- updatedAt: 2026-06-19
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
