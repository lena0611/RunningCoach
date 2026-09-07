# Agent Decision Context

> 이 파일은 에이전트가 코딩 전에 읽을 판단 컨텍스트입니다. 개발자가 업무 지시 때마다 직접 실행할 필요는 없습니다.
> 진실 출처는 원본 문서와 실제 코드이며, 이 파일은 재생성 가능한 보조 산출물입니다.

- generatedAt: 2026-07-03T04:02:53.393Z
- task: 디자인 핸드오프 이식: 다크 단일 토큰 교체 + 5탭 IA 개편(코치 탭 신설) + 전 화면 리스킨 + 업적 전리품 카드

## User Request

디자인 핸드오프 이식: 다크 단일 토큰 교체 + 5탭 IA 개편(코치 탭 신설) + 전 화면 리스킨 + 업적 전리품 카드

## Task Type

- detected: ui
- confidence: medium
- reason: 화면, 디자인 키워드 감지

## Always Read

- CLAUDE.md
- .harness/policy/ai-standard-guiding-policy.md
- .harness/session/session-start-alert.md
- .harness/session/active-context.md

## Relevant Policies

- .harness/project/critical-paths.md (category: risk, priority: high, matched: task:ui)
- .harness/project/stack-preset-rules.md (category: stack, priority: medium, matched: ia)
- .harness/session/decision-log.md (matched: 핸드오프, 단일, 토큰, 교체, ia, 코치, 신설, 화면, 업적, 카드)
- .harness/project/domain-rules.md (matched: 단일, 토큰, 교체, ia, 코치, 화면, 업적, 카드)
- .harness/session/next-session-reminder.md (matched: 단일, 토큰, 교체, ia, 코치, 화면, 카드)
- .harness/project/architecture-rules.md (matched: 단일, 토큰, 코치, 화면, 카드)
- .harness/project/workflow-rules.md (matched: 디자인, 단일, 토큰, 화면, 카드)
- .harness/project/portability-guide.md (matched: 이식, 단일)
- .harness/skills/registry.json (matched: 디자인, 토큰, ia, 화면)
- .harness/session/project-memory.md (matched: 디자인, 단일, 화면)
- .harness/documentation/guide/index.html (matched: ia)
- .harness/session/README.md (matched: 핸드오프, 단일)

## Decision Rules

- 사용자 명시 지시와 회사 공통 필수 차단 기준을 먼저 확인합니다.
- 프로젝트 기준이 스택/템플릿 기준보다 구체적이면 프로젝트 기준을 우선합니다.
- 생성 컨텍스트는 기준이 아니며 원본 문서와 실제 코드가 우선합니다.
- 불명확한 기준 충돌은 `decision-log.md`, `developer-input-queue.md`, `waivers.json` 중 맞는 곳에 기록합니다.

## Selected Skills

### UI 변경 가드 흐름 (harness.ui-change-guard) — audience: consumer, priority: high, matched: task:ui, 디자인, 토큰, 화면
- purpose: UI 변경 요청에서 공통 컴포넌트 재사용, 디자인 토큰, 테마, 모바일 레이아웃 제약을 먼저 확인한다.
- read:
  - .harness/project/architecture-rules.md
  - .harness/project/workflow-rules.md
  - .harness/project/critical-paths.md
  - .harness/project/stack-preset-rules.md
- commands:
  - npm run harness:context -- "<UI 작업 설명>"
  - npm run harness:impact
  - npm run harness:check
- outputs:
  - 기존 공통 컴포넌트 재사용 가능 여부
  - 새 컴포넌트의 공통 승격 필요 여부
  - 디자인 토큰/테마/모바일 레이아웃/키보드/WebView 고려 여부
  - UI 회귀 검증 필요 여부
- records:
  - .harness/project/architecture-rules.md
  - .harness/project/workflow-rules.md
  - .harness/session/decision-log.md
### 요청 분류 흐름 (harness.request-triage) — audience: consumer/harness-maintainer/stack-author/template-author, priority: critical, matched: ia
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
### 커밋/푸시 최종화 흐름 (harness.commit-push-finalization) — audience: consumer, priority: critical
- purpose: 사용자가 커밋 또는 푸시를 승인했을 때 hook 설치 여부를 확인하고, 설치된 hook이 실행할 검증을 신뢰해 commit 직전 수동 harness:check 중복 실행을 피한다.
- read:
  - .harness/project/commit-push-rules.md
  - .harness/project/workflow-rules.md
  - .github/commit-template.txt
  - .harness/session/decision-log.md
- commands:
  - git config --get core.hooksPath
  - test -x .githooks/pre-commit && test -x .githooks/pre-push
  - npm run harness:impact
  - npm run harness:check  # 최종 검증만 요청했거나 hook 미설치/우회 환경일 때
  - git commit  # hook 설치 시 pre-commit이 npm run harness:check 실행
  - git push  # hook 설치 시 pre-push가 npm run harness:check -- --fast 실행
- outputs:
  - 사용자 요청 유형: 최종 검증만 / 커밋 / 커밋하고 푸시
  - git hook 설치 여부와 판단 근거
  - 중복 검증 생략 여부
  - 직접 실행한 검증 또는 hook이 실행할 검증
  - 커밋 메시지 후보
  - hook 미설치 또는 우회 시 직접 실행한 harness:check 결과
- records:
  - .harness/session/decision-log.md
  - .harness/session/manual-actions.md
### 운영 업무 접수 흐름 (harness.operational-work-intake) — audience: consumer, priority: critical
- purpose: JIRA로 들어온 운영 업무를 업무 유형과 출처 기준으로 접수하고 맞는 개발 스킬로 연결한다.
- read:
  - CLAUDE.md
  - .harness/session/session-start-alert.md
  - .harness/skills/README.md
  - .harness/skills/registry.json
  - .harness/maintenance/README.md
- commands:
  - npm run harness:context -- "<업무 유형> <JIRA URL 또는 요청 개요>"
  - npm run harness:impact
- outputs:
  - 업무 유형
  - JIRA URL
  - 요청 개요
  - 선택된 업무 스킬
  - 질문 또는 확인 필요 항목
  - 개발 완료 후보
  - 업무 히스토리 기록 승인 여부
- records:
  - .harness/session/developer-input-queue.md
  - .harness/session/active-context.md
  - .harness/session/next-session-reminder.md
  - .harness/maintenance/work-history/YYYY/

## Impact Candidates

- android/**
- critical
- ios/**
- package.json
- src/**
- src/core/**
- src/domain/**
- src/integrations/**
- src/security/**
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

- .harness/generated/project-map.md
- .harness/generated/import-map.md
- .harness/generated/detected-patterns.md

## Required Output

- 영향 범위 분석
- 구현 또는 수정 계획
- 코드/문서 변경
- 검증 결과
- 로컬룰 승격 후보
