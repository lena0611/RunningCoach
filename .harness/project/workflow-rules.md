# 작업 흐름 규칙

프로젝트 고유의 개발, 리뷰, 릴리스, 장애 대응 흐름을 기록합니다.

## 개발 흐름
- 먼저 도메인/아키텍처 결정이 일회성인지 반복 규칙인지 판단한다.
- 반복 규칙이면 `.harness/session/*`에만 두지 말고 `.harness/project/*` 문서로 승격한다.
- 구현은 GitHub Pages 정적 프론트 + Supabase 백엔드 경계를 우선하며, secret이 필요한 기능은 브라우저가 아니라 Supabase Edge Function 또는 서버리스 경계로 분리한다.
- 모바일 반복 사용 흐름을 우선 검토한다.
- 사용자 답변이 "추천/예상한 기본값대로"인 경우, 적용한 기본값을 `developer-input-queue.md`와 관련 project 문서에 구체적으로 남긴다.
- 버그픽스나 로직 강화 요청을 처리할 때는 코드 수정 전에 관련 project 룰 후보를 같이 찾고, 반복 가능성이 있으면 같은 커밋 또는 후속 커밋에서 `.harness/project/*`에 반영한다.
- `harness:check`의 “Project rule candidate check”는 통과 메시지가 아니라 실제 검토 요청으로 취급한다. 같은 종류의 버그가 재발 가능하면 룰을 업데이트한다.

## 리뷰 기준
- 원본 파일 또는 secret이 브라우저 저장소에 남지 않는지 확인한다.
- FIT import 결과가 거리, 시간, 페이스, 심박, 케이던스를 일관되게 계산하는지 확인한다.
- 저장 데이터 스키마 변경은 기존 로컬 데이터 호환성을 검토한다.
- Supabase 스키마 변경은 migration, repository 매핑, RLS/중복 방지, Edge Function 컨텍스트를 함께 확인한다.
- Vue 앱 부트스트랩은 인증/DB/HealthKit 같은 외부 I/O가 완료될 때까지 mount를 막지 않는다. 초기 인증은 짧은 timeout으로 제한하고, RunLog/Memory 동기화는 화면 mount 이후 store error 상태로 처리한다.
- HealthKit 자동 동기화 변경 시 `runStore` 로딩 완료 대기, 중복 외부 ID 처리, 일부 후보 실패 시 부분 성공 처리, 사용자 토스트 메시지를 함께 확인한다.
- 코칭 규칙 변경은 사용자 목표, 최근 기록, 부상/더위 제약과 충돌하지 않는지 확인한다.
- AI 코칭 변경은 선택 기록 날짜와 코칭 생성 시각을 혼동하지 않는지 확인한다.
- RunLog 기반 화면 변경은 Dashboard, Run Log, Coach가 같은 저장소 데이터를 일관되게 읽는지 확인한다.
- 목표 관련 계산은 현재 목표 `2026-11-21까지 10km 59:59`를 기준으로 검토한다.

## 릴리스 절차
- GitHub Pages 같은 정적 배포를 기준으로 `npm run build` 결과물을 사용한다.
- 배포 전 정적 라우팅과 PWA manifest가 유지되는지 확인한다.
- GitHub Pages 배포 직후 iOS WebView는 캐시/전파 지연이 있을 수 있다. 새 배포 후 첫 실행 이슈는 Pages 배포 완료, WebView 캐시, 앱 재시작, 네이티브 진단 로직 순서로 확인한다.

## 장애 대응
- 파일 import 실패 시 원본 파일을 저장하지 않고 사용자에게 수동 입력 경로를 제공한다.
- 저장 데이터 손상 가능성이 있으면 export/import 백업 기능을 우선 검토한다.
- Strava 연동 장애는 로컬 FIT import fallback을 유지한다.
- Dashboard가 0km 또는 빈 목록을 보이면 먼저 `run_logs` 저장 여부, 인증 세션, `runStore.load()` 호출 여부, 화면 로딩 오류 표시 여부를 순서대로 확인한다.
- 수정/삭제가 안 된다고 보고되면 API 실패와 UX 오해를 분리한다. 버튼 상태, 확인창, 오류 메시지, 수정 폼 위치를 먼저 점검한다.

## 검증 명령
- 검증 명령을 실행하기 전에는 프로젝트 루트의 `.nvmrc` 존재를 확인하고, 존재하면 반드시 `nvm use`를 먼저 실행한다. `nvm use` 없이 하네스/빌드/테스트를 돌려 Node 버전 오류가 나면 검증 절차 미준수로 본다.
- 기본 검증: `npm run build`
- 단위/컴포넌트 회귀 검증: `npm run test:run`
- 모바일 E2E smoke 검증: `npm run e2e`
- 하네스 검증: `npm run harness:check`
- 하네스 문맥 확인이 필요한 큰 변경: `npm run harness:context -- "<작업 설명>"`
- 검증 순서는 변경 성격에 맞는 단위/컴포넌트 테스트 또는 E2E 테스트 추가 여부를 먼저 판단하고, 필요한 테스트를 추가/갱신해 통과시킨 뒤 `npm run harness:check`로 간다. 하네스 체크는 테스트 필요성 판단을 대체하지 않는다.

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
