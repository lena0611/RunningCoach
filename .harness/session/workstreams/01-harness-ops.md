# Workstream 01: 하네스/운영 기준

## 시작 문구

```text
이 요청은 하네스/운영 기준 중심으로 처리해줘.
먼저 .harness/session/workstreams/01-harness-ops.md를 읽고, 같은 목표 안에 필요한 관련 영역은 이 창에서 함께 관리해줘.
MVP 단계에서는 단순 확인/검토/조사 요청이 아닌 한 중간 확인을 기다리지 말고 완료까지 진행해줘. 사용자가 중단점을 지정하면 그 지점에서 멈춰.
```

## 요청 처리 규칙
- 이 파일은 담당 창 고정 기준이 아니라 `01-harness-ops` 읽을거리 라우팅 기준이다.
- 요청 목표가 하네스/운영 기준 중심인지 확인하고, 같은 목표 안의 관련 구현/문서 변경은 현재 요청 창에서 함께 처리한다.
- 독립 목표나 동시 업무가 섞이면 넓히지 말고 별도 Issue/worktree/branch로 분리한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 요청 단위 운영 기준을 따른다.
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

## 인접 영역 처리와 분리 기준
- 현재 하네스/운영 요청을 완료하는 데 필요한 러닝 기능 영향 검토는 관련 workstream 파일을 추가로 읽고 같은 창에서 처리한다.
- 러닝 기능 구현 자체가 독립 목표가 되면 별도 Issue/worktree/branch로 분리한다.
- 분리할 때는 현재까지 확인한 하네스 기준, 관련 파일, 왜 별도 작업인지 짧게 정리한 인수인계 문구를 작성한다.

## 종료 전 기록
- 구조 결정은 `.harness/session/decision-log.md`
- 다음 창에 넘길 상태는 `.harness/session/active-context.md` 또는 `.harness/session/next-session-reminder.md`
- 반복 운영 규칙은 `.harness/project/workflow-rules.md`
