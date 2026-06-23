# 다음 세션 리마인더

새 세션에서 바로 이어받기 위한 소비자 프로젝트 전용 **부트스트랩 메모**입니다.
운영 규칙 본문은 여기서 중복하지 않습니다. 최신 기준은 `active-context.md`,
`project-memory.md`, `.harness/project/workflow-rules.md`, `decision-log.md`를 우선합니다.
> 상세 인수인계가 있으면 프로젝트 루트 `HANDOFF.md`를 먼저 본다.

## ⭐ 현재 위치 (2026-06-23) — 휴식/복귀 기능(#473) **Phase 1 완료**(PR1-3 머지), 라이브 스모크만
- **#473 범용 휴식+복귀 코칭 Phase 1 완료** — PR1 #476(rested 상태+declareRest+닦달 차단 코어+마이그 `202606230001` 배포) · PR2 #477(activeRest+💤 데이-스트립/배너+선언 시트) · **PR3 #478(코치 보이스: 휴식 중 닦달 억제[안전 모먼트 injury·pain-followup는 예외 통과]·"푹 쉬세요"+회복주 1회·복귀 "회복 후 정리"·>4주 목표재점검·shouldOfferRecoveryRun 게이트[통제휴식 제시·injury 경증만·공존 중증부상 미제시]·부상 회복주 walk-run 톤·부상 체크인 "한동안 쉴게요" 진입)**. PR3는 4렌즈 적대리뷰(19에이전트) 후 확정발견 반영. PR별 상세·복귀 프로토콜 전부 [[rest-and-return-coaching]].
  - ⏳ **남은 것: 라이브 렌더 스모크**(실앱 휴식선언→💤배너+"푹 쉬세요" 카드·복귀일 "회복 후 정리"·닦달 미발동). PR2 배너 스모크와 함께.
- 직전 세션 머지 라이브: **#462 더블 minGap 웹 강한 확인**(PR#469) → **#455 에픽 클로즈** / 공통 하네스 0.2.70(PR#471) + 루트 CLAUDE.md 마커(PR#472).
- 직전 라이브: #454(제안훈련 응답+주간정산+주 고정 뷰), #402 코칭 인간화. `#전문코치리뷰`+코칭 SSOT 선독 의무+commit-msg `Coach-Review` 게이트. 메모리 [[coach-not-data-referee]], [[professional-coach-review-trigger]], [[schedule-response-and-weekly-settlement]].
  - ⚠ **머지 규칙**: squash 후 `git diff <tip> origin/main` 빈결과 트리 검증 필수(#463 24→11 누락 사고), 의심 시 `--merge`. [[pr-squash-merge-race-verify-tree]].

## 다음 1순위
1. **#473 휴식/복귀 라이브 렌더 스모크** — 실앱에서 휴식 선언 → 💤 데이-스트립 + "쉬는 중·복귀 D-N" 배너 + "푹 쉬세요"(회복주 1회) 카드, 복귀일 "회복 후 정리"(놓침 프레이밍 없음), 닦달(트리아지·재정렬·놓침 토스트) 미발동을 눈으로 확인. 통제 휴식(날씨) + 공존 중증부상 케이스 회복주 미제시도. 통과하면 Phase 1 클로즈, 이어서 **Phase 2(복귀 램프: 세션+10%·walk-run·목표재점검 액션화)** 또는 **coach-run LLM 휴식 인지**(채팅 닦달 구멍) 착수. 상세 [[rest-and-return-coaching]]·이슈 #473 코멘트.
2. **실기기 시각 스팟체크** — #462 강한 확인 오버레이(셀프레이스로 같은 날 둘째 시작 시) + #455 더블 카드 + 동적 gap 바(자연 발생 시, 위험 낮음).
3. **#454 나머지 플로우 실렌더 스팟체크** — 주 페이징·다른날로/스왑·포기 잔존·주말 트리아지. 통과면 에픽 #362 마무리.
4. **#359**(롱런 네거티브 스플릿) 토 LSD 스모크 · **#307** 인터뷰 스모크 · **#374** 주기화·개러지 실기기.
5. **grill 설계 백로그 정리** — 게이트 이슈(#260·#397·#411/#398/#408/#279/#375)·메모리-only 비전 → `needs:design-grill` 라벨/메모리 통합.
6. (이슈 미등록) 네이티브 fast-segment 임계 5:45→5:50 튜닝(수동 Xcode).

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
