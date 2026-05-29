# Workstreams

이 폴더는 Codex 대화창을 업무 유형별로 분리해 시작하기 위한 소비자 프로젝트용 진입점입니다.

새 대화창을 열 때는 해당 workstream 파일 하나를 먼저 읽게 하고, 그 파일의 범위 안에서만 작업을 진행합니다. 다른 업무 유형으로 넘어가야 하면 현재 대화창에서 계속 확장하지 말고 새 workstream 대화창으로 분리합니다.

일반론 가이드는 [Workstream Chat Splitting Guide](../../documentation/workstream-chat-splitting-guide.md)를 참고합니다.

이 프로젝트는 workstream 운영을 명시적으로 채택한 상태입니다. 하네스 본체의 일반 가이드는 선택형으로 약하게 제공하더라도, PaceLAB 안에서는 모든 대화창이 이 README와 각 workstream 파일의 범위 식별, 선행 workstream 안내, 완료 전 후속창 검토, 커밋 없는 임시 인수인계를 강하게 적용합니다.

## 대화창 목록
- [01-harness-ops.md](./01-harness-ops.md): 하네스, Codex 어댑터, 작업 운영 기준
- [02-product-planning.md](./02-product-planning.md): 제품 기획, 범위, 우선순위
- [03-ui-ux.md](./03-ui-ux.md): 화면, 모바일 UX, 공통 UI 시스템
- [04-running-logic.md](./04-running-logic.md): 러닝 도메인, 훈련 판정, 목표 계산
- [05-ai-coaching.md](./05-ai-coaching.md): AI 코칭, 프롬프트, Supabase Edge Function
- [06-healthkit-ios.md](./06-healthkit-ios.md): HealthKit, iOS WebView 브리지
- [07-data-supabase.md](./07-data-supabase.md): DB, 저장소, migration, 데이터 동기화
- [08-injury-domain.md](./08-injury-domain.md): 부상관리, 컨디션, 회복 도메인

## 새 workstream 추가 기준

기존 01~08 범위로 처리하기 어려운 새 도메인이 반복적으로 등장하면, 현재 창에서 임의로 계속 확장하지 않고 `01-harness-ops`로 새 workstream 등록 검토를 넘깁니다.

새 workstream은 아래 조건 중 하나 이상을 만족할 때 추가합니다.

- 기존 workstream의 제외 범위에 반복적으로 걸린다.
- 별도 도메인 규칙, 데이터 계약, 검증 기준, 사용자 인터뷰가 필요하다.
- 여러 기존 workstream에 걸쳐 있지만 한 창이 주도권을 가져야 맥락이 안정된다.
- 한두 번의 임시 작업이 아니라 장기적으로 반복될 가능성이 높다.

새 workstream을 추가할 때는 `01-harness-ops` 창에서 다음을 갱신합니다.

- workstreams 폴더의 `NN-name.md` 새 파일
- 이 README의 `대화창 목록`
- `.harness/project/workflow-rules.md`의 작업 유형 목록과 시작 문서 표
- 필요하면 `.harness/session/project-memory.md`, `.harness/session/decision-log.md`, `.harness/session/next-session-reminder.md`

새 workstream 파일은 기존 파일과 같은 구조를 사용합니다: 시작 문구, 요청 처리 규칙, 담당 범위, 먼저 읽을 문서, 관련 파일, 제외 범위, 범위 밖 처리, 종료 전 기록.

새 창 생성 자체는 사용자가 수행합니다. 에이전트는 대상 창 이름, 새 workstream 파일명, 붙여넣을 시작 문구를 제안합니다.

## 공통 시작 문구

```text
이 대화창은 <workstream 파일명> 업무만 다룬다.
먼저 해당 md와 그 안의 "먼저 읽을 문서"만 읽고, 범위를 벗어나는 요청은 새 대화창으로 분리하자.
완료 승인 전에는 build/test/harness:check/commit/push/PR을 실행하지 말고 후보로만 보고한다.
```

Codex `UserPromptSubmit` hook은 첫 메시지에 `01-harness-ops`, `02-product-planning` 같은 workstream id가 들어 있으면 해당 파일을 읽으라는 bootstrap 문구를 주입한다. 새 창을 같은 workstream으로 다시 열 때는 아래처럼 줄여 쓸 수 있다.

```text
이 창은 01-harness-ops workstream이다.
```

창 제목만으로 자동 감지한다고 가정하지 않는다. 현재 Codex 어댑터는 사용자 프롬프트 본문에 포함된 workstream id만 안정적으로 감지한다.

## 열린 창 공통 새로고침

이미 열려 있는 여러 workstream 창에 최신 운영 기준을 다시 적용해야 할 때는 창마다 workstream id를 바꿔 붙이지 않습니다. 모든 창에 같은 문구를 붙여넣습니다.

```text
워크스트림 기준 새로고침.
현재 창이 기존에 맡고 있던 workstream을 유지해서 README와 해당 workstream 파일을 다시 확인하고, 이후 요청부터 최신 GitHub Issue/Project/worktree/comment 기준을 적용해줘.
```

Codex hook은 위와 같은 공통 새로고침 문구를 감지하면 특정 workstream id를 새로 지정하지 않고, 현재 대화 맥락에서 이미 확립된 workstream을 유지하라는 generic refresh 안내를 주입한다.

에이전트는 기존 workstream이 명확하면 해당 `.harness/session/workstreams/<id>.md`를 다시 읽고 계속 진행한다. 기존 workstream이 명확하지 않으면 넓은 작업을 진행하지 말고 사용자에게 workstream id를 확인한다.

## 완료 책임 창

모든 업무 요청은 시작할 때 `완료 책임 창`을 하나 정합니다. 완료 책임 창은 업무 목표, 완료 조건, 후속 workstream 인수인계, 최종 리뷰, 검증 후보 정리를 소유합니다.

- 단일 workstream 업무는 해당 workstream 창이 완료 책임 창입니다.
- 여러 workstream을 거치는 업무는 처음 업무 목표를 받은 창이 임시 완료 책임 창입니다.
- 업무의 중심이 다른 workstream으로 명확해지면 완료 책임을 그 창으로 이관합니다.
- 기획/범위 판단이 중심이면 `02-product-planning`이 완료 책임 창입니다.
- 하네스/운영 절차 자체를 정하는 업무는 `01-harness-ops`가 완료 책임 창입니다.
- 다른 workstream 창은 자기 범위 작업을 수행한 뒤 완료 책임 창으로 결과를 돌려줍니다.
- 완료 책임 창이 불명확하면 구현이나 문서 변경을 넓히지 않고 먼저 책임 창을 정합니다.

완료 책임 창은 모든 후속 창의 결과를 모은 뒤 남은 리스크, 미해결 질문, 최종 검증 후보, 커밋 후보 범위를 정리합니다. 사용자가 명시적으로 완료/최종 검증/커밋을 승인하기 전에는 build/test/harness:check/배포/commit/push/PR을 실행하지 않습니다.

## 범위 밖 처리

각 workstream 창은 모든 사용자 요청을 처리하기 전에 현재 창의 workstream 범위를 먼저 떠올립니다. workstream이 불명확하면 넓은 작업을 진행하지 말고 사용자에게 현재 창이 어떤 workstream인지 확인합니다.

요청을 시작할 때 완료 책임 창도 함께 식별합니다. 현재 창이 완료 책임 창이 아니면 자기 범위 작업 결과를 완료 책임 창으로 돌려보낼 인수인계 문구를 준비합니다.

현재 창에 수행할 역할이 일부 있어도, 선행 결정이나 선행 구현이 다른 workstream에 있으면 현재 창에서 먼저 진행하지 않습니다. 대상 workstream, 선행해야 하는 이유, 붙여넣을 인수인계 문구를 제안합니다.

사용자가 완료를 명시했을 때도 현재 창에서 완료 처리할 수 있는지 먼저 확인합니다. 다른 workstream의 검토나 마무리가 남아 있으면 완료 처리 대신 후속 창 인수인계를 제안합니다.

후속 창에 붙여넣는 인수인계 문구는 기본적으로 일회성 임시 전달물입니다. 진행 중에는 문서화를 늘리지 않고, 최종 완료 승인 시점에 남길 내용만 정리해 문서화합니다. 다만 아래 중 하나에 해당하면 다음 창이 이어받을 수 있도록 진행 중에도 문서에 최소 내역을 남깁니다.

- 여러 창이 이어서 알아야 하는 최신 상태나 pending 작업: `.harness/session/active-context.md` 또는 `.harness/session/next-session-reminder.md`
- 이후에도 유지될 결정, 예외, 충돌 해결 이유: `.harness/session/decision-log.md`
- 반복되는 도메인/아키텍처/워크플로우 기준: `.harness/project/*`
- 사용자 확인 없이는 확정할 수 없는 질문: `.harness/session/developer-input-queue.md`

최종 완료 승인 시에는 임시 인수인계 문구 중 실제로 남길 가치가 있는 내용만 위 문서들로 정리하고, 단순 중간 전달 문구는 남기지 않습니다.

완료 전 창 이동은 커밋 없이 진행할 수 있습니다. 후속 창 인수인계 문구에는 다음 창이 `git status --short`, `git diff`, 필요 시 `git diff --staged`로 현재 작업트리 변경분을 먼저 확인하라는 문장을 포함합니다.

각 workstream 창은 작업 중 자신의 범위를 벗어난 문제가 나오면 직접 구현을 계속 확장하지 않고, 아래 형식으로 창넘기기를 제안합니다.

```text
이 작업은 현재 <현재 workstream> 범위를 넘어 <대상 workstream> 판단이 필요합니다.
<대상 창 이름> 창에 아래 내용을 붙여넣어 이어가세요.

작업 유형: <대상 workstream>
이전 창: <현재 창 이름>
완료 책임 창: <완료 책임 workstream 또는 미정>
작업 상태: 완료/커밋 전 진행 중
먼저 확인할 것:
- `git status --short`
- `git diff`
- 필요 시 `git diff --staged`
현재까지 확인한 내용:
- ...
넘기는 이유:
- ...
관련 파일:
- ...
아직 남은 판단/구현:
- ...
완료 조건:
- ...
주의:
- 완료 승인 전에는 build/test/harness:check/배포/commit/push/PR을 실행하지 않는다.
```

작은 연결 작업은 같은 창에서 처리할 수 있지만, 판단 기준이 다른 업무 유형으로 넘어가면 새 창으로 분리합니다.
