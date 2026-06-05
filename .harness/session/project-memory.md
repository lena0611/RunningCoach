# 프로젝트 메모리

세션이 바뀌어도 유지되는 이 프로젝트의 안정적인 사실을 기록합니다.

> 하네스 본체 저장소의 설계 메모리가 아닙니다. 이 프로젝트의 도메인, 운영 방식, 반복되는 검증 기준만 남깁니다.

## 프로젝트 성격
- 프로젝트/서비스 이름: `PaceLAB`
- 소유 팀 또는 담당 주체: 개인용
- 주된 작업 유형: 개인 러닝 기록, 목표 추적, HealthKit/FIT 기반 기록 저장, AI 코칭
- 활성 스택: `.harness/policy/profile.json` 참고

## 반복해서 참고할 사실
- 웹 UI는 Vue 3 + Vite + TypeScript 기반 정적 앱으로 유지한다.
- 기능 화면은 GitHub Pages 정적 프론트, Supabase Auth/Postgres/Edge Function, OpenAI API, iOS WKWebView/HealthKit 브리지 조합으로 운영한다.
- 새 요청 창은 PaceLAB 기본 제품 표면을 시작 컨텍스트로 함께 떠올린다. 웹 프론트 래퍼는 이 저장소의 `src/**`와 GitHub Pages/iOS WebView 화면, iOS 네이티브 래퍼는 `/Users/smart-tn-083/practice/RunningCoach`, Supabase 백엔드는 `supabase/**`와 Auth/Postgres/RLS/Edge Function이다.
- 한 사용자 목표 안에서 프론트 표시, 네이티브 브리지, DB/동기화, Edge Function, OpenAI 코칭, 배포/캐시 영향이 연결되면 현재 요청 창이 전체 계약과 검증 후보를 소유한다.
- 특정 사용자의 Supabase 데이터 확인은 RLS를 전제로 처음부터 앱 로그인 세션, repository/store 함수, 또는 사용자가 제공한 현재 앱 컨텍스트의 사용자 ID로 재현한다. 익명 조회나 service role/admin 우회를 먼저 시도한 뒤 앱 컨텍스트로 fallback하지 않는다.
- OpenAI API Key는 브라우저나 iOS 앱에 두지 않고 Supabase Edge Function secret에만 둔다.
- iOS 네이티브 로컬 프로젝트는 `/Users/smart-tn-083/practice/RunningCoach`에 있다.
- Workoutdoors export 파일은 FIT 입력을 보조 경로로 유지한다. 기본 반복 사용 흐름은 HealthKit 자동 동기화와 세션별 HealthKit 재갱신이다.
- Strava 연동은 GitHub Pages 단독 정적 앱만으로 처리하지 않는다. OAuth `client_secret`, refresh token, webhook callback 보호를 위해 Cloudflare Worker, Vercel Function 등 최소 서버리스 백엔드를 둔다.
- AI 코칭은 세션 상세에서 열며, 별도 Coach 하단 탭은 제거된 상태다.
- PaceLAB은 상시 workstream 대화창 분리 운영을 중단하고, 요청 단위 새 창 운영을 기본으로 한다. 사용자는 새 대화창 첫 메시지에 업무 내용만 적고, 에이전트가 요청을 분류해 필요한 workstream 파일과 프로젝트 문서만 골라 읽는다.
- workstream 파일은 창 역할 분리 기준이 아니라 읽을거리 라우팅 인덱스다. 한 요청 안에서 기획, 디자인, 웹 개발, 네이티브, Supabase, AI 코칭, 하네스 운영이 함께 필요하면 현재 요청 창이 풀스택 담당자로 전체를 관리한다.
- 에이전트는 정식 개발 작업이 필요하다고 판단하면 직접 GitHub Issue를 생성하거나 기존 Issue를 확인한다. 사용자가 Issue를 먼저 만들 필요는 없다.
- 프롬프트에 Issue URL 또는 Issue 번호가 있으면 에이전트는 구현이나 workstream 라우팅 전에 Issue 본문, labels, Project fields를 먼저 조회한다.
- Issue 없이 업무 내용만 들어오면 에이전트는 요청을 한글 우선 제목, 문제/목표, 범위, 제외 범위, 완료 조건, 검증 후보, Project fields, label 후보로 구체화하고, 기존 Issue 검색 후 생성 또는 재사용을 판단한다.
- 사용자가 동시에 여러 업무를 요청하면 업무마다 Issue, worktree, branch를 분리한다. 같은 창이 여러 요청을 순차 관리할 수는 있지만, 파일 변경, 검증, 커밋, PR 범위는 Issue별 worktree 격리 원칙을 유지한다.
- 정식 개발 작업의 단일 출처는 GitHub Issues이고, 전체 상태판은 GitHub Project `PaceLAB Development`로 둔다. `.harness/project/*`는 장기 기준과 결정 문서로 유지한다.
- `Target=MVP` 정식 Issue 또는 PaceLAB MVP 단계의 완료 책임 창 안에서 해결 가능한 구현/버그/운영 요청은 먼저 GitHub Issue 생성/재사용과 Issue worktree/branch 분리를 완료한 뒤, 명시적 중단점이 없으면 검증, commit, push, PR/main 반영, 배포 확인까지 이어서 수행하고 보고한 다음 사용자 최종 완료 승인을 기다린다. Project `Done` 또는 Issue close는 사용자의 명시 완료 지시 후에만 수행한다.
- 사용자 완료 지시를 받은 뒤 Issue를 닫기 전에는 기준 작업트리 `/Users/smart-tn-083/practice/run-ai`의 local `main`을 `origin/main` 최신 상태로 맞춘다. 기준 작업트리에 미커밋 변경이 있으면 임의로 stash/reset하지 않고 상태를 보고한다.
- 정식 Issue를 `Done`으로 닫기 전에는 완료 책임 창이 재발 방지 기록 게이트를 통과한다. 여러 번의 수정/배포, 반복 회귀, 독립 업무 분리나 인수인계 실패, 공유 계약 변경, 에이전트 운영 실패가 있었다면 `project-memory`, `decision-log`, 관련 `.harness/project/*` 중 적절한 장기 기억을 갱신하고 final Issue comment에 `재발 방지 기록`을 남긴다.
- 모든 업무 요청은 시작할 때 `완료 책임 창`을 정한다. 기본 완료 책임 창은 현재 요청을 받은 새 창이며, 완료 조건, 최종 리뷰, 검증 후보, 필요한 후속 Issue 분리를 소유한다.
- 같은 목표 안의 여러 기술 영역은 현재 요청 창에서 처리한다. 분리 기준은 workstream 종류가 아니라 독립적인 목표, 동시 진행 필요성, 검증/배포 단위다.
- 사용자가 완료를 명시해도 현재 창에서 완료 처리할 수 있는지와 후속 독립 업무 분리가 필요한지를 먼저 검토한다.
- 기존 workstream 라우팅으로 안정적으로 처리하기 어려운 새 도메인이 반복되면 `01-harness-ops`에서 새 라우팅 파일 추가 여부를 검토한다.
- 새 대화창의 시작 문서와 종료 기록 기준은 `.harness/project/workflow-rules.md`의 `요청 단위 풀스택 창 운영`을 따른다.
- 일반 작업의 완료 승인 전 자동 검증/커밋 금지 원칙은 하네스 본체 `0.2.51`에 반영되었으므로 `CLAUDE.md`와 `AGENTS.md`를 따른다. PaceLAB MVP 구현/버그/운영 요청은 프로젝트 로컬 예외로 배포 확인까지 완료한 뒤 사용자 완료 승인을 기다린다.
- 기준 작업트리 `main` 직접 commit/push는 hook에서 차단한다. 사용자가 명시적으로 main 직접 기록/최종화 예외를 승인한 경우에만 `HARNESS_ALLOW_MAIN_COMMIT=1` 또는 `HARNESS_ALLOW_MAIN_PUSH=1`로 우회한다.
- Node 버전 불일치로 npm 스크립트가 실패하면 중단하지 않고 프로젝트 루트에서 `. "$HOME/.nvm/nvm.sh" && nvm use`로 `.nvmrc` 버전을 활성화한 뒤 재시도한다.
- Codex hook의 `nvm use`는 hook 자식 프로세스에만 적용된다. 실제 npm/tsc/build/test/harness 명령을 실행하는 shell에서는 다시 `. "$HOME/.nvm/nvm.sh" && nvm use`를 적용한다.
- Issue worktree는 `node_modules`를 자동으로 가져오지 않는다. 이 프로젝트는 `package-lock.json` 기준 npm 프로젝트이므로 새 worktree에서 `node_modules`가 없으면 `npm ci`로 의존성을 준비한 뒤 TypeScript/build/test를 실행한다.
- Issue worktree에서 commit/pre-push hook의 `npm run harness:check`는 lint/test/build를 **silent skip**한다(`결과: 통과`로 보이지만 실제 검증 안 함). 원인은 `guard.mjs`가 적용 여부를 gitignore된 `.harness/.stack-applied.json` 마커 존재로만 판정하는데, worktree(및 fresh clone/CI)는 추적 파일만 체크아웃해 그 마커가 없기 때문(`node_modules` 누락과 동일 이치). 단일 작업트리 브랜치 분기 모델에선 마커가 유지돼 문제가 없다. 대응: worktree 작업은 hook과 별개로 작업트리에서 `npm run build`+`npm run test:run`을 직접 돌려 보강한다(필요 시 worktree에서 `npm run stack:apply` 1회로 마커 생성 가능하나 profile.json/stack-preset-rules.md/harness-lock.json을 건드릴 수 있어 commit 전 `git status` 확인). 근본 수정은 상류 harness-seed 몫이며 2026-06-05 결정로그에 상류 제안을 남겼다.
- 부상관리 도메인은 0~5 통증 체크인, 사용자 승인 기반 완치 처리, 목표 예상/훈련 강도에 반영되는 부상/회복 게이트, 근거 출처와 의료 한계를 포함한 참고용 보강운동 기준을 따른다.
- 하단 네비 4탭(요약/기록/추세/기억)은 App.vue가 4페이지를 한 트랙에 동시 마운트하는 좌우 스와이프 pager다. 스크롤 모델은 상세 스택(`.memory-stack-page`)과 동일하게 `.app-shell.is-tab-home` 고정 100dvh + 각 `.tab-swipe-panel` 독립 내부 스크롤러다(바디 미스크롤). 탭 페이지는 `defineAsyncComponent` 지연 로드이며 App.vue에서 정적 import 금지(라우터 코드분할 무력화). iOS 제스처 계약은 2026-06-05 decision-log "스와이프 탭" 항목을 단일 출처로 따른다: Pointer preventDefault는 iOS 스크롤 못 막음(non-passive touchmove만), 첫 move 방향 확정, 제스처 중 overflow/touch-action 토글 금지(pointercancel 유발), pointercancel은 스냅백(네비는 pointerup만), 내부 스크롤러는 window scroll을 capture로 구독, 탭 도착 시 패널 scrollTop=0, 스크롤-구동 sticky는 `pacelab:tab-swipe-commit` 이벤트로 확정 즉시 해제.

## 기록 원칙
- 한 번뿐인 구현 세부사항은 기록하지 않습니다.
- 반복되는 도메인 규칙, 아키텍처 경계, 검증 기준만 남깁니다.
- 오래된 사실을 바꿀 때는 `decision-log.md`에 변경 이유를 남깁니다.
