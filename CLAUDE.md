<!-- harness-managed:start -->
<!--
  이 블록은 공통 하네스(harness-seed)가 소유하며 harness:update가 자동 갱신합니다.
  블록 안(harness-managed:start ~ harness-managed:end)은 직접 수정하지 마세요. 다음 업데이트 때 본체 정본으로 다시 채워집니다.
  프로젝트 고유 지침은 이 블록 "아래"(harness-managed:end 다음)에 작성하면 업데이트와 무관하게 영구 보존됩니다.
  관리 블록 기준과 프로젝트 영역 지침이 충돌하면 .harness/project/standards-layers.md의 "충돌 해석 순서"를 따릅니다.
-->
# CLAUDE

이 파일이 모든 에이전트의 기준 진입점입니다. 사내 표준 에이전트는 Claude입니다.

## 하네스 자동 인식 의무
- 작업 루트에서 `.harness/`, `AGENTS.md`, `CLAUDE.md` 중 하나라도 발견하면 사용자가 "하네스"를 언급하지 않아도 하네스 프로젝트로 간주합니다.
- 하네스 프로젝트에서는 기능 구현이나 파일 수정 전에 아래 "항상 읽는 최소 기준"을 먼저 읽습니다.
- 사용자가 단순 질문이 아니라 코드/문서/설정 변경을 요청하면, 변경 전에 반복 규칙으로 승격할 내용이 있는지 판단합니다.
- 반복되는 도메인 규칙, 아키텍처 경계, 검증 흐름은 `.harness/session/*`에만 두지 말고 `.harness/project/*` 문서로 승격합니다.
- 판단이 불확실하면 구현을 추측으로 고정하지 말고 `.harness/session/developer-input-queue.md`에 질문을 남기거나 사용자에게 인터뷰합니다.
- 작업 지시 직후 상태는 기본적으로 진행 중입니다. 사용자가 명시적으로 완료, 최종 검증, 커밋, 푸시, PR 생성을 승인하기 전에는 `build`, `test`, `harness:check`, commit, push, PR 생성을 실행하지 말고 검증 후보로만 보고합니다.
- 사용자가 `최종 검증만` 요청하면 `npm run harness:check`를 직접 실행합니다. 사용자가 `커밋` 또는 `커밋하고 푸시`를 요청했고 git hook이 설치되어 있으면 별도 선행 `harness:check`를 돌리지 않고 commit/push hook 검증을 신뢰합니다.
- hook이 설치되어 있지 않거나 `--no-verify` 등으로 우회되는 환경이면 에이전트가 직접 `npm run harness:check`를 실행한 뒤 commit/push를 진행합니다.

## 항상 읽는 최소 기준
1. `.harness/policy/ai-standard-guiding-policy.md`
2. `.harness/session/session-start-alert.md`
3. `.harness/session/active-context.md`

## 세션 재개 시 추가 확인
- `.harness/session/project-memory.md`
- `.harness/session/decision-log.md`
- `.harness/session/developer-input-queue.md`

## 작업별로 골라 읽는 기준
- `.harness/project/terminology.md`
- `.harness/project/local-methodology.md`
- `.harness/project/standards-layers.md`
- `.harness/project/domain-rules.md`
- `.harness/project/architecture-rules.md`
- `.harness/project/workflow-rules.md`
- `.harness/project/commit-push-rules.md`
- `.harness/project/stack-preset-rules.md`
- `.harness/project/template-contract.md`
- `.harness/project/bootstrap.md`
- `.harness/policy/context-protocol.md`
- `.harness/skills/README.md`
- `.harness/documentation/README.md`
- `.harness/stacks/README.md`

## 기준
- 하네스 본체는 `.harness/`에 있습니다.
- 플랫폼별 파일은 하네스 본체 밖의 어댑터입니다.
- `.claude/`는 Claude Code hooks, agents, slash command용 어댑터입니다.
- `AGENTS.md`는 이 파일을 가리키는 보조 진입점입니다.
- 개발 기준, 세션, 문서, 스택 기준은 `.harness/`를 단일 진실 출처로 봅니다.
- Claude Code에서는 `/reminder`, `/memory`, `/decision`, `/harness-scan` 명령을 사용해 세션 리마인더, 장기 메모리, 결정 로그, 프로젝트 스캔을 명시적으로 갱신합니다.
- Claude Code의 `SessionStart` hook은 `.harness/session/next-session-reminder.md`를 자동으로 보여주도록 구성합니다. Codex와 Copilot은 같은 강제 hook이 없으므로 이 파일과 `AGENTS.md`, `.codex/hooks/inject-context.sh`, `.github/copilot-instructions.md`를 통해 같은 기준을 안내합니다.

## 작업 원칙
- 모든 작업은 먼저 `.harness/policy/ai-standard-guiding-policy.md` 위배 여부를 확인합니다.
- 작업 전에는 최소 `npm run harness:impact`로 영향 범위를 확인합니다. `npm run harness:check`는 사용자가 최종 검증을 승인한 뒤 실행합니다.
- 큰 작업이나 생소한 영역은 `npm run harness:sync` 후 `npm run harness:context -- "<작업 설명>"`로 에이전트 판단 컨텍스트를 먼저 만듭니다.
- 프로젝트가 session workstreams README로 workstream 운영을 opt-in 했다면, 매 요청 시작 시 현재 workstream과 선행/후행 workstream 필요 여부를 먼저 식별합니다.
- `harness:context` 결과의 Selected Skills를 보고 읽을 문서, 실행할 명령, 기록 위치를 좁힌 뒤 작업합니다.
- 개발 기준 문서, 스택 문서, `src/`를 변경하면 관련 반대편 문서/코드도 함께 검토합니다.
- 코드 변경 후에는 도메인, 아키텍처, 워크플로우 로컬룰로 승격할 반복 패턴이나 검증 기준이 생겼는지 반드시 점검합니다.
- 실제 업무 진행을 개발자에게 보고할 때는 원시 내부 추론이 아니라 `[harness] request/context/impact/action/decision/verify` 형태의 visible trace로 요약합니다. 단순 질문 응답, 잡담, 메타 확인처럼 업무 진행 보고가 아닌 턴에는 이 형식을 강요하지 않습니다.
- 에이전트 작업에서는 로컬 git hook 설치 여부와 무관하게 기준 계층을 따릅니다. 다만 완료 승인 전에는 무거운 검증과 side effect 있는 작업을 실행하지 않습니다. 승인 후 최종화 단계에서 `최종 검증만` 요청은 직접 검사, `커밋/푸시` 요청은 설치된 hook 검사에 맡겨 중복 실행을 피합니다.
- 새 프로젝트 방향이 비어 있으면 구현보다 `.harness/project/bootstrap.md` 인터뷰를 먼저 진행합니다.
<!-- harness-managed:end -->

<!--
  이 줄 아래는 프로젝트 소유 영역입니다. 프로젝트 고유의 에이전트 진입 지침(아키텍처 경계, 읽기 순서 예외, 워크플로우 보충 등)을 자유롭게 작성하세요.
  harness:update는 위 harness-managed 블록만 갱신하고 이 영역은 보존합니다.
-->

## 검증·보고 방식 (필수 — 사용자에게 수동 테스트를 시키지 않는다)
- **작업 검증은 에이전트가 직접 한다.** 사용자에게 "스모크 테스트 해보세요"라고 떠넘기지 말고, **로컬호스트(`npm run dev`, 보통 :5173~)를 자율로 띄워 다양한 사용자 시나리오로 직접 QA**한다. chrome-devtools(브라우저 제어)로 화면을 열고 클릭·입력·렌더·상태를 직접 확인한다.
- **인증이 필요할 때만** 사용자에게 로그인을 요청한다(앱은 이메일 OTP). 그 외엔 사용자 개입 없이 진행한다.
- **실데이터 파괴 변경(예: 사용자의 실제 휴식/스케줄을 되돌리기 어렵게 바꾸는 액션)은 실행 전 확인**한다 — 자율 QA는 비파괴 케이스를 우선하고, 파괴적 라이브 동작만 승인받는다.
- **보고는 목록으로.** "이런이런 사용자 시나리오로 해당 기능을 테스트 완료했고, 각 테스트케이스별로 이렇게 나왔다(케이스 → 기대 → 결과 ✅/❌)" 형태의 케이스 목록으로 보고한다.
- **사용자와의 대화는 항상 쉽게(평이하게) 설명한다.** (작업 진행 trace는 별개. 메모리 [[explain-simply-by-default]])
- **인증 필요한 기능의 E2E**는 테스트 계정 저장 세션으로 자동화한다: `playwright.rest.config.ts` + `e2e/*.spec.ts`, 세션은 `e2e/.auth/qa-storage.json`(gitignore·테스트 계정 lena0611+qa). 실행: dev 서버(`npm run dev`) 뜬 상태에서 `npx playwright test --config playwright.rest.config.ts`. 세션 만료 시 테스트 계정 재로그인 후 storageState 재생성. 대시보드 일부 버튼은 하단 네비 오버레이로 좌표 클릭이 안 먹어 DOM click(`el.click()`) 사용. **시간·시드가 필요한 시나리오(예: 복귀 램프=레이스 목표+과거 휴식)는 DEV 전용 시드 훅 `window.__pacelabE2E`(`src/app/devE2ESeed.ts`, 프로덕션 제외)로 결정론적 상태를 깐다.**

## 작업별로 골라 읽는 추가 기준 (프로젝트 전용 — 위 managed 블록의 "작업별로 골라 읽는 기준"에 더한다)
- `.harness/project/running-coaching-standards.md` (코칭 동작·처방·브리핑·피드백 작업 시 **구현 전 필수 선행**)
- `.harness/project/running-injury-knowledge.md` (부상·통증 관련 코칭 작업 시 **구현 전 필수 선행**)
- `.harness/project/ui-guidelines.md` (UI/화면/컴포넌트/스타일/레이아웃 작업 시 **구현 전 필수 선행**)
- `.harness/project/ui-system-contract.md` (UI 토큰·공유 컴포넌트 1차 강제 계약 — UI 작업 시 먼저 읽는다)
- `.harness/project/professional-coach-review-trigger.md` (`#전문코치리뷰` 트리거 시 필수)
- `.harness/project/data-change-impact-map.md` (런 인입·세션·부상·휴식복귀·삭제·레이싱·목표 등 **데이터/이벤트 변경 시 구현 전 필독 게이트** — 작은 변경이 일으키는 하류 코칭 연쇄를 진입점 트리로 확인. 연쇄 코드를 바꾸면 이 맵도 함께 갱신한다)

## 채팅 트리거
- 사용자가 채팅에 **`#전문코치리뷰`**(또는 `#전문코치 리뷰`, `#코치리뷰`)라고 입력하면 `.harness/project/professional-coach-review-trigger.md` 프로토콜을 실행합니다. 방금/현재 문맥의 코칭 작업이 딥리서치의 권위 있는 코치 의도와 부합하는지, 사용자(초보 러너) 요청에 휘둘려 전문 코치라면 안 할 선택을 하지 않았는지 도메인 교차검증합니다. **코드 리뷰가 아닙니다**(코드 품질은 `/codex`).
- **코칭 작업 기본 절차(예외 없이)**: 코칭 동작/지식(coach-run, sessionQuality/sessionBriefing 등 `src/shared/lib/coaching`, CoachMessage, 처방·브리핑·피드백)을 건드리는 작업은 **코드를 짜기 전에 먼저** 코치 SSOT(`running-coaching-standards.md`, 부상 관련 시 `running-injury-knowledge.md`)와 관련 메모리를 읽습니다. 사용자 요청이 권위 코치 의도와 배치되면 **구현 전에** 사용자와 그릴(사전 조율)합니다. 필요한 코치 지식이 SSOT에 없으면 심층 리서치로 확보→SSOT 적재 후 진행합니다. 이건 권장이 아니라 기본값입니다.
- **코칭 도메인 커밋 게이트(강제)**: 코칭 도메인 파일이 스테이징되면 `commit-msg` 훅이 커밋 메시지의 `Coach-Review:` 트레일러를 요구합니다. #전문코치리뷰 수행 후 배치되면 그릴(커밋 보류), 통과면 `Coach-Review: pass — <근거/출처>`(비코칭 기계 변경은 `Coach-Review: n/a — <사유>`)를 답니다.

## 모노레포 구조 (#250)
- 이 repo는 **웹 + 네이티브(iOS) 모노레포**입니다. 웹은 repo root(`src/`, `vite.config.ts`, `.harness/` 등 그대로), 네이티브는 `native/`(`native/RunningCoach.xcodeproj`, Swift 소스, 브리지)에 있습니다.
- **단일 `.git`/단일 origin.** 웹과 네이티브 변경을 **하나의 commit/PR로 원자적**으로 한다 — 특히 `runContext*` 브리지 계약은 웹 `src/features/*/*Bridge.ts`와 네이티브 `native/RunningCoach/RunContextWebView.swift`를 **동시 변경**한다.
- 네이티브 빌드 검증은 harness:check 대상이 아니라 **수동(Xcode/`xcodebuild`)** 입니다. native 변경은 critical-path 수동 검증 경로로 다룹니다.
- worktree는 단일 `.git` 기준으로 만들고, iOS 작업도 같은 worktree의 `native/` 하위에서 합니다.
- 과거 별도 네이티브 repo(`RunningCoach-Native-Swift`)는 archive됨. DeviceCheck 보안 강화는 보류(#248).

