# 다음 세션 리마인더

새 세션에서 바로 이어받기 위한 소비자 프로젝트 전용 메모입니다.

## 먼저 확인할 것
1. `git --no-pager status --short`
2. 변경분이 있으면 `git diff`, 필요 시 `git diff --staged`
3. `.harness/session/active-context.md`
4. `.harness/session/workstreams/README.md`
5. 해당 업무 유형의 `.harness/session/workstreams/*.md`
6. `.harness/session/developer-input-queue.md`

## 다음 작업
- 새 대화창의 작업 유형을 먼저 정합니다: 기획, 버그픽스, UI/UX, 코칭/훈련 로직, HealthKit/iOS, Supabase/OpenAI Edge Function, 부상관리 도메인, 하네스/정책.
- 모든 사용자 요청마다 현재 창의 workstream 범위를 먼저 식별합니다. 불명확하면 넓은 작업을 진행하지 말고 사용자에게 workstream 확인을 요청합니다.
- 모든 업무 요청은 시작할 때 `완료 책임 창`을 하나 정합니다. 완료 책임 창이 불명확하면 구현이나 문서 변경을 넓히기 전에 먼저 책임 창을 정합니다.
- 사용자가 완료를 명시해도 현재 창에서 완료 처리할 수 있는지, 후속 workstream 확인이 필요한지 먼저 검토합니다.
- 기존 01~08 workstream으로 안정적으로 처리하기 어려운 새 도메인이 반복되면 `01-harness-ops`에서 새 workstream 추가 여부를 먼저 검토합니다.
- 작업 유형별로 `.harness/session/workstreams/*.md`의 시작 문서만 좁혀 읽습니다.
- 이번 작업 설명이 있으면 `npm run harness:context -- "<작업 설명>"`으로 읽을 기준을 좁힙니다.
- 완료 승인 전에는 `build`, 테스트, `harness:check`, 배포, commit, push를 실행하지 않습니다. 이 원칙은 하네스 본체 `0.2.48`에 반영되어 있습니다.
- 긴 대화창을 마칠 때는 `active-context.md` 또는 `thread-handoff-YYYY-MM-DD.md`에 다음 대화가 이어받을 최소 정보만 남깁니다.
- `.harness/session/thread-handoff-2026-05-28.md`는 2026-05-28 긴 대화의 과거 스냅샷입니다. 최신 기준은 `active-context.md`, `project-memory.md`, `workflow-rules.md`, `decision-log.md`를 우선합니다.
