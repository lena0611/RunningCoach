# 작업 흐름 규칙

프로젝트 고유의 개발, 리뷰, 릴리스, 장애 대응 흐름을 기록합니다.

## 개발 흐름
- 정식 개발 작업의 단일 출처는 GitHub Issues로 둔다. 전체 상태판은 GitHub Project `PaceLAB Development`로 관리하며, 상세 기준은 `.harness/project/github-tracking-rules.md`를 따른다.
- 정식 Issue 작업은 Issue 단위 feature branch에서 수행하고, `main`은 머지와 배포 기준 브랜치로 유지한다. 동시에 여러 요청이 들어오면 각 Issue별 branch와 PR을 분리한다.
- 에이전트가 GitHub Issue/Project를 생성하거나 수정할 때는 로컬 `gh` CLI를 1차 경로로 사용한다. GitHub App connector의 Issue/Project write 권한 부족이 확인된 작업에서는 connector-first 시도 후 fallback하는 흐름을 반복하지 않는다.
- `.harness/project/*`는 장기 기준과 결정 문서로 유지하고, 개별 백로그/진행 상태는 GitHub Issues/Projects에 둔다.
- 에이전트가 Supabase 데이터를 조회/수정할 때는 앱의 인증 컨텍스트와 RLS 정책을 1차 경로로 사용한다. 인증 없는 직접 DB 조회나 service role/admin 우회 시도 후 앱 사용자 컨텍스트로 fallback하는 흐름을 반복하지 않는다.
- 아이디어는 `Idea` issue로 `Inbox`에 넣고, 목표/완료 조건/완료 책임 창/검증 후보가 정리되면 `Feature`, `Bug`, `Decision`, `Research` 등 정식 작업 issue로 승격한다.
- 먼저 도메인/아키텍처 결정이 일회성인지 반복 규칙인지 판단한다.
- 반복 규칙이면 `.harness/session/*`에만 두지 말고 `.harness/project/*` 문서로 승격한다.
- 구현은 GitHub Pages 정적 프론트 + Supabase 백엔드 경계를 우선하며, secret이 필요한 기능은 브라우저가 아니라 Supabase Edge Function 또는 서버리스 경계로 분리한다.
- 훈련법/문헌 지식화 요청이 많아지면 `.harness/project/training-knowledge-ops.md`의 운영 절차를 따른다. 사용자 요청 저장은 비용 없는 backlog insert로 유지하고, 조사/요약/규칙화는 별도 검토 작업으로 분리한다.
- 모바일 반복 사용 흐름을 우선 검토한다.
- 사용자 답변이 "추천/예상한 기본값대로"인 경우, 적용한 기본값을 `developer-input-queue.md`와 관련 project 문서에 구체적으로 남긴다.
- 버그픽스나 로직 강화 요청을 처리할 때는 코드 수정 전에 관련 project 룰 후보를 같이 찾고, 반복 가능성이 있으면 같은 커밋 또는 후속 커밋에서 `.harness/project/*`에 반영한다.
- `harness:check`의 “Project rule candidate check”는 통과 메시지가 아니라 실제 검토 요청으로 취급한다. 같은 종류의 버그가 재발 가능하면 룰을 업데이트한다.
- HealthKit/세션 상세/스플릿/경로 차트/자동 동기화/세션별 새로고침을 수정할 때는 구현 전에 `.harness/project/healthkit-data-contract.md`를 먼저 확인한다. 네이티브 후보 구조, 웹 `RunLog` 매핑, 샘플/랩/라우트 배열 의미를 추측하지 않는다.

## 대화창 분리 운영
- PaceLAB은 workstream 대화창 분리 운영을 명시적으로 채택한 프로젝트다. 하네스 본체의 일반 가이드는 선택형이지만, 이 프로젝트 안에서는 아래 규칙을 강하게 적용한다.
- 한 대화창은 하나의 주 작업 유형만 맡긴다. 기획, 버그픽스, UI, 코칭 로직, HealthKit/iOS, Supabase/Edge Function, 부상관리 도메인, 하네스/정책 정리는 서로 다른 대화창으로 분리한다.
- 각 대화창은 모든 사용자 요청을 처리하기 전에 현재 workstream 범위를 먼저 식별한다. 현재 창의 workstream이 불명확하면 넓은 작업을 진행하지 말고 사용자에게 workstream 확인을 요청한다.
- 모든 업무 요청은 시작할 때 `완료 책임 창`을 하나 정한다. 완료 책임 창은 업무 목표, 완료 조건, 후속 workstream 인수인계, 최종 리뷰, 검증 후보 정리를 소유한다.
- 단일 workstream 업무는 해당 workstream 창이 완료 책임 창이다. 여러 workstream을 거치는 업무는 처음 업무 목표를 받은 창을 임시 완료 책임 창으로 두되, 업무 중심이 다른 workstream으로 명확해지면 완료 책임을 그 창으로 이관한다.
- 기획/범위 판단이 중심인 업무는 `02-product-planning`, 하네스/운영 절차 자체를 정하는 업무는 `01-harness-ops`가 완료 책임 창이다.
- 완료 책임 창이 불명확하면 구현이나 문서 변경을 넓히지 않고 먼저 책임 창을 정한다. 다른 workstream 창은 자기 범위 작업을 수행한 뒤 완료 책임 창으로 결과를 돌려준다.
- 현재 창에 수행 역할이 있더라도 선행 결정이나 선행 구현이 다른 workstream에 있으면 현재 창에서 먼저 진행하지 않는다. 대상 workstream, 선행 이유, 붙여넣을 인수인계 문구를 제안한다.
- 사용자가 완료를 명시하면 현재 창에서 완료 처리해도 되는지 먼저 검토한다. 다른 workstream의 후속 확인이나 마무리가 남아 있으면 완료 처리 전에 대상 workstream으로 넘긴다.
- 사용자가 새 요청을 동시에 시작하면 기존 작업 branch에 섞지 않는다. 새 요청이 Issue 대상이면 새 Issue와 feature branch를 만들고, 기존 작업은 해당 Issue/branch/Project Status로 추적한다.
- 현재 대화창에서 주 작업 유형이 바뀌면 새 대화창으로 넘긴다. 단, 작업을 끝내기 위한 짧은 문서 갱신, 결정 로그, 검증 명령은 같은 대화창에서 마무리할 수 있다.
- 기존 workstream으로 안정적으로 처리하기 어려운 새 도메인이 반복적으로 등장하면 임의로 현재 창 범위를 넓히지 않는다. `01-harness-ops`에서 새 workstream 추가 여부를 검토하고, 필요하면 workstreams 폴더의 `NN-name.md`와 이 문서의 작업 유형 목록을 갱신한다.
- 새 대화창 첫 메시지는 작업 유형, 목표, 완료 조건, 관련 파일 또는 화면, 이전 대화의 인수인계 문구나 인수인계 파일을 포함한다.
- 같은 workstream 창을 새로 열어 컨텍스트를 줄일 때는 첫 메시지에 `01-harness-ops`처럼 workstream id를 포함한다. Codex hook은 사용자 프롬프트 본문의 workstream id를 감지해 해당 workstream 파일을 읽으라는 bootstrap 문구를 주입한다. 창 제목만으로 자동 감지한다고 가정하지 않는다.
- 창 간 인수인계 문구는 기본적으로 복사/붙여넣기용 임시 전달물이다. 진행 중에는 문서화를 늘리지 않고, 최종 완료 승인 시점에 남길 내용만 정리해 문서화한다.
- 완료 전 창 이동은 커밋 없이 진행할 수 있다. 후속 창 인수인계 문구에는 `git status --short`, `git diff`, 필요 시 `git diff --staged`로 현재 작업트리 변경분을 먼저 확인하라는 문장을 포함한다.
- 단, 여러 창이 이어서 알아야 하는 최신 상태, pending 작업, 구조 결정, 반복 규칙, 사용자 확인 질문은 다음 창이 이어받을 수 있도록 진행 중에도 관련 `.harness/session/*` 또는 `.harness/project/*` 문서에 최소 내역을 남긴다.
- 최종 완료 승인 시에는 임시 인수인계 문구 중 실제로 남길 가치가 있는 내용만 문서화하고, 단순 중간 전달 문구는 남기지 않는다.
- 대화창이 길어져 에이전트 응답이 느려지거나 서로 다른 도메인 판단이 섞이기 시작하면 구현을 더 밀지 말고 `.harness/session/active-context.md` 또는 별도 `thread-handoff-YYYY-MM-DD.md`에 인수인계를 남긴 뒤 새 대화창에서 재개한다.
- 긴 인수인계는 최신 상태와 다음 작업만 남긴다. 회고, 모든 시도 내역, 장황한 diff 설명은 넣지 않고 필요한 경우 `decision-log.md`나 관련 프로젝트 룰 문서로 승격한다.
- 여러 창을 거친 업무의 최종 검토는 완료 책임 창에서 모은다. 완료 책임 창은 남은 리스크, 미해결 질문, 검증 후보, 커밋 후보 범위를 정리하고 사용자 완료 승인을 기다린다.
- build, test, `harness:check`, commit, push, PR 생성은 `CLAUDE.md`의 완료 승인 게이트를 따른다.

작업 유형별 시작 문서:

| 작업 유형 | 먼저 읽을 문서 |
| --- | --- |
| 전체 목록 | `.harness/session/workstreams/README.md` |
| 백로그/이슈/프로젝트 운영 | `.harness/project/github-tracking-rules.md`, `.harness/project/workflow-rules.md` |
| 제품/기획/범위 | `.harness/project/project-charter.md`, `.harness/project/scope-contract.md`, `.harness/session/decision-log.md` |
| 버그픽스/회귀 | `.harness/session/active-context.md`, `.harness/project/workflow-rules.md`, 관련 `critical-paths.md` 항목 |
| UI/UX | `.harness/project/ui-system-contract.md`, `.harness/project/workflow-rules.md`, 영향 화면의 공통 컴포넌트 |
| 코칭/훈련 로직 | `.harness/project/ai-coaching-goal.md`, `.harness/project/running-coaching-standards.md`, `.harness/project/domain-rules.md` |
| HealthKit/iOS | `.harness/project/healthkit-data-contract.md`, `/Users/smart-tn-083/practice/RunningCoach` |
| Supabase/OpenAI Edge Function | `.harness/project/config-contract.md`, `.harness/project/ai-coaching-goal.md`, `supabase/functions/coach-run/index.ts` |
| 부상관리 도메인 | `.harness/project/domain-rules.md`, `.harness/project/ai-coaching-goal.md`, `src/shared/ui/InjuryBodySelector.vue` |
| 하네스/정책 | `.harness/policy/context-protocol.md`, `.harness/project/workflow-rules.md`, `.harness/session/decision-log.md` |

새 작업 유형을 추가할 때는 `.harness/session/workstreams/README.md`의 `새 workstream 추가 기준`을 따른다.

대화창 종료 또는 분기 전 기록 기준:

| 기록 위치 | 기록할 내용 |
| --- | --- |
| `.harness/session/active-context.md` | 현재 가장 최신 제품/작업 상태와 새 대화가 먼저 볼 인수인계 |
| `.harness/session/next-session-reminder.md` | 다음 대화창에서 바로 실행할 확인 순서와 작업 후보 |
| `.harness/session/decision-log.md` | 이후에도 영향을 주는 구조 결정, 예외, 기준 충돌 해결 |
| `.harness/session/project-memory.md` | 세션이 바뀌어도 오래 유지되는 안정적인 프로젝트 사실 |
| `.harness/session/developer-input-queue.md` | 사용자 확인 없이는 확정할 수 없는 질문 |

## 리뷰 기준
- 원본 파일 또는 secret이 브라우저 저장소에 남지 않는지 확인한다.
- FIT import 결과가 거리, 시간, 페이스, 심박, 케이던스를 일관되게 계산하는지 확인한다.
- 저장 데이터 스키마 변경은 기존 로컬 데이터 호환성을 검토한다.
- Supabase 스키마 변경은 migration, repository 매핑, RLS/중복 방지, Edge Function 컨텍스트를 함께 확인한다.
- Vue 앱 부트스트랩은 인증/DB/HealthKit 같은 외부 I/O가 완료될 때까지 mount를 막지 않는다. 초기 인증은 짧은 timeout으로 제한하고, RunLog/Memory 동기화는 화면 mount 이후 store error 상태로 처리한다.
- HealthKit 자동 동기화 변경 시 `runStore` 로딩 완료 대기, 중복 외부 ID 처리, 일부 후보 실패 시 부분 성공 처리, 사용자 토스트 메시지를 함께 확인한다.
- HealthKit 데이터 표시나 추론 변경 시 `.harness/project/healthkit-data-contract.md`와 실제 타입(`HealthKitRunCandidate`, `Lap`, `RunMetricSample`, `RunRoutePoint`)이 일치하는지 확인한다. 특히 lap은 Workoutdoors step이 아니라 1km 전후 split일 수 있고, 랩 최대심박은 원본에 없으면 `metricSamples` 기반 보정 표시라는 점을 리뷰한다.
- 코칭 규칙 변경은 사용자 목표, 최근 기록, 부상/더위 제약과 충돌하지 않는지 확인한다.
- AI 코칭 변경은 선택 기록 날짜와 코칭 생성 시각을 혼동하지 않는지 확인한다.
- RunLog 기반 화면 변경은 Dashboard, Run Log, Coach가 같은 저장소 데이터를 일관되게 읽는지 확인한다.
- 목표 관련 계산은 현재 목표 `2026-11-21까지 10km 59:59`를 기준으로 검토한다.

## 릴리스 절차
- GitHub Pages 같은 정적 배포를 기준으로 `npm run build` 결과물을 사용한다.
- AI 에이전트/하네스 운영 파일만 변경된 push는 GitHub Pages 배포를 트리거하지 않는다. `.github/workflows/pages.yml`의 `paths-ignore`는 `.harness/**`, `.codex/**`, `.agents/**`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, Copilot instructions, commit template에만 적용하고, `src/**`, `public/**`, `package.json`, `.nvmrc`, Vite 설정, workflow 자체, Supabase 함수는 배포 영향 후보로 유지한다.
- 배포 전 정적 라우팅과 PWA manifest가 유지되는지 확인한다.
- GitHub Pages 배포 직후 iOS WebView는 캐시/전파 지연이 있을 수 있다. 새 배포 후 첫 실행 이슈는 Pages 배포 완료, WebView 캐시, 앱 재시작, 네이티브 진단 로직 순서로 확인한다.

## 장애 대응
- 파일 import 실패 시 원본 파일을 저장하지 않고 사용자에게 수동 입력 경로를 제공한다.
- 저장 데이터 손상 가능성이 있으면 export/import 백업 기능을 우선 검토한다.
- Strava 연동 장애는 로컬 FIT import fallback을 유지한다.
- Dashboard가 0km 또는 빈 목록을 보이면 먼저 `run_logs` 저장 여부, 인증 세션, `runStore.load()` 호출 여부, 화면 로딩 오류 표시 여부를 순서대로 확인한다.
- 수정/삭제가 안 된다고 보고되면 API 실패와 UX 오해를 분리한다. 버튼 상태, 확인창, 오류 메시지, 수정 폼 위치를 먼저 점검한다.

## 검증 명령
- 아래 검증 명령은 `CLAUDE.md`의 완료 승인 게이트에 따라 사용자의 최종화 승인 뒤 실행한다.
- 검증 명령을 실행하기 전에는 프로젝트 루트의 `.nvmrc` 존재를 확인하고, 존재하면 반드시 `nvm use`를 먼저 실행한다. `nvm use` 없이 하네스/빌드/테스트를 돌려 Node 버전 오류가 나면 검증 절차 미준수로 본다.
- Codex 또는 새 터미널 셸에서 Node 버전이 낮아 npm 스크립트가 실패하면 작업을 포기하지 않는다. 프로젝트 루트에서 `. "$HOME/.nvm/nvm.sh" && nvm use`로 `.nvmrc` 버전을 활성화한 뒤 같은 npm 명령을 재시도한다.
- 기본 검증: `npm run build`
- 단위/컴포넌트 회귀 검증: `npm run test:run`
- 모바일 E2E smoke 검증: `npm run e2e`
- Supabase Edge Function 검증: `npm run supabase:functions:check`
- 하네스 검증: `npm run harness:check`
- 하네스 문맥 확인이 필요한 큰 변경: `npm run harness:context -- "<작업 설명>"`
- 검증 순서는 변경 성격에 맞는 단위/컴포넌트 테스트 또는 E2E 테스트 추가 여부를 먼저 판단하고, 필요한 테스트를 추가/갱신해 통과시킨 뒤 `npm run harness:check`로 간다. 하네스 체크는 테스트 필요성 판단을 대체하지 않는다.
- `supabase/functions/**`를 변경하면 `npm run harness:check`가 `supabase:functions:check`를 자동 호출한다. 그래도 Edge Function만 빠르게 확인할 때는 같은 Node 준비 절차 후 `npm run supabase:functions:check`를 직접 실행한다.

## 테스트 전략 선택지
테스트 루트나 `test` script가 없다면 아래 중 하나를 선택해 이 문서 또는 `decision-log.md`에 기록합니다.

1. 초기 단계: lint + build + 수동 확인
2. 단위 테스트: 프로젝트 스택에 맞는 unit test 도구 도입
3. 통합 테스트: API, 저장소, 외부 연동 경계 검증
4. E2E 테스트: 주요 사용자/운영 흐름 검증
5. 테스트 보류: 사유와 재검토 조건을 `decision-log.md`에 기록

## 회귀 테스트 기준
- 계산/포맷/추천 로직을 바꾸면 Vitest 단위 테스트를 먼저 추가하거나 갱신한다.
- 반복 UI 버그가 있었던 `BottomSheetSelect`, 날짜 표시, 페이스/시간 표시, Run Log action, stack header는 컴포넌트 테스트 대상이다.
- 코칭/채팅 입력 UI는 한 줄 기본, 최대 3줄 자동 확장, 입력 지우기 버튼, 원형 아이콘 전송 버튼을 기본 패턴으로 검토한다. 텍스트 전송 버튼이나 2줄 고정 textarea로 돌아가면 모바일 공간을 낭비하는 회귀로 본다.
- 스플릿/랩 목록처럼 모바일 폭이 좁은 표는 모든 주요 컬럼이 한 화면에서 최소한 일부 보이는지 확인한다. 컬럼 폭, gap, 숫자 폰트가 커져 케이던스/심박 같은 후행 컬럼이 사라지면 회귀로 본다.
- 라우팅/접근 제어/모바일 셸이 바뀌면 Playwright E2E smoke를 갱신한다.
- 하단 네비, lazy route import, GitHub Pages/iOS WebView 배포 캐시 복구를 건드리면 `요약 -> 기록 -> 기억 -> 요약` route 이동 E2E를 통과시킨다.
- Supabase, HealthKit, OpenAI 같은 외부 경계는 직접 호출하지 않고 adapter/mock 경계로 테스트한다.
- 신규 기능이 회귀 위험이 높은 화면 흐름을 추가하면 `build`만으로 완료하지 않고 `test:run` 또는 `e2e` 중 최소 하나를 함께 통과시킨다.

## 변경 규칙
- 작업 흐름이 바뀌면 README, CI, hook, `harness:check` 명령과 함께 검토합니다.
- 임시 예외는 `waivers.json` 또는 `decision-log.md`에 범위와 만료 조건을 남깁니다.
- `npm run hooks:install`은 `core.hooksPath`를 `.githooks`로 설정합니다. 기존 `.git/hooks/*` 또는 기존 `core.hooksPath`의 hook은 삭제하지 않고 `harness.previousHooksPath`에 저장해 `.githooks/*`에서 먼저 체인 실행합니다.
