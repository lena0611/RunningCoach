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
| return-moment-2026-07-03 | open | 자연만료 복귀 시 코치 탭 "회복 후 정리" 모먼트(showReturn)를 구현할까? `coachMoments.ts:183` doc 주석에 계획만 있고 미구현 — 현재 자연만료 복귀는 사용자에게 아무 환영/정리 멘트가 없다('돌아온 걸 환영' 토스트는 명시 '지금 복귀' 경로 전용). | 2026-07-03 인증 E2E 재실행에서 발견(복귀 램프 spec 이 이 문구를 단언하다 실패 → 실동작 기준으로 교정). 구현 시 코칭 도메인이라 SSOT(§휴식과 복귀·놓침 프레이밍 금지) 선행 + #전문코치리뷰 필요. | |

> 초기 charter 질문 8건(charter-status/scope/success/risk, storage-policy, strava-timing, training-goal, coaching-scope)은 모두 답변되어 `project-charter.md`와 `project-memory.md`에 반영되었으므로, 하네스 v0.2.55 기억 표면 정리 기준에 따라 큐에서 제거했습니다.

## 운영 원칙
- 답변을 받으면 관련 문서(`project-charter.md`, `active-context.md`, `decision-log.md`)를 함께 갱신합니다.
- 유보된 질문은 삭제하지 않고 `deferred`로 남깁니다.
- `answered`/`obsolete` 항목은 관련 문서 반영을 확인한 뒤 큐에서 제거하거나 아카이브하고, 현재 파일에는 `open`/`deferred`만 상주시킵니다.
