# 개발자 입력 큐

개발자 정보 부족 때문에 확정하지 못한 질문을 관리합니다.

## 상태 정의
- `open`: 다음 작업 전에 다시 확인해야 함
- `deferred`: 개발자가 이번 세션에서 답변을 유보함
- `answered`: 답변을 받아 반영함
- `obsolete`: 더 이상 필요하지 않음

## 현재 오픈 항목
| id | status | 질문 | 왜 필요한가 | 개발자 선택 |
| --- | --- | --- | --- | --- |
| intent-why-stale-2026-07-04 | open | 부상 severity/status 변경 시 오늘·미래 planned SessionIntent(why 문구)를 재생성할까? 현재는 생성 시점 스냅샷이라 심각도 조절 후 문구가 낡는다(숫자만 라이브 치환하는 표시 계층 밴드에이드 적용됨 — sessionBriefing.syncInjurySeverityText). 부상 해소 후 남는 문장 전체 stale 은 미해결. | 2026-07-04 사용자 보고(항목 1/5 vs 브리핑 2/5). 재생성 연쇄는 data-change-impact-map 부상 경로 갱신 필요. | |
| weatherkit-timeout-2026-07-04 | open | iOS 네이티브 WeatherKit 경로가 실기기에서 타임아웃 — 기기 디버깅(Xcode) 필요(회사망 차단, 집에서). 웹 KMA 경로는 정상. 표시 계층은 친화 문구+무음 배경 갱신으로 완화됨. | 2026-07-04 사용자 보고("날씨 api 실패"+영문 토스트). 원인 후보: WeatherKit 자격/네트워크/구 빌드. | |
| return-moment-2026-07-03 | open | 자연만료 복귀 시 코치 탭 "회복 후 정리" 모먼트(showReturn)를 구현할까? `coachMoments.ts:183` doc 주석에 계획만 있고 미구현 — 현재 자연만료 복귀는 사용자에게 아무 환영/정리 멘트가 없다('돌아온 걸 환영' 토스트는 명시 '지금 복귀' 경로 전용). | 2026-07-03 인증 E2E 재실행에서 발견(복귀 램프 spec 이 이 문구를 단언하다 실패 → 실동작 기준으로 교정). 구현 시 코칭 도메인이라 SSOT(§휴식과 복귀·놓침 프레이밍 금지) 선행 + #전문코치리뷰 필요. | |

> 초기 charter 질문 8건(charter-status/scope/success/risk, storage-policy, strava-timing, training-goal, coaching-scope)은 모두 답변되어 `project-charter.md`와 `project-memory.md`에 반영되었으므로, 하네스 v0.2.55 기억 표면 정리 기준에 따라 큐에서 제거했습니다.

## 운영 원칙
- 답변을 받으면 관련 문서(`project-charter.md`, `active-context.md`, `decision-log.md`)를 함께 갱신합니다.
- 유보된 질문은 삭제하지 않고 `deferred`로 남깁니다.
- `answered`/`obsolete` 항목은 관련 문서 반영을 확인한 뒤 큐에서 제거하거나 아카이브하고, 현재 파일에는 `open`/`deferred`만 상주시킵니다.
