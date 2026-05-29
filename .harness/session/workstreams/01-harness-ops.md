# Workstream 01: 하네스/운영 기준

## 시작 문구

```text
이 대화창은 하네스/운영 기준 업무만 다룬다.
먼저 .harness/session/workstreams/01-harness-ops.md를 읽고, 하네스 문서/훅/Codex 어댑터 범위에서만 작업해줘.
MVP 단계에서는 단순 확인/검토/조사 요청이 아닌 한 중간 확인을 기다리지 말고 완료까지 진행해줘. 사용자가 중단점을 지정하면 그 지점에서 멈춰.
```

## 요청 처리 규칙
- 모든 사용자 요청을 처리하기 전에 이 창의 workstream이 `01-harness-ops`인지 먼저 확인한다.
- 현재 창의 workstream이 불명확하거나 요청이 담당 범위를 넘으면 넓은 작업을 진행하지 말고 대상 workstream과 인수인계 문구를 제안한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 공통 창간 운영 기준을 따른다.
- 완료 전 후속 창으로 넘길 때는 커밋하지 않고, 인수인계 문구에 `git status --short`, `git diff`, 필요 시 `git diff --staged` 확인 지시를 포함한다.

## 담당 범위
- `.harness/**` 기준 문서와 하네스 업데이트 결과 검토
- `CLAUDE.md`, `AGENTS.md`
- `.codex/**`, `.agents/**`
- 대화창 분리 운영, 완료 승인 게이트, 세션 인수인계 방식
- 하네스 소비자 프로젝트로서 발견한 개선점 정리

## 먼저 읽을 문서
1. `CLAUDE.md`
2. `AGENTS.md`
3. `.harness/session/active-context.md`
4. `.harness/project/workflow-rules.md`
5. `.harness/session/decision-log.md`
6. `.harness/policy/context-protocol.md`

## 관련 파일
- `.codex/hooks.json`
- `.codex/hooks/*.sh`
- `.codex/agents/*.toml`
- `.agents/skills/*/SKILL.md`
- `.harness/bin/*.mjs`
- `.harness/session/*.md`

## 제외 범위
- 러닝 기능 구현
- UI 화면 개선
- Supabase Edge Function 코칭 로직
- HealthKit/iOS 기능 구현

## 범위 밖 처리
- 러닝 기능 구현 판단이 필요하면 해당 workstream 창으로 넘긴다.
- 넘길 때는 현재까지 확인한 하네스 기준, 관련 파일, 왜 다른 창 판단이 필요한지 짧게 정리한 인수인계 문구를 작성한다.
- 직접 새 창을 열 수는 없으므로 사용자에게 붙여넣을 문구를 제공한다.

## 종료 전 기록
- 구조 결정은 `.harness/session/decision-log.md`
- 다음 창에 넘길 상태는 `.harness/session/active-context.md` 또는 `.harness/session/next-session-reminder.md`
- 반복 운영 규칙은 `.harness/project/workflow-rules.md`
