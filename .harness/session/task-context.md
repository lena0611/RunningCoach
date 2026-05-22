# Agent Decision Context

> 이 파일은 에이전트가 코딩 전에 읽을 판단 컨텍스트입니다. 개발자가 업무 지시 때마다 직접 실행할 필요는 없습니다.
> 진실 출처는 원본 문서와 실제 코드이며, 이 파일은 재생성 가능한 보조 산출물입니다.

- generatedAt: 2026-05-21T07:40:12.410Z
- task: iOS HealthKit hybrid bridge for RunContext Vue app

## User Request

iOS HealthKit hybrid bridge for RunContext Vue app

## Task Type

- detected: unknown
- confidence: low
- reason: 작업 설명에서 작업 유형 키워드를 찾지 못했습니다.

## Always Read

- CLAUDE.md
- .harness/policy/ai-standard-guiding-policy.md
- .harness/session/session-start-alert.md
- .harness/session/active-context.md

## Relevant Policies

- .harness/project/stack-preset-rules.md (category: stack, priority: medium, matched: vue)
- .harness/project/project-charter.md (matched: ios, healthkit, runcontext, vue, app)
- .harness/project/architecture-rules.md (matched: ios, healthkit, vue, app)
- .harness/session/decision-log.md (matched: ios, healthkit, runcontext, vue, app)
- .harness/policy/policy-registry.json (matched: bridge, for, app)
- .harness/documentation/guide/index.html (matched: for, app)
- .harness/policy/profile.json (matched: vue, app)
- .harness/project/bootstrap.md (matched: app)
- .harness/project/README.md (matched: app)
- .harness/documentation/context-registry.json (matched: vue, app)
- .harness/policy/enforcement-ladder.md (matched: for)
- .harness/project/portability-guide.md (matched: app)

## Decision Rules

- 사용자 명시 지시와 회사 공통 필수 차단 기준을 먼저 확인합니다.
- 프로젝트 기준이 스택/템플릿 기준보다 구체적이면 프로젝트 기준을 우선합니다.
- 생성 컨텍스트는 기준이 아니며 원본 문서와 실제 코드가 우선합니다.
- 불명확한 기준 충돌은 `decision-log.md`, `developer-input-queue.md`, `waivers.json` 중 맞는 곳에 기록합니다.

## Selected Skills

### 요청 분류 흐름 (harness.request-triage) — audience: consumer/harness-maintainer/stack-author/template-author, priority: critical, matched: task:unknown
- purpose: 요청의 목표, 범위, 완료 조건, 충돌 가능성을 먼저 나눈다.
- read:
  - CLAUDE.md
  - .harness/policy/ai-standard-guiding-policy.md
  - .harness/session/session-start-alert.md
  - .harness/session/active-context.md
- commands:
  - npm run harness:context -- "<작업 설명>"
  - npm run harness:impact
- outputs:
  - 작업 목표/범위/완료 조건
  - 읽을 문서 후보
  - 충돌 또는 질문 후보
- records:
  - .harness/session/developer-input-queue.md
  - .harness/session/decision-log.md
### 세션 시작 흐름 (harness.session-start) — audience: consumer/harness-maintainer, priority: high, matched: task:unknown
- purpose: 새 에이전트 세션에서 이전 맥락, 미결 질문, 장기 기억을 짧게 복구한다.
- read:
  - .harness/session/session-start-alert.md
  - .harness/session/next-session-reminder.md
  - .harness/session/project-memory.md
  - .harness/session/active-context.md
  - .harness/session/developer-input-queue.md
- commands:
  - npm run harness:impact
- outputs:
  - 이전 세션 요약
  - 미결 질문
  - 이번 세션 시작 전 확인할 기준
- records:
  - .harness/session/active-context.md
  - .harness/session/developer-input-queue.md
### 스택 선택 흐름 (harness.stack-selection) — audience: consumer, priority: medium, matched: task:unknown
- purpose: 공통 하네스만 설치된 프로젝트에서 맞는 스택 하네스를 고르거나 공통 기준 단독 운영 사유를 남긴다.
- read:
  - .harness/policy/profile.json
  - .harness/session/project-scan-report.md
  - .harness/project/standards-layers.md
  - .harness/project/bootstrap.md
- commands:
  - npm run harness:scan
  - npm run standards:list
  - npm run stack:status
- outputs:
  - 감지된 프로젝트 스택
  - 추천 스택 하네스 또는 공통 기준 단독 운영 사유
  - 다음 적용 명령
- records:
  - .harness/policy/profile.json
  - .harness/session/decision-log.md
### 기준 충돌 해결 흐름 (harness.conflict-resolution) — audience: consumer/harness-maintainer/stack-author/template-author, priority: high, matched: for
- purpose: 회사 공통, 스택, 템플릿, 프로젝트, 개인 기준이 충돌할 때 우선순위와 예외를 결정한다.
- read:
  - .harness/project/standards-layers.md
  - .harness/policy/enforcement-ladder.md
  - .harness/policy/waiver-guidelines.md
  - .harness/policy/context-protocol.md
- commands:
  - npm run harness:impact
  - npm run harness:check
- outputs:
  - 충돌 출처
  - 선택한 기준
  - 예외 허용 여부
  - 기록 위치
- records:
  - .harness/session/decision-log.md
  - .harness/policy/waivers.json
  - .harness/session/developer-input-queue.md

## Impact Candidates

- package.json
- src/**
- stack

## Conflict Check

기준 충돌 시 아래 순서로 해석합니다.
1. 회사 공통 필수 차단 기준
2. 사용자의 명시 지시
3. 프로젝트 기준
4. 템플릿 사용 계약
5. 스택 기준
6. 회사 공통 기본 운영 기준
7. 개인 기준
8. 에이전트 기본값

## Generated Context

- `.harness/generated/*` 파일이 없습니다. 필요하면 `npm run harness:sync`를 먼저 실행하세요.

## Required Output

- 영향 범위 분석
- 구현 또는 수정 계획
- 코드/문서 변경
- 검증 결과
- 로컬룰 승격 후보
