# 현재 컨텍스트

이 프로젝트의 최근 작업 상태와 다음 작업을 짧게 이어받기 위한 소비자 프로젝트 전용 문서입니다.
운영 규칙 본문은 여기서 중복하지 않고 `.harness/project/workflow-rules.md`와 `CLAUDE.md`를 가리킵니다.

> 하네스 본체의 개발 기록이 아닙니다. 설치된 프로젝트의 현재 작업 맥락만 기록합니다.
> 상세 인수인계는 (있으면) 프로젝트 루트 `HANDOFF.md`. 장기 지식은 에이전트 메모리.

## ⭐ 현재 작업 — 같은 날 더블 웹(#455) + minGap 웹 동적 안내(#462 v1) 배포 완료 (2026-06-22)
- **완료·라이브 — #455 더블 웹(Phase 1~3)**: slot 모델(AM/PM)·런매칭·적격 게이트(경력36mo·볼륨80km·active부상·단일quality·ACWR≤1.5)·PM 이지 강제·코치 자동제안·UI(캐러셀 ×2 배지·더블 패널·추가 시트·차단 카드). 마이그레이션 `202606220001`(slot 칼럼) 원격 배포.
- **완료·라이브 — #462 v1**: 더블 세션 간 minGap을 **오전 런 실제 종료시각 기준 웹 동적 안내**(`evaluateDoubleGap`: 종료+5h 하한/+7h 최적 권장 오후 시작 + blocked/tight/ok 색). 더블 패널·추가 시트 gap 바 동적화. harness:check(test **649**+build) 통과. 컴포넌트 렌더 테스트 추가(레포 첫 .vue 마운트). 메모리 [[schedule-response-and-weekly-settlement]].
  - **설계 전환(#462)**: 웹엔 일반 훈련 세션 '시작' 이벤트 없음(워치→HealthKit import) → enterRace 하드차단 불가. v1=웹 안내만(인터랙티브 차단 없음), **진짜 시작 감지 하드가드는 네이티브 후속 #462(재오픈·OPEN)**. SSOT minGap "두 단계"로 정합, decision-log 2026-06-22.
  - ⚠ **머지 사고 교훈**: #463 스쿼시 머지가 파일 누락(24→11파일) → #464 롤포워드 복구. **이후 모든 머지는 트리 검증**(`git diff <branch-tip> origin/main` 빈결과) **필수**, 의심 시 `--merge`. 메모리 [[pr-squash-merge-race-verify-tree]].
- **직전·라이브**: #454 제안훈련 응답+주간정산+주 고정 뷰(`94331e7`), #402 코칭 인간화(v106), `#전문코치리뷰` + 코칭 SSOT 선독 의무 + commit-msg `Coach-Review` 게이트. 메모리 [[coach-not-data-referee]], [[professional-coach-review-trigger]].
- **다음**: ① **#462 네이티브 하드가드**(슬롯 실시각화·`LiveRunTracker.start()` 가드·종료시각 영속·브리지 원자 동시변경·수동 Xcode) ② 실기기 시각 스팟체크(#455 더블 카드·#462 동적 gap 바 색감 — 렌더 로직은 컴포넌트 테스트로 검증됨, 적격 더블 생기면) ③ **#454 나머지 플로우** 스팟체크 → 에픽 #362 마무리 ④ #359 토 LSD 스모크·#307 인터뷰·#374 실기기 ⑤ grill 백로그 정리.

## 현재 상태
- updatedAt: 2026-06-22
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
