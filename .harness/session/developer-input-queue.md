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

현재 `open` 또는 `deferred` 항목이 없습니다.

> 초기 charter 질문 8건(charter-status/scope/success/risk, storage-policy, strava-timing, training-goal, coaching-scope)은 모두 답변되어 `project-charter.md`와 `project-memory.md`에 반영되었으므로, 하네스 v0.2.55 기억 표면 정리 기준에 따라 큐에서 제거했습니다.

## 운영 원칙
- 답변을 받으면 관련 문서(`project-charter.md`, `active-context.md`, `decision-log.md`)를 함께 갱신합니다.
- 유보된 질문은 삭제하지 않고 `deferred`로 남깁니다.
- `answered`/`obsolete` 항목은 관련 문서 반영을 확인한 뒤 큐에서 제거하거나 아카이브하고, 현재 파일에는 `open`/`deferred`만 상주시킵니다.
