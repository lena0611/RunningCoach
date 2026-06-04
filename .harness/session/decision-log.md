# 결정 로그

이 문서는 이 프로젝트에서 내린 중요한 판단과 선택 이유를 남기는 소비자 프로젝트 전용 로그입니다.

> 하네스 본체의 변경 이력이나 릴리스 노트가 아닙니다. 하네스 본체 변경 기록은 하네스 저장소의 `CHANGELOG.md` 또는 릴리스 태그를 확인합니다.

## 기록 원칙
- 프로젝트 기준, 스택 기준, 템플릿 계약, 개인 기준이 충돌할 때 선택 이유를 남깁니다.
- 테스트 전략, 예외 허용, 아키텍처 경계, 운영 절차처럼 이후 작업에 영향을 주는 판단을 남깁니다.
- 단순 작업 로그나 일회성 구현 세부사항은 남기지 않습니다.
- 임시 예외는 가능하면 `.harness/policy/waivers.json`에 범위와 만료 조건을 함께 남깁니다.

## 2026-05-20 - 하네스 초기 설치 또는 업데이트
- baseHarness: 0.2.39
- 이 프로젝트의 구체적인 판단은 아직 기록되지 않았습니다.
- 설치 직후 분석은 `.harness/session/project-scan-report.md`와 `.harness/session/handoff.md`를 확인합니다.

## 2026-05-21 - AI 없는 정적 앱과 Strava 확장 방향
- OpenAI API 기반 대화/코칭은 별도 종량제 비용과 운영 부담 때문에 기본 경로에서 제외한다.
- 기본 구현은 GitHub Pages 같은 정적 호스팅이 가능한 Vue/PWA, 로컬 파일 파싱, 로컬 저장, 규칙 기반 코칭 엔진으로 유지한다.
- Workoutdoors 파일 import는 FIT 단일 포맷을 우선한다. 샘플 검토 결과 FIT는 세션/랩 요약과 원본 운동 지표가 안정적으로 들어 있어 GPX보다 거리 오차 위험이 낮고 TCX보다 파일 크기가 작다.
- 모바일에서 파일 export/import는 반복 UX가 불편하므로 장기 확장은 Strava API 연동으로 둔다.
- Strava 연동은 완전 정적 앱만으로 구현하지 않는다. OAuth token exchange에 `client_secret`이 필요하고 refresh token 보호가 필요하므로 최소 서버리스 백엔드를 사용한다.
- 후보 구조: GitHub Pages 정적 프론트 + Cloudflare Worker 또는 Vercel Function의 Strava OAuth/refresh/token proxy + 로컬 RunLog 저장.

## 2026-05-21 - FIT 단일 import 구현 정리
- 업로드 기본 경로를 Workoutdoors FIT 파일 하나로 제한했다.
- GPX, TCX, CSV 파싱 로직은 제거하고, FIT가 아닌 파일은 명시적으로 거부한다.
- 새 저장 기록의 출처는 `file_import`로 저장한다. 기존 로컬 저장소에 남아 있을 수 있는 `image_extracted` 값은 읽기 호환을 위해 타입에만 유지한다.
- 업로드 UI는 파일명과 크기만 표시하며, 원본 파일명과 파일 내용은 저장하지 않는다.

## 2026-05-21 - 근거 기반 오늘 훈련 평가 규칙
- 임시 목표 가능성 점수식을 줄이고, 오늘 선택된 `RunLog`를 목표 기준으로 평가하는 `dailyEvaluation`을 추가했다.
- 근거 축은 저강도 비중이 큰 지구력 훈련 분포, 최근 7일/이전 7일 부하 변화, 10km 목표 페이스, Riegel 예측식, 더위/known issues다.
- 7일/이전 7일 부하 비교는 ACWR 같은 부상 예측 공식으로 단정하지 않고 보수적 경고로만 사용한다.
- Riegel 예측식은 Race 또는 Tempo처럼 수행능력 신호가 있는 기록에 한해 목표 가능성 참고 지표로만 사용한다.
- 현재 로직은 개인 코칭 앱의 보수적 의사결정 규칙이며, 의료 진단이나 공식 훈련 처방이 아니다.

## 2026-05-21 - 개인화 입력 추가
- `TrainingMemory`에 `AthleteProfile`을 추가해 나이, 성별, 러닝 경력, 주간 목표 러닝 횟수, 선호 롱런 요일, 거리별 PB를 저장한다.
- 거리별 PB는 Riegel 예측식으로 10km 목표 가능성 보정에 사용한다.
- 나이, 러닝 경력, 주간 목표 러닝 횟수는 회복 보수성과 당일 훈련 평가 경고에 반영한다.
- 성별은 저장하되 현재 점수식에는 직접 반영하지 않는다. 성별 기반 성능 기준을 쓰려면 별도 근거와 사용자 동의가 필요하다.

## 2026-05-21 - 사용자 등록과 선택 사용자 목표
- 단일 사용자 전제에서 `RunContextUser` 목록으로 전환했다.
- 각 사용자는 별도 `TrainingMemory`와 목표를 가진다.
- Memory 화면에서 사용자 등록, 선택, 이름 수정, 선택 사용자 목표 입력을 처리한다.
- 새 RunLog는 현재 선택된 사용자 ID로 저장하고, 대시보드/기록/코칭은 선택 사용자 기록만 본다.
- 기존 로컬 RunLog는 migration 시 `default` 사용자에 연결한다.

## 2026-05-21 - iOS 하이브리드 HealthKit 방향
- 사용자는 화면은 현재 웹 UI를 유지하고, iOS 네이티브 레이어를 HealthKit 접근용으로 추가하는 하이브리드 구조를 원한다.
- 결정 방향: Vue UI는 WebView/로컬 번들로 유지하고, iOS 네이티브 타깃은 HealthKit 권한 요청, Workout/심박/거리/가능한 route 조회, 웹-네이티브 데이터 브리지만 담당한다.
- Workoutdoors 데이터는 Workoutdoors가 Apple 건강 앱/HealthKit에 저장한 값을 읽는 구조로 본다. Workoutdoors 앱 내부 데이터를 직접 읽지 않는다.
- HealthKit 접근에는 Xcode target HealthKit capability, Info.plist usage description, 실제 iPhone 사용자 권한 허용이 필요하다.
- App Store 출시 없이도 개발용 설치 앱에서 HealthKit 접근을 검토할 수 있으나, 장기 안정 사용은 Apple Developer Program 계정과 적절한 provisioning을 전제로 둔다.
- FIT import는 HealthKit에서 누락되는 세부 지표 보완용 fallback으로 유지한다.
- HealthKit 입력 타입과 웹 전달 후보 구조는 `.harness/project/healthkit-data-contract.md`에 별도 데이터 계약으로 둔다.

## 2026-05-21 - 웹 HealthKit 브리지 수신부
- Vue 업로드 화면에 HealthKit 가져오기 섹션을 추가했다.
- 웹에서 네이티브로 `runContextHealthKit` message handler를 호출하고, 네이티브는 `window.RunContextHealthKit.receiveRuns`로 후보를 돌려주는 계약을 사용한다.
- HealthKit 후보는 바로 저장하지 않고 기존 `RunForm` 확인/수정 흐름에 넣는다.
- 저장 출처는 FIT `file_import`, HealthKit `healthkit`, 수동 `manual`로 분리한다.

## 2026-05-21 - iOS HealthKit 브리지 구현
- Xcode `RunningCoach` 앱은 SwiftUI `ContentView`에서 `WKWebView` 기반 `RunContextWebView`를 연다.
- 앱 번들에 `WebApp/index.html`이 있으면 로컬 웹 번들을 우선 로드하고, 없으면 개발용 `http://localhost:5173/upload`를 로드한다.
- 네이티브 레이어는 HealthKit 권한을 요청하고 최근 러닝 workout, 거리, 시간, 페이스, 평균/최대 심박, 활동 칼로리 후보를 웹으로 전달한다.
- cadence, route, laps처럼 HealthKit/앱 저장 방식에 따라 누락될 수 있는 값은 후보 구조에서 nullable 또는 비어 있는 값으로 둔다.

## 2026-05-22 - Supabase + AI Coach 전환
- 웹 UI는 GitHub Pages 정적 배포로 유지하되, 일반 공개 브라우저 접근은 안내 페이지로 보내고 iOS 하이브리드 앱 또는 localhost에서만 기능을 연다.
- 백엔드/DB는 Supabase Auth, Postgres, Edge Functions로 통합한다.
- OpenAI API Key는 Supabase Edge Function secret에만 둔다.
- 기존 Rule Coach는 최종 판단에서 제거하고, 프로그램 로직은 AI가 쓰기 쉬운 통계/요약/최근 흐름 가공만 담당한다.
- 코칭 결과는 사용자에게 자연어 리포트만 보여주고, AI가 장기 기억 메모를 자동 저장한다.

## 2026-05-22 - Supabase 미설정 시 기능 차단
- GitHub Pages/iOS WebView에서 Supabase 환경변수가 없는 빌드는 기능 화면을 열지 않고 로그인 화면으로 보낸다.
- 이유: iOS 네이티브 브리지만 있어도 인증 없이 업로드 화면이 열리면 DB/RLS 검증이 누락되고 로컬 fallback처럼 보일 수 있다.
- 로컬 개발은 `.env`에 Supabase publishable 설정을 넣어 동일한 인증 경로로 검증한다.

## 2026-05-27 - 고도 기반 코스 타입 추론 기준
- `courseType`은 사용자가 수정 가능한 제안값이지만, HealthKit/FIT에서 고도 데이터가 들어오면 기본값을 더 적극적으로 추론한다.
- 거리당 상승/하강, route altitude range, route undulation을 함께 사용해 Flat, Mixed, Hilly, Trail을 구분한다.
- Track과 Treadmill은 고도만으로는 표면/장소를 단정할 수 없으므로 자동 추론하지 않고 사용자가 수정하도록 둔다.
- 이 기준은 훈련 품질 분석과 AI 코칭 문맥의 코스 난이도 판단에 쓰이므로 `.harness/project/domain-rules.md`와 HealthKit 데이터 계약에 함께 기록한다.

## 2026-05-27 - 외부 UI 라이브러리 대신 PaceLAB 자체 UI 시스템 유지
- 문제: 화면별 UI를 그때그때 만들면서 색상, spacing, card/list/input 패턴이 흔들릴 위험이 커졌다.
- 대안 검토: PrimeVue, Vuetify, Element Plus, Naive UI 같은 외부 UI 라이브러리 전면 도입은 안정적인 컴포넌트를 제공하지만, Apple Fitness/Strava/ChatGPT 중간 감성의 모바일 러닝 앱 톤을 라이브러리 기본 스타일에 맞추는 비용이 크다.
- 결정: 외부 UI 라이브러리는 전면 도입하지 않고, `src/app/styles.css` 토큰과 `src/shared/ui` 컴포넌트를 PaceLAB 자체 디자인시스템으로 본다.
- 실행: `.harness/project/ui-system-contract.md`를 추가해 디자인 토큰, 공통 컴포넌트, 승격 기준, 리뷰 체크리스트를 프로젝트 룰로 승격했다.
- 후속 원칙: 새 UI는 먼저 공통 컴포넌트 확장 가능성을 검토하고, 반복 가능성이 있으면 페이지 전용 CSS가 아니라 `src/shared/ui`로 승격한다.

## 2026-05-27 - 부상 부위 정규화와 보수적 보강운동
- 부상 부위는 자유 텍스트만으로 저장하지 않고 `normalizedAreas`에 근육/힘줄/인대/근막/관절/뼈 단위로 정규화한다.
- 기존 `area` 문자열은 레거시/표시용 요약으로 유지해 기존 데이터와 Supabase JSON 저장 구조를 깨지 않는다.
- 모바일 입력은 전신 회전 뷰와 상체/하체/발 목록을 함께 제공한다. 발/발목/아킬레스/족저근막처럼 러닝에 민감한 부위는 별도 그룹으로 크게 선택되게 한다.
- 부위별 painLevel을 저장하고, item-level severity는 선택 부위 통증 레벨의 최대값으로 파생한다.
- `strengthPlan`은 부상 회복 보조를 위한 보수적 보강운동 기본값이며, 의료 진단/치료 보장이 아니라 훈련 부하 조절 참고값이다.
- 수면질은 부상 부위가 아니라 회복/컨디션 신호로 분리한다. 향후 수면 데이터가 들어오면 훈련 강도와 목표 예상에 반영하되 injuryItems에 포함하지 않는다.
- Supabase Edge Function `coach-run` 프롬프트를 배포했다. deno 검증 스크립트는 프로젝트에 없으므로 `npm run harness:check -- --no-cache`와 CLI 배포 결과를 수동 검증 근거로 삼았다.
- 목표 예상 준비도에는 `부상/회복 게이트`를 추가한다. 활성 부상이나 통증 메모가 있으면 동일한 수행능력 환산 기록이라도 목표 준비도를 보수적으로 낮춘다.

## 2026-05-27 - 부상 선택 UI 이미지 스틸컷 전환
- WebGL/Three.js 기반 3D 모델은 앱 무게와 유지보수 비용이 크므로 제거한다.
- `InjuryBodySelector`는 생성 이미지 기반 각도별 스틸컷 around-view로 전환한다. 상체/하체는 45도 단위 9컷(0~360도)을 제공하고, 발/발목은 전면/후면/내측/외측/발등/발바닥 관점으로 제공한다.
- 부상 선택 UI는 의료 진단용 해부학 모델이 아니라 러닝 코칭을 위한 부위 정규화 입력이다. 상세 진단은 금지하고 훈련 강도 조절과 보강운동 처방의 입력값으로만 사용한다.
- 기본 상태는 이미지 위 투명 hit-zone만 두고, 사용자가 영역을 터치하면 상세 부위 후보를 보여준다. 선택된 부위는 해당 각도 이미지 위에 노드로 표시하고, 최종 선택 목록에서 부위별 통증 레벨을 입력한다.

## 2026-05-28 - AI 코칭 판단 보드 추가
- 문제: `coach-run` 프롬프트에 랩/처방/목표/루틴 지시는 있었지만, 판단 근거가 흩어져 있어 모델이 평균 페이스/평균 심박 중심의 일반 리포트로 돌아갈 위험이 있었다.
- 결정: Edge Function에서 `coachingDecisionBoard`를 생성해 선택 세션 근거, 랩 진행, 처방 준수, 목표 예상, 루틴 업데이트 판단을 한 객체로 묶는다.
- 기대 효과: 코칭 답변이 세션 중간 과정, 처방 경계 초과 여부, 목표 전망과 루틴 유지/조정 근거를 더 안정적으로 반영한다.
- 검증: `npm run build`, `npm run harness:check -- --no-cache` 통과. 하네스는 Supabase Edge Function 전용 `deno check` 스크립트 부재를 경고했으나, `npx supabase functions deploy coach-run --project-ref nvocucbtftayleoxpzjq` 배포가 성공했다.

## 2026-05-28 - 작업 유형별 대화창 분리 운영
- 문제: 하나의 긴 대화창에서 기획, 버그픽스, UI, 코칭 로직, 정책, 부상관리 도메인 수립을 오래 이어가면 컨텍스트가 비대해지고 에이전트 응답 속도와 작업 초점이 떨어진다.
- 결정: 한 대화창은 하나의 주 작업 유형만 맡기고, 작업 유형이 바뀌면 새 대화창으로 분리한다. 분기 전에는 `active-context.md`, `next-session-reminder.md`, 필요 시 `thread-handoff-YYYY-MM-DD.md`에 다음 대화가 이어받을 최소 정보만 남긴다.
- 작업 유형: 기획, 버그픽스, UI/UX, 코칭/훈련 로직, HealthKit/iOS, Supabase/OpenAI Edge Function, 부상관리 도메인, 하네스/정책.
- 선택 이유: 모든 문서를 항상 읽는 방식보다 `workflow-rules.md`의 작업 유형별 시작 문서로 컨텍스트를 좁히는 편이 하네스의 컨텍스트 합성 프로토콜과 맞고, 긴 대화창의 속도 저하를 줄일 수 있다.
- 포기한 대안: 하나의 통합 대화창에서 계속 요약만 추가하는 방식은 요약 자체가 다시 비대해져 작업 경계가 흐려지므로 채택하지 않는다. 모든 작업마다 새 하네스 문서를 만드는 방식도 문서 수를 과도하게 늘리므로 채택하지 않는다.

## 2026-05-28 - 사용자 완료 승인 전 자동 검증과 커밋 금지
- 문제: 사용자가 추가 의견을 줄 수 있는 진행 중 상태에서도 에이전트가 `build`, 테스트, `harness:check`를 돌리고, 때로는 commit/push까지 진행하면 사용자가 완료로 인지하지 않은 작업이 과도하게 최종화된다.
- 결정: 사용자 업무 지시 직후는 `진행 중`으로 보고, 사용자가 명시적으로 완료/최종 검증/커밋/푸시/PR 의사를 밝히기 전에는 `build`, 테스트, `harness:check`, 배포, commit, push를 실행하지 않는다.
- hook 해석: git pre-commit/pre-push hook은 사람이든 에이전트든 commit/push를 실제로 실행했을 때의 안전장치다. 완료 승인 전 커밋/푸시를 실행해 hook 검증을 유도하면 안 된다. Codex Stop hook도 완료 승인 전 `harness:check`를 자동 실행하지 않도록 하네스 본체가 `HARNESS_AGENT_CHECK_APPROVED=1` 게이트를 제공한다.
- 선택 이유: 하네스 소비자 프로젝트 검증의 목적은 검증을 많이 돌리는 것이 아니라, 사람이 작업을 완료로 승인하는 시점과 자동 검증/커밋/푸시 시점을 분리해 통제 가능성을 높이는 것이다.

## 2026-05-28 - 매 요청 workstream 범위 식별 강제
- 문제: 업무 유형별 대화창을 오래 쓰면 에이전트 컨텍스트가 흐려져 현재 창의 담당 범위 밖 작업까지 자연스럽게 이어갈 위험이 있다.
- 결정: 모든 대화창은 사용자 요청을 처리하기 전에 현재 workstream 범위를 먼저 식별한다. 범위가 불명확하면 넓은 작업을 진행하지 않고 사용자에게 workstream 확인을 요청한다.
- 보강 결정: 현재 창에도 수행 역할이 일부 있더라도, 선행 결정이나 선행 구현이 다른 workstream에 있으면 현재 창에서 먼저 진행하지 않고 대상 workstream을 안내한다.
- 완료 처리 보강: 사용자가 완료를 명시해도 현재 창에서 완료 처리해도 되는지와 후속 workstream 확인이 필요한지를 먼저 검토한다. 후속 창 마무리가 필요하면 완료 처리 전에 대상 workstream으로 넘긴다.
- 인수인계 기록 기준: 후속 창에 붙여넣는 인수인계 문구는 기본적으로 일회성 임시 전달물이다. 진행 중에는 문서화를 늘리지 않고 최종 완료 승인 시점에 남길 내용만 정리해 문서화한다.
- 미완료 작업 이동 기준: 완료 전 창 이동은 커밋 없이 진행할 수 있다. 후속 창은 인수인계 문구를 받은 뒤 `git status --short`, `git diff`, 필요 시 `git diff --staged`로 현재 작업트리 변경분을 먼저 확인한다.
- 즉시 기록 예외: 여러 창이 이어서 알아야 하는 최신 상태, pending 작업, 구조 결정, 반복 규칙, 사용자 확인 질문은 다음 창이 이어받을 수 있도록 진행 중에도 관련 `.harness/session/*` 또는 `.harness/project/*` 문서에 최소 내역을 남긴다.
- 적용: `CLAUDE.md`, `AGENTS.md`, `.codex/hooks/inject-context.sh`, `.harness/project/workflow-rules.md`, `.harness/session/workstreams/*.md`에 같은 원칙을 둔다.
- 선택 이유: Codex가 실제로 다른 창을 자동으로 열 수는 없으므로, 매 요청마다 범위 확인 문구를 주입하고 각 workstream 시작 문서에 범위 밖 인수인계 규칙을 둬 창 전환 제안을 강제하는 방식이 가장 현실적이다.

## 2026-05-28 - 새 workstream 추가 운영 기준
- 문제: 08번 부상관리처럼 개발 중 새 도메인이 생기면 기존 01~08 범위로 억지로 끼워 넣다가 창 책임이 흐려질 수 있다.
- 결정: 기존 workstream으로 안정적으로 처리하기 어려운 새 도메인이 반복적으로 등장하면 `01-harness-ops`에서 새 workstream 추가 여부를 먼저 검토한다.
- 추가 조건: 기존 제외 범위에 반복적으로 걸리거나, 별도 도메인 규칙/데이터 계약/검증 기준/사용자 인터뷰가 필요하거나, 여러 workstream에 걸치지만 한 창의 주도권이 필요한 경우.
- 적용: 새 workstream은 workstreams 폴더의 `NN-name.md`로 만들고, workstreams README, `workflow-rules.md`, 필요 시 `project-memory.md`, `next-session-reminder.md`를 함께 갱신한다.
- 선택 이유: 모든 새 이슈마다 창을 늘리면 운영 비용이 커지지만, 반복 도메인을 기존 창에 계속 섞으면 컨텍스트가 다시 비대해진다. 따라서 `01-harness-ops`에서 추가 기준을 검토하고 등록하는 절차로 통제한다.

## 2026-05-28 - Workstream 대화창 분리 방법론 일반화
- 문제: 러닝앱에서 정리한 창 분할 방식은 특정 앱에만 국한되지 않고, 하네스를 설치한 장기 운영 프로젝트 전반에서 재사용할 수 있는 바이브코딩 운영 기법이다.
- 결정: 일반론 문서 `.harness/documentation/workstream-chat-splitting-guide.md`를 추가해 목적, 분리 기준, 파일 템플릿, 인수인계 템플릿, 완료 처리, 문서화 기준, 새 workstream 추가 기준을 정리한다.
- 적용: 현재 프로젝트의 `.harness/session/workstreams/README.md`는 이 일반론 문서를 링크하고, 프로젝트별 01~08 파일은 적용본으로 유지한다.
- 본체 반영 범위: 1차는 공통 documentation 문서와 선택형 예시 템플릿으로 둔다. 모든 프로젝트에 workstream 운영을 강제하거나 PaceLAB 기준 8개 workstream을 기본 설치하지 않는다.
- PaceLAB 적용 범위: 본체 일반 가이드는 약하게 제공하더라도, 이 프로젝트는 workstream 운영을 명시적으로 채택했으므로 각 대화창에서 범위 식별, 선행 workstream 안내, 완료 전 후속창 검토, 커밋 없는 인수인계를 강하게 적용한다.
- 계층 판단: workstream은 회사 공통/스택/템플릿/프로젝트/개인 같은 기준 계층이 아니라 세션 운영 레인이다.
- 선택 이유: 프로젝트마다 도메인 이름은 달라도 긴 대화창의 컨텍스트 비대화, 선행 workstream 판단, 커밋 전 인수인계, 최종 완료 게이트 문제는 공통적으로 반복된다.

## 2026-05-28 - Node 버전 불일치 시 npm 명령 복구
- 문제: Codex 대화창이나 새 터미널 셸이 프로젝트 `.nvmrc`보다 낮은 Node 버전을 잡으면 하네스/빌드/테스트 npm 스크립트가 실행 전에 실패한다.
- 결정: Node 버전 불일치가 보이면 작업을 포기하지 않고 프로젝트 루트에서 `. "$HOME/.nvm/nvm.sh" && nvm use`를 실행해 `.nvmrc` 버전을 활성화한 뒤 같은 npm 명령을 재시도한다.
- 선택 이유: 이 프로젝트는 `.nvmrc`로 런타임 기준을 이미 명시하고 있으므로, 실패를 검증 실패로 처리하기보다 셸 런타임을 프로젝트 기준에 맞추는 것이 올바른 복구 절차다.
- 포기한 대안: 낮은 Node 버전에 맞춰 패키지나 스크립트를 낮추는 방식은 프로젝트 기준과 lockfile 환경을 흔들 수 있어 채택하지 않는다.

## 2026-05-28 - 부상 체크인과 보강운동 도메인 사양
- 문제: 부상 부위 정규화와 `strengthPlan` 기본값은 들어갔지만, 앱이 언제 사용자에게 통증 상태를 다시 물어야 하는지, 완치 후보를 어떻게 제안해야 하는지, 보강운동 근거와 의료 한계를 어떻게 표현해야 하는지 기준이 부족했다.
- 결정: 부상 체크인은 active/monitoring 항목에 대해 앱 기동, 포커스 복귀, 품질 세션 이후 앱 사용 시점에 수행하되, 항목별 최근 체크 시각을 보고 과도하게 반복하지 않는다.
- 통증 스케일은 목표 구조를 0~5로 둔다. 0은 통증 없음, 1~2는 관찰/보강운동 가능 범위, 3은 강훈련/롱런 상향 보류, 4~5는 러닝 강도 하향 또는 중단/전문가 상담 안내가 필요한 신호다.
- `severity`는 의료적 중증도가 아니라 부위별 `painLevel` 최대값으로 파생되는 훈련 부하 조절 신호로 본다.
- 완치 또는 `resolved` 처리는 사용자가 직접 승인해야 한다. 앱이나 AI는 반복 0~1/5, 일상 보행/Easy 조깅 악화 없음, 강훈련/롱런 뒤 flare 없음이 보일 때만 해소 후보를 제안한다.
- 보강운동은 치료 처방이 아니라 참고용 회복 보조 루틴이다. 장기 구조는 운동명, 대상 부위, 목적, 수행 조건, 중단 조건, 단계 조절, 근거 출처 메타데이터를 포함해야 한다.
- 포기한 대안: AI가 코칭 응답만으로 `injuryItems`를 자동 갱신하는 방식은 의료/건강 상태를 사용자 승인 없이 바꾸는 위험이 있어 채택하지 않는다.

## 2026-05-28 - 부상관리 저장 계약은 TrainingMemory JSON 확장
- 문제: 부상 체크인 이력, 완치 시각, 보강운동 근거를 Supabase에 저장해야 하지만, 별도 테이블로 분리하면 UI/AI/Edge Function 전반의 조회 경계와 RLS 정책이 커진다.
- 결정: 현 단계에서는 `training_memory.memory.injuryItems` JSON 계약을 확장한다. `painLevel`은 0~5를 허용하고, `lastCheckedAt`, `resolvedAt`, `checkInHistory`, `strengthPlanDetails`를 추가한다.
- 호환성: 기존 `strengthPlan: string[]`는 UI/AI 표시용 호환 필드로 유지하고, 구조화 근거와 수행/중단/단계 조절 조건은 `strengthPlanDetails`에 병렬 저장한다. 기존 문자열 처방은 normalize 과정에서 내부 기준 출처를 가진 구조화 항목으로 보강한다.
- RLS/마이그레이션 판단: `training_memory`는 이미 `user_id = auth.uid()` 정책이 적용된 JSONB 단일 행 저장소이므로 이번 변경에는 Supabase migration과 RLS 변경이 필요하지 않다.
- 포기한 대안: 체크인 이력을 별도 `injury_check_ins` 테이블로 분리하는 방식은 장기 분석에는 유리하지만, 현재는 단일 사용자 메모 문맥과 함께 저장/로드되는 흐름이 더 단순하고 기존 repository 계약을 덜 흔든다.

## 2026-05-29 - HealthKit 과거 러닝 마이그레이션은 날짜 범위 브리지와 기존 RunLog 저장 경로 사용
- 문제: 앱 기동/재활성화 HealthKit 자동 동기화는 최신 저장일 이후 후보만 저장하므로 2025-11~2026-04 같은 과거 구간 마이그레이션에는 맞지 않는다.
- 결정: 과거 이관은 자동 동기화와 분리해 `requestRunningWorkoutsInRange(startDate, endDate)` 브리지 요청으로 후보를 받고, 웹은 응답 후보 중 요청 범위만 기존 `runStore.addRuns(..., 'healthkit')` 경로로 저장한다.
- 저장 원칙: Supabase 직접 admin/service role 쓰기보다 앱 인증 세션과 `run_logs` RLS `auth.uid()`/`user_id` 컨텍스트를 우선한다. 중복 방지는 기존 `external_id` unique index와 날짜/거리/시간 유사도 필터를 재사용한다.
- 후속: iOS native bridge가 아직 `requestRunningWorkoutsInRange`를 처리하지 않으므로 `06-healthkit-ios`에서 `RunContextWebView.swift` 메시지 핸들러와 HealthKit 기간 조회 구현이 필요하다.

## 2026-05-28 - 부상 체크인은 전역 바텀시트 UI로 처리
- 문제: 부상 상태 갱신이 Memory 화면 편집에만 묶이면 앱 기동/복귀나 품질 세션 이후에 사용자가 통증 반응을 놓치기 쉽다.
- 결정: `App.vue`에서 인증 후 메모리/러닝 기록 로드와 HealthKit 동기화 완료 시점을 보고 active/monitoring 부상 항목의 체크인 필요 여부를 판단하고, `InjuryCheckInSheet` 전역 bottom sheet를 띄운다.
- UI 기준: 질문은 통증 0~5 `ScaleSlider`, 러닝 중/후 악화, 일상 보행/계단 반응, 강훈련/롱런 가능 여부로 제한한다. 보강운동은 참고용 카드로 표시하고 의료 진단/치료 표현은 피한다.
- 다중 부위 항목은 전체 통증값 하나로 모든 부위를 덮어쓰지 않는다. 체크인 UI는 부위가 2개 이상이면 부위별 `ScaleSlider`를 보여주고, `checkInHistory.areaPainLevels`와 `normalizedAreas`를 같은 구조로 저장하며 `severity`는 부위별 최대 통증값으로 둔다.
- 해소 처리: 현재 응답이 0~1/5, 악화 없음, 일상 반응 없음, 강훈련 가능이고 최근 체크인 이력에도 같은 조용한 기록이 최소 1회 있을 때만 해소 후보 버튼을 보여준다. 이력이 없으면 다음 체크인 안내만 표시하며, `resolved` 저장은 사용자가 명시적으로 누를 때만 한다.
- 포기한 대안: Memory 편집 화면 안에만 체크인을 두는 방식은 반복 사용 UX가 약하고, AI나 규칙이 자동으로 해소 처리하는 방식은 사용자 승인 없는 건강 상태 변경이라 채택하지 않는다.

## 2026-05-28 - AI 부상 제안은 코칭 메시지 아래 승인 카드로 처리
- 문제: `coach-run`이 `injuryUpdateProposal`을 반환해도 Run Log 코칭 화면이 소비하지 않으면 AI가 통증 변경이나 해소 후보를 제안해도 사용자가 승인해 저장하는 루프가 없다.
- 결정: 세션별 코칭 메시지 아래에 `injuryUpdateProposal` 승인 카드를 표시한다. 승인 시에만 `memoryStore.update()`로 해당 `TrainingInjuryItem`의 `painLevel`, `status`, `resolvedAt`, `lastCheckedAt`, `checkInHistory`를 갱신한다.
- 기록 기준: 승인된 제안은 `checkInHistory.source = coach_suggestion`으로 남긴다. 무시는 저장 없이 해당 카드만 닫는다.
- 경계: `trainingMemoryPatch`는 주간 루틴/목표 전략/AI 메모 갱신 전용으로 유지하고, 사용자 승인 전에는 `injuryItems`를 바꾸지 않는다.

## 2026-05-28 - AI 코칭 부상 상태 변경은 별도 승인 제안으로 반환
- 문제: `coach-run`의 `trainingMemoryPatch`는 응답 후 즉시 `training_memory.memory`에 병합되는 자동 저장 경로라서, 여기에 `injuryItems` 변경 후보를 넣으면 사용자 승인 없이 통증/완치 상태가 바뀔 수 있다.
- 결정: `trainingMemoryPatch`는 기존처럼 주간 루틴, 목표 전략 메모, AI notes, adaptive profile만 갱신한다. 부상 체크인 갱신, monitoring/resolved 후보, painLevel 변경 후보는 별도 `injuryUpdateProposal` 응답 객체로 반환한다.
- 선택 이유: AI 코칭은 부상 상태를 과장하거나 확정하지 않고 훈련 강도 조절에만 반영해야 하며, 건강 상태 저장은 사용자가 승인한 뒤 UI/저장 흐름에서 처리해야 한다.
- 포기한 대안: `trainingMemoryPatch.injuryItems` 같은 하위 필드를 추가하는 방식은 저장 경로가 단순하지만 승인 게이트를 우회할 위험이 있어 채택하지 않는다.

## 2026-05-28 - 부상 체크인 iOS 네이티브 개입 기준
- 문제: 부상 체크인을 앱 기동/복귀와 품질 세션 이후에 띄우려면 iOS lifecycle이나 local notification을 새로 연결해야 하는지 판단이 필요했다.
- 결정: 현 단계에서는 새 네이티브 lifecycle 브리지를 추가하지 않는다. 웹 `App.vue`의 `focus`, `pageshow`, `visibilitychange`, 인증 후 로드, HealthKit 동기화 완료 watcher로 체크인 트리거를 처리한다.
- 선택 이유: 기존 HealthKit/WeatherKit store도 같은 웹 activation 이벤트로 동작하고, iOS `RunContextWebView.swift`에는 이미 HealthKit background delivery와 `runContextNotifications` 로컬 알림 브리지가 있다. 새 lifecycle 이벤트를 추가하면 중복 트리거와 HealthKit 동기화 경쟁만 늘 수 있다.
- 충돌 방지: 부상 체크인은 `runStore.loaded`, `memoryStore.loading`, `healthKitSyncStore.lastCompletedAt`, 항목별 `lastCheckedAt`, 당일 dismiss sessionStorage를 기준으로 중복 노출을 막는다. HealthKit 새 기록 동기화 뒤에는 `lastCompletedAt` watcher가 다시 판단한다.
- 후속 기준: 웹 activation 이벤트가 실제 iOS WKWebView 복귀에서 누락된다는 재현 로그가 있거나, 앱이 닫힌 상태에서 사용자를 깨워야 하는 요구가 확정되면 그때 `runContextLifecycle` 또는 기존 `runContextNotifications` 확장을 검토한다.
- 포기한 대안: 지금 `scenePhase`/`applicationDidBecomeActive`를 네이티브에서 웹으로 별도 전달하는 방식은 근거가 부족하고, local notification을 기본 체크인 채널로 두는 방식은 건강 상태 질문을 과도하게 푸시할 위험이 있어 채택하지 않는다.

## 2026-05-29 - HealthKit route 고도 요약 nil 처리
- 문제: HealthKit route point에는 유효 altitude가 있는데 원본 route의 연속 고도 차이가 모두 노이즈 필터 하한보다 작으면 `elevationGainM/elevationLossM`가 `nil`로 전달되어 웹 상세에서 고도 데이터 없음처럼 보였다.
- 결정: 네이티브 `routeElevation(from:)`은 유효 altitude location이 2개 이상이면 누적 상승/하강이 0이어도 숫자 `0`을 반환한다. route나 유효 altitude가 부족할 때만 `nil`을 유지한다.
- 선택 이유: 평지/완만한 코스의 0m 또는 작은 누적값은 “데이터 없음”과 의미가 다르며, 웹은 HealthKit 후보 값을 그대로 저장하는 계약이므로 네이티브 후보에서 결측과 평지를 구분해야 한다.
- 포기한 대안: 고도 변화 하한 0.5m를 제거해 모든 미세 변화를 누적하는 방식은 GPS/고도 노이즈를 누적할 위험이 있어 채택하지 않는다.

## 2026-05-29 - 누적상승/하강 웹 fallback은 2차 안전장치로 보류
- 문제: 네이티브 HealthKit route 고도 요약 개선이 진행 중이므로 웹이 즉시 별도 추론값을 저장하면 원본 route 기준 계산과 downsampled route point 기준 계산이 충돌할 수 있다.
- 결정: 누적상승/하강의 1차 소스는 네이티브 HealthKit 후보의 `elevationGainM/elevationLossM`로 둔다. 네이티브 개선 결과가 최근 평지/완만한 샘플에서 여전히 `nil` 또는 부정확한 값으로 확인될 때만 웹 `routePoints.altitude` 기반 fallback 추론을 2차 안전장치로 추가한다.
- fallback 조건: `elevationGainM/elevationLossM`가 `null`이고, 저장 또는 후보 route point에 유효 altitude가 2개 이상 있으며, route/altitude가 실제로 없는 결측 상태가 아님을 확인할 수 있을 때만 적용한다.
- 선택 이유: 원본 HealthKit route location이 downsampled 웹 route point보다 누적 고도 계산에 더 적합하다. 다만 사용자-facing 상세에서 “고도 데이터 있음”을 “데이터 없음”처럼 보여주는 회귀를 막기 위해 웹 fallback 경로를 보류된 안전장치로 유지한다.
- 포기한 대안: 네이티브 개선과 동시에 웹 fallback을 기본 적용하는 방식은 값 출처가 불명확해지고 기존 저장 데이터 재보정 기준도 흔들릴 수 있어 지금은 채택하지 않는다.

## 2026-05-28 - Workstream 완료 책임 창 지정
- 문제: workstream별 범위와 인수인계 규칙은 있었지만, 여러 창을 거친 하나의 업무를 누가 최종 리뷰하고 완료 승인 전 검증 후보를 모으는지 기준이 부족했다.
- 결정: 모든 업무 요청은 시작할 때 `완료 책임 창`을 하나 정한다. 완료 책임 창은 업무 목표, 완료 조건, 후속 workstream 인수인계, 최종 리뷰, 검증 후보 정리를 소유한다.
- 책임 기준: 단일 workstream 업무는 해당 workstream 창이 완료 책임 창이다. 여러 workstream 업무는 처음 업무 목표를 받은 창이 임시 책임 창이며, 업무 중심이 다른 workstream으로 명확해지면 책임을 이관한다. 기획/범위 중심은 `02-product-planning`, 하네스/운영 절차 중심은 `01-harness-ops`가 책임진다.
- 선택 이유: 최초 요청 창으로 무조건 돌아가면 잘못 시작된 창이나 범위 밖 창이 최종 판단을 맡을 수 있다. 반대로 책임 창이 없으면 후속 창 결과가 흩어져 완료 승인, 검증, 커밋 판단이 흐려진다.
- 포기한 대안: 모든 다중 workstream 업무를 별도 PM/리뷰 창으로 모으는 방식은 창 수를 늘리고 운영 부담이 커서 채택하지 않는다.

## 2026-05-28 - Workstream 첫 메시지 bootstrap
- 문제: 같은 workstream 창을 새로 열어 컨텍스트를 줄이고 싶을 때마다 긴 시작 문구를 붙여넣어야 하면 운영 비용이 커진다. 반면 Codex hook이 창 제목 메타데이터를 안정적으로 받는다는 근거는 없다.
- 결정: `.codex/hooks/inject-context.sh`가 `UserPromptSubmit` 입력 본문에서 `01-harness-ops` 같은 workstream id를 감지하면 `.harness/session/workstreams/README.md`와 해당 workstream 파일을 읽으라는 bootstrap 문구를 주입한다.
- 사용 기준: 새 창 첫 메시지는 `이 창은 01-harness-ops workstream이다.`처럼 짧게 쓸 수 있다. 창 제목만으로 자동 감지한다고 가정하지 않고, 사용자 프롬프트 본문에 workstream id를 포함한다.
- hook 범위: 이번 변경은 Codex `UserPromptSubmit` 컨텍스트 주입만 다룬다. commit/push hook의 `harness:check` 실행 정책은 바꾸지 않으므로 `.githooks/**`, `install-hooks.mjs`, `run-previous-hook.mjs`, `.github/commit-template.txt` 변경은 필요하지 않다.
- 앱 영향: Vue 앱, Supabase Edge Function, iOS/HealthKit 경계는 변경하지 않는다. workstream bootstrap 기준과 Codex hook만 바뀌므로 critical path 구현 변경은 없다.
- 선택 이유: 사용자가 새 창을 열 때 붙여넣을 문구를 줄이면서도, 제목 메타데이터 의존이나 외부 상태 파일 같은 불안정한 경로를 피할 수 있다.

## 2026-05-28 - Edge Function 타입 체크를 프로젝트 검증 스크립트로 고정
- 문제: `coach-run`은 Deno 런타임에서 실행되지만 기존 검증 흐름은 Vue/Node 빌드 중심이라 Supabase client 타입 추론, Deno strict null 처리, remote import lock 문제가 늦게 드러날 수 있었다.
- 결정: `package.json`에 `supabase:functions:check`를 추가해 `deno check supabase/functions/coach-run/index.ts`를 프로젝트 지정 Edge Function 검증으로 둔다. `harness:check`는 Supabase 함수 변경 시 이 스크립트를 우선 호출한다.
- 선택 이유: 하네스의 fallback `deno check`에만 기대면 명령 존재 여부와 대상 파일이 암묵적이다. 프로젝트 스크립트로 고정하면 로컬/후속 workstream/커밋 전 검증에서 같은 명령을 반복 사용할 수 있다.
- 후속 기준: Edge Function 파일이 늘어나면 이 스크립트의 대상 목록을 함께 확장한다.

## 2026-05-28 - coach-run 빈 응답/429 장애 안정화
- 문제: HealthKit 러닝 저장 후 AI 코칭을 요청하면 화면에 빈 코칭 메시지 시각만 남거나 "AI 코칭 응답이 비어 있습니다" 오류가 표시됐다. 배포 후 재시도 과정에서는 OpenAI 429도 반복됐다.
- 확정된 운영 원인: `coach-run` context에 선택 세션과 최근 세션의 원본 RunLog 대용량 배열이 들어가 토큰/요청 비용이 커졌고, 스트리밍 파서 실패를 보완하는 fallback이 같은 사용자 요청에서 OpenAI를 한 번 더 호출해 429를 증폭했다.
- 미확정 세부 원인: 최초 빈 응답의 직접 원인은 Responses API streaming 이벤트 payload를 현장에서 캡처하지 못해 확정하지 않는다. 현재 운영 코드는 토큰 단위 스트리밍을 우회하므로, 스트리밍 이벤트 형태 검증은 별도 복구 작업으로 남긴다.
- 결정: `coach-run`은 안정화 모드에서 OpenAI non-stream 호출을 한 번만 수행하고, 완성된 report를 SSE `delta` 한 번으로 보낸 뒤 `done`을 보낸다. OpenAI context에는 원본 `metric_samples`, `route_points`, `laps`, `fast_segments`, 최근 14일 RunLog 원본 목록을 넣지 않고 요약만 넣는다.
- 선택 이유: 사용자에게 코칭이 정상 반환되는 것이 우선이며, 단일 호출과 요약 context가 429/빈 저장을 동시에 줄인다. 2026-05-28 운영 재시도에서 약 14초 후 정상 응답이 확인됐다.
- 포기한 대안: 스트리밍 파서 실패 시 OpenAI non-stream 호출을 한 번 더 수행하는 fallback은 응답 복구처럼 보이지만 rate limit을 악화시키므로 채택하지 않는다. 원본 전체 RunLog를 모델에 주입하는 방식도 코칭 품질보다 비용/실패 위험이 커서 채택하지 않는다.
- 후속 기준: 토큰 단위 스트리밍을 복구하려면 먼저 실제 Responses API SSE 이벤트 원문을 캡처해 파서 테스트를 만들고, 같은 요청에서 OpenAI 호출 1회 원칙을 깨지 않는 구조로만 복구한다.

## 2026-05-28 - coach-run 단일 호출 스트리밍 복구
- 문제: 안정화 모드에서는 AI 코칭이 정상 반환되지만, 사용자는 답변이 완성될 때까지 기다려야 해서 스트리밍 피드백 경험이 사라졌다.
- 결정: `coach-run` 스트림 경로를 OpenAI `stream: true` 단일 호출로 복구한다. 서버는 OpenAI SSE delta를 누적하면서 JSON의 `"report"` 문자열 내부만 추출해 앱 SSE `delta`로 즉시 전달하고, 종료 시 같은 스트림에서 모은 전체 텍스트를 파싱해 `coach_reports`, `coach_memory_items`, 허용된 `trainingMemoryPatch`, `injuryUpdateProposal`을 처리한다.
- 안전장치: `response.completed`, `response.output_item.done`, `response.content_part.done`, `response.output_text.done`에서 완성 텍스트가 오면 같은 호출의 completed payload를 저장 파싱에 사용한다. delta가 없어 report를 실시간으로 못 흘린 경우에도 두 번째 OpenAI 호출 없이 마지막에 한 번만 report를 보낸다.
- 선택 이유: 429 재발을 막으려면 사용자 요청 1회당 OpenAI 호출 1회 원칙을 유지해야 한다. 동시에 UI에는 report 본문만 보여야 하므로 JSON 전체를 그대로 스트리밍하지 않고 report 문자열 내부만 추출한다.
- 포기한 대안: 스트리밍 실패 시 non-stream 호출을 다시 실행하는 방식은 이전 장애 원인이므로 금지한다. 프론트에서 JSON 전체를 받아 report를 파싱하는 방식은 사용자에게 JSON 파편이 보일 수 있어 채택하지 않는다.

## 2026-05-29 - AI/하네스 운영 변경은 Pages 배포 제외
- 문제: `.harness/**`, `.codex/**`, `.agents/**` 같은 AI 에이전트 운영 파일만 바꿔도 `main` push 기준 GitHub Pages workflow가 실행되어 실제 앱 산출물이 바뀌지 않은 배포 이력이 생긴다.
- 결정: `.github/workflows/pages.yml`에 `paths-ignore`를 추가해 AI/하네스 운영 파일만 변경된 push는 Pages deploy를 생략한다.
- 적용 범위: `.harness/**`, `.codex/**`, `.agents/**`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `.github/commit-template.txt`, Copilot instructions만 ignore한다.
- 배포 유지 범위: `src/**`, `public/**`, `package.json`, `.nvmrc`, Vite 설정, GitHub workflow 자체, Supabase 함수처럼 런타임/빌드/배포 산출물에 영향을 줄 수 있는 파일은 ignore하지 않는다.
- 선택 이유: iOS WebView 캐시/전파 지연까지 고려하면 사용자-facing 산출물이 바뀌지 않은 배포는 운영 신호를 흐린다. 에이전트 운영 변경은 로컬 검증과 커밋/푸시 hook으로 확인하고, Pages 배포는 앱 산출물 변경에만 연결한다.

## 2026-05-29 - 하네스 0.2.51 baseline 문서 변경은 소비자 구현 변경 없이 수용
- 문제: 하네스 본체 0.2.51 업데이트가 `.harness/project/portability-guide.md`의 런타임/이식 기준 문서를 갱신해 `common.runtime.minimum-node` sync gap이 문서 단독 변경으로 표시됐다.
- 결정: 이번 변경은 본체 baseline 업데이트 수용이며, 소비자 프로젝트의 앱 코드나 별도 로컬 런타임 구현을 추가하지 않는다. 설치된 하네스의 `check-node-version.mjs`, `.nvmrc`, npm script 실행 전 `nvm use` 운영 기준으로 Node 최소 버전 검증을 유지한다.
- 선택 이유: 소비자 프로젝트는 하네스 본체 소스 저장소가 아니므로 portability guide의 본체 기준 변경에 대응해 로컬 앱 구현을 추가하면 책임 경계가 흐려진다. 실제 검증은 `npm run harness:check`에서 Node 버전 확인, test, build로 수행한다.

## 2026-05-29 - PaceLAB 사업화 검토 기준
- 문제: 현재 PaceLAB은 미출시 개인용 개발 앱이지만, 향후 App Store 출시와 구독형 수익화를 고려할 수 있어 제품 포지션과 검증 순서를 정리할 필요가 생겼다.
- 결정: 사업화 포지션은 범용 러닝 기록 앱이 아니라 `한국어 개인 러닝 코치`로 둔다. 출시 전에는 대중 App Store 배포보다 개인 사용과 소규모 TestFlight 베타로 유료 가설을 먼저 검증한다.
- 수익 모델 후보: 무료 기록/대시보드와 유료 AI 코칭 구독을 1차 모델로 둔다. 일회성 유료 앱은 AI API와 백엔드 반복 비용 구조와 맞지 않아 우선하지 않는다.
- 선택 이유: Nike Run Club, Strava, Runna 같은 기존 앱은 기록/커뮤니티/훈련 플랜에서 강하다. PaceLAB의 차별점은 HealthKit/Workoutdoors 기반 실제 기록, 한국어 자연어 코칭, 목표 가능성, 부상/회복 게이트, 장기 기억을 묶어 다음 훈련 판단까지 제공하는 것이다.
- 후속 기준: 사업화 상세는 `.harness/project/business-review.md`를 기준으로 보고, 결제/구독 구현은 유료 가설 검증 뒤 별도 workstream에서 다룬다.

## 2026-05-29 - GitHub Issues와 Projects를 개발 작업 추적 기준으로 채택
- 문제: PaceLAB의 백로그, 아이디어, 정식 요청, 처리 상태가 `.harness/project/*`와 세션 문서에 섞이면 장기 기준 문서와 일회성 작업 상태가 뒤섞인다.
- 결정: 정식 개발 작업의 단일 출처는 GitHub Issues로 두고, 전체 상태판은 GitHub Project `PaceLAB Development`로 관리한다. `.harness/project/*`는 장기 기준, 계약, 결정 문서로 유지한다.
- 운영 기준: Issue에는 workstream, type, priority, completion owner, target, verification 후보를 기록한다. Project에는 `Status`, `Workstream`, `Type`, `Priority`, `Completion Owner`, `Target`, `Verification`, `Blocked` 필드를 둔다.
- 선택 이유: GitHub Issues/Projects는 코드 변경, 커밋, PR, 검증과 가장 가까운 작업 추적 시스템이다. Notion은 향후 사업화/인터뷰/레퍼런스 노트 보조 도구로 검토하되 당장 핵심 이슈트래커로 쓰지 않는다.

## 2026-05-29 - Issue별 worktree 운영 기준
- 문제: Issue별 branch만 분리해도 로컬 작업트리가 하나이면 여러 Codex 창이나 여러 Issue 변경이 같은 디렉터리에 섞이고, stash로 임시 분리하는 과정에서 어떤 변경이 어느 Issue 소속인지 흐려질 수 있다.
- 결정: 정식 Issue 작업은 Issue 전용 git worktree와 `issue-<번호>/<짧은-설명>` branch를 함께 사용한다. 기준 작업트리 `/Users/smart-tn-083/practice/run-ai`는 `main` 확인, Issue/Project 정리, merge/deploy 기준으로 두고, 구현/문서 수정은 `/Users/smart-tn-083/practice/run-ai.worktrees/issue-<번호>-<짧은-설명>`에서 수행한다.
- hook/구현 영향: 이번 변경은 운영 기준, Issue template, Codex 컨텍스트 주입 문구 변경이다. commit/push hook의 실행 방식은 유지하므로 `.githooks/**`, `.harness/bin/install-hooks.mjs`, `.harness/bin/run-previous-hook.mjs`, `.github/commit-template.txt` 구현 변경은 필요하지 않다.
- 앱 영향: `src/**`, `supabase/**`, 배포 workflow는 변경하지 않는다. 사용자-facing 앱 동작이 아니라 Issue 운영 환경 분리 기준이므로 critical path 구현 변경도 필요하지 않다.
- 선택 이유: worktree는 branch보다 강한 로컬 격리 단위라 동시에 여러 Issue를 진행해도 파일 상태, stash, commit 범위를 명확히 유지할 수 있다. stash는 예외적 임시 조치로만 남긴다.

## 2026-05-29 - 열린 workstream 창 공통 새로고침
- 문제: 이미 여러 workstream 창이 열려 있을 때 최신 운영 기준을 주입하려면 사용자가 창마다 `01-harness-ops`, `02-product-planning`처럼 id를 바꿔 붙여야 해서 운영 비용과 실수 가능성이 커진다.
- 결정: 모든 열린 workstream 창에 같은 `워크스트림 기준 새로고침` 문구를 붙이면, Codex hook은 특정 id를 새로 지정하지 않고 현재 대화에서 이미 확립된 workstream을 유지하라는 generic refresh 안내를 주입한다.
- hook/구현 영향: 이번 변경은 `.codex/hooks/inject-context.sh`의 프롬프트 감지 문구와 workstream 운영 문서만 바꾼다. 앱 런타임, GitHub Pages workflow, commit/push hook 구현은 변경하지 않는다.
- 앱 영향: `src/**`, `supabase/**`, iOS/HealthKit 경계는 변경하지 않는다. 사용자-facing 앱 동작이 아니라 에이전트 대화창 운영 기준이므로 critical path 구현 변경이 필요 없다.
- 선택 이유: 창 제목 메타데이터에 의존하지 않으면서도 모든 창에 같은 문구를 붙일 수 있다. 기존 workstream이 불명확한 창에서는 넓은 작업을 막고 사용자에게 id를 확인하도록 해 오인식을 줄인다.

## 2026-05-29 - MVP 요청 기본 완료 흐름
- 문제: MVP 개발 중 에이전트가 작업 완료, 검토, 커밋, 배포, 완료처리마다 사용자 확인을 기다리면 대기 시간이 길어지고 사용자가 여러 창을 관리해야 하는 부담이 커진다.
- 결정: `Target=MVP`인 정식 Issue에서 단순 확인, 검토, 조사, 기획 질문이 아닌 구현/버그/운영 요청을 사용자가 맡기면, 명시적 중단점이 없는 한 에이전트가 검증, commit, push, PR, main 머지, 배포 확인까지 이어서 수행한다. Issue/Project 최종 완료 상태 변경은 2026-05-30 결정에 따라 사용자의 명시 지시가 있을 때만 수행한다.
- 중단 조건: `검토만`, `조사만`, `PR까지만`, `커밋하지 마`, `배포하지 마`, `여기서 멈춰`처럼 사용자가 중단점을 지정하거나, workstream/완료 책임 창이 불명확하거나, 선행 workstream 결정/수동 조치/검증 실패가 있으면 그 지점에서 멈춘다.
- worktree 기준: 자동 완료 흐름은 Issue별 worktree/branch 분리 원칙을 대체하지 않는다. 동시에 여러 일을 진행할 수 있도록 한 worktree에는 한 Issue의 변경만 둔다.
- hook/구현 영향: 이번 변경은 Codex 컨텍스트 주입 문구와 운영 문서 기준 변경이다. commit/push hook 자체는 여전히 안전장치로만 동작하므로 `.githooks/**`, hook 설치 스크립트, 앱 런타임 구현 변경은 필요하지 않다.
- 선택 이유: MVP 단계에서는 빠른 검증과 반복이 중요하다. 다만 최종 완료 상태는 사용자가 직접 승인해야 GitHub Project 상태가 실제 사용자 판단을 반영한다.

## 2026-05-29 - 다중 workstream parent-child Issue 운영
- 문제: Codex 대화창끼리는 직접 메시지를 주고받지 못하므로, 여러 workstream이 필요한 업무를 “창들이 알아서 대화하며 끝낸다”고 가정하면 완료 책임 창이 결과를 놓치거나 사용자가 수동으로 상태를 모아야 한다.
- 결정: 다중 workstream 업무는 GitHub를 공용 작업판으로 쓰고 parent Issue와 child Issue로 나눈다. parent Issue는 완료 책임 창이 전체 목표, 완료 조건, child 목록, 최종 통합을 소유한다. child Issue는 담당 workstream 창이 자기 worktree/branch에서 처리하고 댓글/PR/Project 상태로 결과를 남긴다.
- 완료 기준: parent 완료 책임 창은 모든 필수 child Issue가 Done이거나 명시적으로 parent에 handoff된 뒤에만 최종 merge/deploy를 수행하고 사용자 완료 확인을 요청한다. Project `Done` 또는 Issue close는 사용자의 명시 완료 지시 후에만 수행한다. child 창은 다른 창에 직접 메시지를 보내지 않고 parent Issue 댓글에 handoff를 남긴다.
- worktree 기준: parent와 child 모두 Issue별 worktree/branch 분리를 유지한다. child 변경이 parent worktree나 다른 child worktree에 섞이면 커밋하지 않는다.
- hook/구현 영향: 이번 변경은 Codex 컨텍스트 주입 문구와 운영 문서 기준 변경이다. 창 간 직접 메시징이나 외부 wake-up 시스템은 구현하지 않는다.
- 선택 이유: GitHub Issue, PR, Project는 모든 창이 공통으로 읽을 수 있는 지속 상태다. 창 간 직접 대화가 없어도 parent/child 구조를 쓰면 사용자는 특정 창에 요청하고 GitHub에서 진행 상태를 확인할 수 있다.

## 2026-05-29 - 요약/기록/기억 메뉴 정보 구조 재정의
- 문제: 기억 페이지 내용이 혼잡하고, 하단 메뉴인 요약/기록/기억의 성격이 러너 관점에서 명확히 분리되지 않았다.
- 결정: 하단 메뉴는 기능 묶음이 아니라 러너의 질문으로 나눈다. `요약`은 오늘/이번 주 무엇을 해야 하는지, `기록`은 내가 무엇을 어떻게 뛰었는지, `기억`은 앱과 코치가 나를 어떤 기준으로 알고 있는지에 답한다.
- 배치 기준: `요약`은 다음 훈련 추천과 목표 준비도 중심의 현재 작전판, `기록`은 `RunLog` 원장과 세션별 상세/코칭, `기억`은 목표/프로필/부상/루틴/AI 장기 기억 같은 장기 맥락 관리 화면으로 둔다.
- 선택 이유: PaceLAB MVP 핵심 흐름은 `목표 -> 러닝 기록 -> 부하와 적응/몸 상태 -> 코칭 -> 다음 훈련`이므로, 반복 사용 메뉴도 현재 판단, 과거 원장, 장기 맥락으로 분리해야 한다.

## 2026-06-01 - 추세 Lens 하단 탭 신설
- 문제: 기존 `요약/기록/기억` 3탭 구조에서는 러너가 누적 데이터로 발전/퇴보, 병목, 처방 조정 신호를 반복 확인하는 전문 인사이트 화면을 담기 어렵다. `기록` 안에 두면 원장/캘린더/필터와 분석 모드가 섞이고, `요약`에 넣으면 현재 작전판이 장기 통계로 과밀해진다.
- 결정: `추세`를 4번째 하단 탭으로 추가한다. `추세`는 목표 진전, 유산소 효율, 강도 분포, 세션 품질, 회복 비용 Lens를 제공하고, 각 Lens는 핵심 변화, 신뢰도, 근거 세션, 다음 처방 영향 후보를 보여준다.
- 경계: `추세`는 `RunLog` 수정/삭제, 장기 목표/부상 편집, Edge Function AI 코칭 변경을 담당하지 않는다. 근거 세션은 canonical `RunLog` 상세로 연결하고, AI 코칭 컨텍스트 반영은 별도 후속 Issue로 분리한다.
- 선택 이유: 향후 개인 앱에서 구독형 퍼블릭 서비스로 확장할 때 유료 가치가 있는 부분은 단순 집계가 아니라 전문 러닝 인사이트다. Lens 구조는 외부 근거 기반 지표를 앱의 누적 데이터와 연결하면서도, 의료/부상 예측 단정 없이 처방 보수성 조정 신호로 제한할 수 있다.
- 후속 기준: 상세 기준은 `.harness/project/navigation-information-architecture.md`를 따른다. 화면 구조와 UI 반영은 `03-ui-ux` workstream에서 별도 처리한다.

## 2026-05-29 - 업무 피로도 Project 필드와 자가진단 기준
- 문제: workstream 대화창을 분리해도 각 창의 대화가 길어지면 컨텍스트 오염, branch/worktree 혼선, 완료 조건 누락 위험이 다시 커질 수 있다.
- 결정: GitHub Project `PaceLAB Development`에 `업무 피로도` single-select 필드를 두고 `fresh`, `normal`, `tired`, `reset-needed`로 관리한다. 이 값은 Issue lifecycle `Status`가 아니라 현재 작업 창의 컨텍스트 부하 신호다.
- 측정 기준: 정확한 토큰 수나 내부 기억 품질은 외부에서 안정적으로 측정할 수 없으므로, 에이전트가 작업 시작/종료/handoff 시 자가진단한다. 긴 대화, 반복 재확인, workstream/Issue 혼선, 운영 규칙 누락, 사용자의 리셋 언급을 신호로 본다.
- hook 영향: Codex `UserPromptSubmit` hook은 사용자가 피로도, 컨텍스트 오염, 리셋, 새 창, 느려짐을 언급하면 `업무 피로도` 기준을 읽고 Project 필드와 Issue 댓글을 갱신하라는 안내를 주입한다.
- 운영 기준: `tired`면 현재 Issue만 마무리하고 새 작업을 섞지 않는다. `reset-needed`면 넓은 새 작업을 시작하지 않고 Issue 댓글과 handoff를 남긴 뒤 같은 workstream 새 창에서 재개한다.
- 앱 영향: 사용자-facing Vue 앱, Supabase Edge Function, iOS/HealthKit 경계는 변경하지 않는다. 이번 변경은 GitHub Project 운영 필드, 하네스 문서, Codex 컨텍스트 주입에 한정한다.

## 2026-05-29 - Issue template 변경은 Pages 배포 제외
- 문제: #13에서 `.github/ISSUE_TEMPLATE/**`만 변경했는데 GitHub Pages deploy가 실행됐다. Issue template은 앱 런타임 산출물이 아니므로 배포 이력을 만들 필요가 없다.
- 결정: `.github/workflows/pages.yml`의 `paths-ignore`에 `.github/ISSUE_TEMPLATE/**`를 추가한다. Issue template, commit template, Copilot instructions는 에이전트/운영 문서로 보고 Pages 배포 제외 대상으로 관리한다.
- 배포 유지 범위: workflow 파일 자체, `src/**`, `public/**`, `package.json`, `.nvmrc`, Vite 설정, Supabase 함수는 계속 배포 영향 후보로 둔다.
- 선택 이유: Issue 관리 문구나 템플릿을 고칠 때 앱 빌드/배포가 반복되면 실제 사용자-facing 변경과 운영 변경 신호가 섞인다.

## 2026-05-29 - 기존 창 운영 룰 next-turn 강제 주입
- 문제: 최신 운영 룰을 이미 열려 있는 여러 Codex workstream 창에 강제로 주입해야 하지만, 창끼리 직접 메시지를 보내거나 백그라운드로 기존 대화 컨텍스트를 수정하는 경로는 없다.
- 결정: `.codex/hooks/inject-context.sh`의 기본 `UserPromptSubmit` 출력에 최신 PaceLAB 운영 룰 위치와 핵심 기준을 항상 포함한다. 기존 창은 다음 사용자 입력을 받는 순간 이 hook 출력을 통해 최신 기준을 주입받는다.
- 주입 기준: 모든 창은 `.harness/session/workstreams/README.md`, `.harness/project/github-issue-management-guide.md`, `.harness/project/github-tracking-rules.md`, `.harness/project/workflow-rules.md`를 우선 확인하고, Issue/Project/worktree/comment, parent/child Issue, `업무 피로도` 기준을 적용한다.
- 한계: 이미 열린 창에 아무 입력 없이 즉시 메시지를 밀어 넣는 것은 불가능하다. 같은 프로젝트 루트 또는 최신 main/worktree를 쓰는 창에서 다음 프롬프트가 들어올 때 적용된다.

## 2026-05-29 - 모바일 Issue 메타데이터 라벨 압축 기준
- 문제: GitHub 모바일 앱에서 Project field가 많이 보이면 Issue 카드 높이가 커져 열린 Issue를 훑기 어렵다.
- 결정: Project field는 관리/자동화 원본으로 유지하고, 모바일 스캔용 정보는 짧은 GitHub label로 복제한다. `Status`, `Priority`, `Labels`를 모바일 기본 노출 후보로 보고, `Workstream`, `Type`, `Target`, `Verification`, `Completion Owner`, `Blocked`, `업무 피로도`는 상세 field로 둔다.
- label 기준: 최소 `type:*` label은 항상 붙인다. `ws:*`, `target:*`, `verify:*` label은 값이 확실할 때만 붙인다. `blocked`, `fatigue:tired`, `fatigue:reset`은 예외 상태일 때만 붙이고, 정상 상태 label은 만들지 않는다.
- 선택 이유: Project field를 삭제하면 자동화와 보드 필터 기준이 약해진다. label mirror는 모바일 목록 스캔 문제를 줄이면서도 Project field를 단일 관리 기준으로 유지한다.

## 2026-05-29 - AI 코칭 스트리밍 표시와 표현 밀도 보강
- 문제: `coach-run`이 서버 스트리밍 경로를 사용해도 실제 네트워크나 OpenAI 이벤트 형태에 따라 앱에는 큰 delta가 한 번에 도착할 수 있다. 이 경우 사용자는 코칭이 스트리밍되지 않고 한 번에 뜬다고 느낀다.
- 결정: 서버의 OpenAI 호출 1회 원칙은 유지하고, 프론트에서 도착한 delta를 작은 조각으로 순차 표시한다. 큰 delta가 한 번에 와도 UI는 점진 표시 경험을 제공한다.
- 표현 기준: 코칭 답변은 문단과 bullet만 길게 이어지지 않도록 표, 인용문, 짧은 Workoutdoors 세팅 코드블록 중 1~2개를 상황에 맞게 사용할 수 있게 한다. 렌더러는 blockquote와 markdown table을 지원한다.
- 선택 이유: 429 재발을 막으려면 서버 fallback 재호출을 피해야 한다. 동시에 사용자가 체감하는 스트리밍은 네트워크 chunk 크기에만 의존하지 않아야 한다.
- 포기한 대안: OpenAI 응답이 final payload로만 올 때 서버에서 두 번째 non-stream 호출을 실행하는 방식은 이전 장애 원인이므로 금지한다. 답변마다 모든 시각 요소를 강제하는 방식은 코칭이 장식 위주로 흐를 수 있어 채택하지 않는다.

## 2026-05-30 - 세션 상세 sticky 지도 정렬 회귀에서 배운 기준
- 문제: Issue #34 세션 상세 sticky 지도 보정 중 `top: 0`, 음수 offset, 고정 헤더 높이 같은 추정값을 반복 적용하면서 헤더와 지도 사이 틈, 헤더 뒤 겹침, 화면 중간 sticky 같은 회귀가 연속 발생했다.
- 실제 원인: sticky 기준은 기기/WebView에서 viewport와 stack scroll container 관계에 따라 달라졌다. 최종적으로는 `.memory-stack-content`의 공통 `padding: 16px ...`가 CSS 선언 순서상 다시 이겨 세션 상세의 `padding-top: 0` 보정이 무력화되고, header 아래 16px 틈이 남는 것이 계측으로 확인됐다.
- 결정: stack header와 sticky 요소를 맞물리게 할 때 고정 수치를 추정하지 않는다. `header.getBoundingClientRect().bottom - scrollContainer.getBoundingClientRect().top`처럼 실제 렌더링 좌표를 계산해 CSS 변수에 반영하고, page-specific padding override는 `.memory-stack-content.run-detail-content`처럼 공통 선언을 이길 수 있는 선택자로 고정한다.
- 검증 기준: 모바일 viewport에서 여러 scrollTop 지점을 찍고 `headerBottom`, `contentTop`, `routeTop`, `routeTop - headerBottom`, 실제 `paddingTop`, sticky CSS 변수를 기록한다. Issue #34 최종 수정은 390x844 viewport에서 scrollTop 760/980/1180/1380/1580 모두 `headerBottom=63`, `routeTop=63`, 차이 `0px`로 확인한 뒤 배포했다.
- 선택 이유: iOS safe area, stack header 높이, scroll container top, CSS cascade는 기기와 구조에 따라 달라질 수 있다. 추정값은 한 상태를 고치면서 다른 상태를 깨뜨렸고, 실제 좌표 계측만이 재현 가능한 완료 조건을 제공했다.

## 2026-05-30 - 완료 전 재발 방지 기록 게이트
- 문제: 여러 번의 수정/배포를 거쳐 어렵게 해결한 요청에서도 에이전트가 스스로 재발 방지 기준을 장기 기억에 남기지 못하는 경우가 있었다.
- 결정: 정식 Issue를 `Done`으로 닫기 전에 완료 책임 창은 재발 방지 기록 게이트를 반드시 통과한다. final Issue comment에는 `재발 방지 기록` 항목을 항상 남기고, 장기 기록이 필요 없으면 `해당 없음`과 이유를 적는다.
- 장기 기록 기준: 여러 번의 수정/배포, 반복 회귀, 다중 workstream 인수인계, 공유 계약 변경, 에이전트 운영 실패가 있었다면 `project-memory`, `decision-log`, 관련 `.harness/project/*` 중 적절한 위치를 갱신한다.
- hook 영향: Codex `UserPromptSubmit` hook은 완료, 배포, merge, close, 장기 기억, 문서화 관련 요청에서 completion learning gate 안내를 주입한다.
- 선택 이유: `harness:check`의 Project rule candidate 문구만으로는 완료 직전 기억 승격이 누락될 수 있다. 완료 프롬프트와 Issue close 흐름에서 다시 강제해야 실제 재발 방지 기준이 남는다.

## 2026-05-30 - MVP 완료 확인과 기준 main 최신화 게이트
- 문제: MVP 자동 완료 흐름이 배포 확인과 Issue Done/Closed를 한 단계로 취급하면 사용자가 최종 완료 상태를 승인하기 어렵고, 배포 후 기준 작업트리의 local `main`이 낡은 상태로 남아 다음 Issue worktree가 오래된 기준에서 분기될 수 있다.
- 결정: 완료 책임 창 안에서 해결 가능한 `Target=MVP` 정식 Issue는 명시적 중단점이 없으면 검증, commit, push, PR, main 머지, 배포 확인까지 이어서 진행하고 사용자에게 완료 확인을 요청한다. GitHub Project `Done` 또는 Issue close는 사용자의 명시 완료 지시 후에만 수행한다.
- main 최신화 기준: 사용자 완료 지시를 받은 뒤 완료 댓글, Project `Done`, Issue close 전에 기준 작업트리 `/Users/smart-tn-083/practice/run-ai`에서 `git switch main`, `git pull --ff-only`, `git status -sb`로 local `main`을 최신화한다. 기준 작업트리에 미커밋 변경이 있으면 임의로 stash/reset하지 않고 상태를 보고한다.
- 선택 이유: MVP 속도는 유지하되 최종 완료 판단은 사용자 승인에 묶고, 다음 Issue worktree가 항상 배포된 `main` 기준에서 시작하도록 한다.

## 2026-05-31 - Store 단위 테스트의 Supabase 환경 의존 차단
- 문제: Issue #57에서 `tests/healthKitSyncStore.test.ts`가 일반 로컬 환경에서는 통과했지만, pre-commit hook처럼 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`가 있는 환경에서는 `runStore.addRuns()`가 Supabase repository 경로를 타면서 로컬 store 삽입 기대가 깨졌다.
- 결정: store 단위 테스트가 로컬 저장 동작을 검증한다면 Supabase 설정 모듈 또는 repository 경계를 명시적으로 mock해 환경변수 유무와 무관하게 같은 경로를 테스트한다. 이 기준을 `.harness/project/workflow-rules.md`의 외부 경계 mock 규칙에 반영했다.
- 선택 이유: HealthKit sync 테스트는 HealthKit 후보 처리와 store 상태 전이를 검증하는 단위 테스트이며, Supabase RLS/API 통합 테스트가 아니다. 환경변수에 따라 테스트 대상 경계가 바뀌면 hook 검증이 불안정해진다.

## 2026-05-31 - 요청 단위 풀스택 창 운영 전환
- 문제: 상시 workstream별 대화창을 유지하면 사용자가 창을 관리하고 인수인계를 붙여넣는 비용이 컸다. Codex 창끼리가 GitHub Project를 통해 자동으로 협업하거나 상태를 주고받는 것도 아니어서, 창 분리의 이점보다 운영 피로도가 커졌다.
- 결정: PaceLAB은 상시 workstream 창 분리 운영을 중단하고, 사용자가 요청마다 새 대화창을 열어 업무 내용을 바로 적는 요청 단위 풀스택 창 운영을 기본으로 한다. 에이전트는 요청을 분류해 필요한 workstream 파일을 읽을거리로만 선택하고, 같은 목표 안의 기획/디자인/웹/네이티브/Supabase/AI/운영 작업을 현재 창에서 끝까지 관리한다.
- Issue 기준: 에이전트가 정식 개발 작업 여부를 판단해 직접 GitHub Issue를 만들거나 기존 Issue를 확인한다. 사용자가 Issue를 먼저 만들 필요는 없다. 단, 사용자가 동시에 여러 업무를 요청하거나 한 요청 안에 독립 목표가 섞이면 Issue, worktree, branch, PR을 분리한다.
- 유지한 기준: Issue별 worktree 격리는 계속 유지한다. 같은 창이 여러 요청을 순차 관리할 수는 있지만 파일 변경, 검증, 커밋, PR 범위는 Issue별로 섞지 않는다.
- 포기한 대안: workstream별 상시 창 유지, 여러 workstream이면 parent/child Issue로 기본 분해, 사용자가 Issue와 완료 책임 창을 먼저 지정해야 하는 방식은 기본 운영에서 제외한다. parent/child Issue는 독립 목표가 실제로 분리될 때만 사용한다.
- 문서/hook 영향: `.harness/session/workstreams/README.md`, `.harness/project/workflow-rules.md`, `.harness/project/github-issue-management-guide.md`, `.harness/session/project-memory.md`, `.codex/hooks/inject-context.sh`는 요청 단위 풀스택 창과 동시 업무 worktree 격리 기준을 우선하도록 갱신한다.
- 시작 컨텍스트 보강: 요청 창이 웹 프론트 래퍼, iOS 네이티브 래퍼, Supabase/Auth/Postgres/Edge Function, OpenAI 코칭, GitHub Pages 배포 경계를 함께 떠올리도록 `session-start-alert`, `next-session-reminder`, `active-context`, `project-memory`, `workflow-rules`, `CLAUDE.md`, `AGENTS.md`, Codex/Claude hook 문구를 보강한다.
- 앱 영향: 이번 변경은 에이전트 운영 문서와 Codex hook 주입 문구에 한정한다. Vue 앱, Supabase Edge Function, iOS/HealthKit 런타임 동작이나 사용자-facing UI 변경은 필요하지 않다.

## 2026-05-31 - Codex worktree Node/dependency 준비 기준
- 문제: Codex 세션이나 Issue worktree가 프로젝트 `.nvmrc`와 다른 Node를 잡거나, git ignored 파일인 `node_modules` 없이 생성되면 `vue-tsc`, `vite`, `vitest` 같은 로컬 바이너리 누락으로 실제 코드 문제가 아닌 검증 실패가 발생할 수 있다.
- 결정: Codex `SessionStart` hook은 `.nvmrc` 요구 버전과 hook 프로세스의 Node 버전을 보여주고, 후속 shell 명령에서는 다시 `. "$HOME/.nvm/nvm.sh" && nvm use`를 실행하도록 안내한다. 새 Issue worktree를 만들거나 들어간 뒤 `node_modules`가 없으면 `npm ci`로 의존성을 준비한 뒤 TypeScript/build/test/harness 명령을 실행한다.
- 선택 이유: hook 자식 프로세스에서 실행한 `nvm use`는 Codex의 이후 shell에 영구 적용되지 않는다. 또한 `node_modules` 복사나 symlink는 캐시/절대경로/네이티브 의존성 문제를 만들 수 있으므로, `package-lock.json` 기준 `npm ci`가 재현 가능한 1차 준비 절차다.
- 적용 범위: `.codex/hooks/session-start-reminder.sh`, `.codex/hooks/inject-context.sh`, `.harness/session/session-start-alert.md`, `.harness/session/next-session-reminder.md`, `.harness/project/github-issue-management-guide.md`, `.harness/project/workflow-rules.md`, `.harness/session/project-memory.md`.

## 2026-05-31 - 특정 사용자 Supabase 데이터 확인은 앱 컨텍스트 우선
- 문제: PaceLAB Supabase 테이블은 RLS가 기본 경계이므로 특정 사용자 데이터를 확인할 때 익명 클라이언트, 인증 없는 SQL, service role/admin 우회를 먼저 시도하면 권한 실패를 데이터 없음으로 오해하거나 실제 앱 흐름과 다른 결과를 볼 수 있다.
- 결정: 특정 사용자의 실제 데이터 확인은 처음부터 앱 로그인 세션, repository/store 함수, 또는 사용자가 제공한 현재 앱 컨텍스트의 사용자 ID를 기준으로 재현한다. anon 조회나 service role/admin key 경로를 먼저 시도한 뒤 앱 컨텍스트로 fallback하지 않는다.
- 선택 이유: PaceLAB에서 의미 있는 데이터 확인 단위는 RLS가 적용된 사용자 앱 세션이다. 디버깅도 같은 사용자, 같은 인증 상태, 같은 repository/store 경로를 거쳐야 화면 증상과 저장 상태를 일관되게 판단할 수 있다.
- 적용 범위: `.harness/project/architecture-rules.md`, `.harness/project/workflow-rules.md`, `.harness/session/project-memory.md`, `.codex/hooks/inject-context.sh`.

## 2026-05-31 - Issue URL 선조회와 업무 요청 Issue 구체화
- 문제: 새 Codex 요청 창에 Issue URL만 들어오면 현재 hook은 GitHub 운영 문서를 읽으라고 안내하지만, 해당 Issue 본문과 Project fields를 먼저 조회한 뒤 라우팅하라는 절차가 직접적이지 않았다. 반대로 사용자가 Issue 없이 업무 내용만 적는 새 운영 방식에서는 에이전트가 요청을 충분히 구체화해 Issue를 만들지 못하면 완료 조건과 검증 후보가 흐려질 수 있다.
- 결정: 사용자 프롬프트에 Issue URL 또는 Issue 번호가 있으면 구현이나 workstream 라우팅 전에 Issue 본문, labels, Project fields를 먼저 조회한다. Issue 없이 새 정식 업무 요청이 들어오면 에이전트가 한글 우선 제목, 문제/목표, 범위, 제외 범위, 완료 조건, 검증 후보, Project fields, label 후보로 구체화하고, 기존 Issue 검색 후 새 Issue 생성 또는 재사용을 결정한다. 제목은 가능하면 한글로 쓰되 `HealthKit`, `Supabase`, API명, 라이브러리명, 에러 메시지처럼 원문 식별이 중요한 고유명은 영어를 유지한다.
- 선택 이유: 요청 단위 풀스택 창 운영에서는 첫 프롬프트가 유일한 진입점이다. Issue 기반 요청과 새 업무 요청 모두 시작 단계에서 실행 범위와 읽을거리를 안정화해야 worktree/branch/PR이 섞이지 않는다.
- 포기한 대안: 사용자가 항상 Workstream과 Issue 본문을 직접 붙여넣도록 요구하는 방식은 창 관리 피로도를 줄인다는 최신 운영 방향과 맞지 않아 채택하지 않는다.
- 적용 범위: `.codex/hooks/inject-context.sh`, `.harness/project/github-issue-management-guide.md`, `.harness/project/github-tracking-rules.md`, `.harness/project/workflow-rules.md`.

## 2026-05-31 - MVP 작업은 배포 확인 후 완료 승인 대기
- 문제: 일반 하네스 게이트 문구가 "완료 승인 전 build/test/harness:check/commit/push/배포 금지"로만 읽히면서, PaceLAB MVP 기본 완료 흐름의 "구현/버그/운영 요청은 배포까지 진행" 기준과 충돌했다.
- 결정: 일반 작업의 승인 전 금지 원칙은 유지하되, PaceLAB이 MVP 단계이고 사용자가 구현/버그/운영 작업을 맡긴 경우에는 명시적 중단 지시가 없는 한 검증, commit, push, PR/main 반영, 배포 확인까지 수행한다. 그 뒤 결과를 보고하고 사용자의 최종 완료 승인을 기다린다.
- 완료 경계: 배포 확인은 에이전트가 수행하지만, GitHub Project `Done`, Issue close, 또는 이에 준하는 최종 완료 상태 변경은 사용자의 명시 완료 지시 후에만 수행한다.
- 선택 이유: MVP 속도를 위해 배포 가능한 변경은 실제 앱까지 반영되어야 한다. 동시에 최종 완료 판단은 사용자 확인에 남겨 배포 성공과 제품 확인을 분리한다.
- hook 영향: `.githooks/pre-commit`과 `.githooks/pre-push`는 commit/push가 실제 실행될 때 검증을 수행하는 안전장치로 그대로 둔다. 이번 변경은 hook 구현이 아니라 에이전트가 MVP 작업에서 commit/push/배포 단계까지 진행해야 하는지에 대한 프로젝트 로컬 해석 변경이므로 hook 스크립트 수정은 필요하지 않다.
- 적용 범위: `CLAUDE.md`, `AGENTS.md`, `.harness/session/session-start-alert.md`, `.harness/session/next-session-reminder.md`, `.harness/session/session-boot.md`, `.harness/session/active-context.md`, `.harness/session/project-memory.md`, `.harness/project/commit-push-rules.md`.

## 2026-05-31 - Issue 없이 처리한 MVP 기능 작업 사후 보정
- 문제: 세션 상세 시작/종료 시간과 위치 구 단위 표시 작업을 기준 작업트리 `main`에서 바로 처리하고 배포한 뒤에야 GitHub Issue/worktree 분리 누락이 확인됐다.
- 결정: 이미 main 반영과 배포가 끝난 작업은 사후에 worktree를 분리할 수 없으므로 GitHub Issue #59를 생성해 범위, 검증, 배포 확인, 운영 예외를 기록하고 Project field를 `Status=Deployed`, `Target=MVP`, `업무 피로도=reset-needed`로 보정한다. 사용자의 명시 완료 지시 전까지 Issue는 닫지 않는다.
- 재발 방지 기준: MVP 자동 완료 흐름은 Issue별 worktree/branch 원칙을 대체하지 않는다. 이후 구현/버그/운영 요청은 먼저 기존 Issue 검색 또는 신규 Issue 생성을 수행하고, 해당 Issue worktree/branch에서만 변경한 뒤 배포 확인까지 이어간다.
- 선택 이유: 완료된 main 배포 이력을 되돌리거나 가짜 worktree 이력을 만드는 것은 실제 추적성을 더 흐린다. 실제 누락을 Issue와 decision log에 명시하고 다음 요청 시작 게이트를 지키는 것이 가장 투명하다.

## 2026-05-31 - main 직접 commit/push hook 차단
- 문제: Issue/worktree 원칙은 문서에 있었지만, 가장 먼저 보이는 MVP 배포 자동 완료 문구가 더 강하게 작동했고 git hook에는 `main` 직접 commit/push를 막는 실행 차단이 없었다. 따라서 에이전트가 기준 작업트리에서 바로 작업해도 시스템이 멈추지 않았다.
- 결정: MVP 배포 자동 완료는 Issue 생성/재사용과 Issue worktree/branch 분리 이후에만 시작되는 후속 단계로 재정의한다. `.githooks/pre-commit`과 `.githooks/pre-push`에서 기준 작업트리 `main` 직접 commit/push를 차단하고, 사용자 명시 승인 예외만 `HARNESS_ALLOW_MAIN_COMMIT=1` 또는 `HARNESS_ALLOW_MAIN_PUSH=1`로 1회 우회한다.
- 선택 이유: 문서 안내만으로는 긴 대화나 예외 규칙 충돌에서 누락될 수 있다. 실행 단계 hook이 main 직접 기록을 막아야 Issue/worktree 선행 게이트가 실제 운영 기준이 된다.
- 적용 범위: `CLAUDE.md`, `AGENTS.md`, `.codex/hooks/inject-context.sh`, `.githooks/pre-commit`, `.githooks/pre-push`, `.harness/bin/guard-main-worktree.mjs`, `.harness/session/session-start-alert.md`, `.harness/session/active-context.md`, `.harness/session/next-session-reminder.md`, `.harness/session/project-memory.md`, `.harness/project/workflow-rules.md`, `.harness/project/commit-push-rules.md`.

## 2026-06-01 - HealthKit 과거 이관 임시 UI
- 문제: Issue #25의 날짜 범위 HealthKit 이관 경로는 웹 store와 네이티브 브리지에는 연결됐지만, 사용자가 실제 iPhone 앱에서 2025-11~2026-04 범위를 실행할 화면 진입점이 없었다.
- 결정: 정식 데이터 관리 화면을 새로 설계하지 않고, 기록 페이지의 `전체 기록` 섹션 바로 위에 삭제 예정인 임시 마이그레이션 UI를 둔다. 버튼은 `2025-11-01`부터 `2026-04-30`까지 고정 범위로 `requestHistoricalMigration()`을 호출한다.
- 선택 이유: 이번 목적은 1회성 MVP 데이터 이관 실행이다. 영구 기능처럼 설정/범위 입력/관리 화면을 만들면 삭제 비용과 사용자 혼란이 커진다.
- 제거 조건: 사용자가 실제 데이터 이관 결과를 확인하고 #25 완료를 승인한 뒤 해당 임시 UI를 제거한다.

## 2026-06-01 - HealthKit 과거 이관 성공 후 임시 UI 제거
- 문제: 2025-11~2026-04 HealthKit 과거 이관이 성공해 기록 페이지의 1회성 실행 UI가 더 이상 사용자에게 노출될 필요가 없어졌다.
- 결정: 사용자-facing 임시 UI만 제거하고, 웹 `requestHistoricalMigration()`/`requestHealthKitRunsInRange()`와 네이티브 `requestRunningWorkoutsInRange` 처리 로직은 유지한다.
- 선택 이유: 향후 다른 날짜 범위 이관이나 운영성 복구가 필요할 수 있고, 비노출 브리지/저장 로직은 자동 동기화와 분리되어 일반 사용자 흐름을 방해하지 않는다.
- 포기한 대안: 마이그레이션 로직 전체 제거는 나중에 같은 문제가 생겼을 때 네이티브와 웹 계약을 다시 복원해야 하므로 채택하지 않는다.

## 2026-06-01 - 완료된 Issue worktree 정리 기준
- 문제: Issue가 `Closed`/Project `Done`까지 끝나도 로컬 Issue worktree가 남아 작업 목록이 누적됐다. 완료 처리와 worktree 정리가 별도 단계였지만 정리 조건과 보류 조건이 문서화되어 있지 않았다.
- 결정: 완료된 Issue worktree는 `Issue Closed`, Project Status `Done`, worktree clean, 후속 확인 불필요 조건을 모두 만족할 때 정리 대상 후보로 본다. `Open` 또는 `Deployed` 상태 worktree는 사용자 최종 완료 확인 전까지 보류한다. 미커밋 변경이 있으면 임의 삭제하지 않고 보고하며, 사용자가 특정 경로 삭제를 명시한 경우에만 변경 소실을 알리고 force 제거할 수 있다.
- 선택 이유: 완료된 작업의 로컬 잔여물을 줄이되, 배포 확인 대기나 미커밋 변경 같은 상태를 삭제로 잃지 않기 위해서다.
- 적용 범위: `.harness/project/workflow-rules.md`, `.harness/project/github-issue-management-guide.md`, `.harness/project/commit-push-rules.md`.

## 2026-06-01 - 하단 네비 탭 수는 컴포넌트 상태를 기준으로 렌더링
- 문제: Issue #68에서 하단 네비가 4개 탭으로 늘었지만 전역 CSS 그리드는 3개 컬럼에 고정되어 모바일에서 네 번째 탭이 두 번째 줄로 밀리고 active pill이 화면을 가렸다.
- 결정: `BottomNav`가 항목 수를 CSS 변수로 내려주고, 모바일/데스크톱 그리드는 해당 값을 사용한다. 모바일 네비 폭과 항목 패딩은 4탭 기준에서 라벨이 한 줄로 유지되는 값으로 보정한다.
- 선택 이유: 탭 수 변경은 앱 쉘의 제품 구조 변경이므로 스타일에서 숫자를 중복 고정하면 같은 회귀가 반복된다. 컴포넌트의 실제 항목 수를 단일 기준으로 삼아 레이아웃을 맞춘다.
- 적용 범위: `src/shared/ui/BottomNav.vue`, `src/app/styles.css`.

## 2026-06-01 - Root tab pager 내부 fixed 요소는 비활성 탭에서 숨김
- 문제: Root tab pager가 swipe 연속성을 위해 `요약`, `기록`, `추세`, `기억` 패널을 DOM에 유지하면서, Run Log의 viewport fixed 월 heading이 비활성 탭에서도 화면 위로 새어 나왔다.
- 결정: tab-local fixed chrome은 비활성 `.tab-swipe-panel[aria-hidden='true']` 아래에서 숨기고, 이 기준을 UI guideline에 명시한다.
- 선택 이유: fixed 요소는 부모 패널의 overflow와 시각 위치를 벗어나므로 z-index 조정만으로는 다른 탭 누수를 막을 수 없다. root pager의 mounted 구조를 유지하려면 active panel scoping이 필요하다.
- 적용 범위: `src/app/styles.css`, `.harness/project/ui-guidelines.md`.

## 2026-06-01 - Teleport fixed 요소는 route 조건으로 렌더링 제한
- 문제: Run Log 월 heading은 `Teleport to="body"`로 렌더링되어 비활성 tab panel의 하위 선택자 숨김 규칙이 적용되지 않았다.
- 결정: Run Log의 월 fixed heading은 현재 route가 `/runs`일 때만 렌더링한다. 차트처럼 좌우 드래그가 가능한 tab-local UI는 `data-no-swipe`와 pointer/touch stop으로 root pager에 이벤트가 전달되지 않게 한다.
- 선택 이유: Teleport 요소는 DOM상 root tab panel 밖에 있으므로 CSS descendant scoping으로 안전하게 막을 수 없다. route 조건 렌더링이 실제 누수를 차단하는 단일 기준이다.
- 적용 범위: `src/pages/run-log/RunLogPage.vue`, `src/shared/ui/TrendLensChart.vue`, `.harness/project/ui-guidelines.md`.

## 2026-06-01 - AI 코칭은 코드 판단 엔진과 구조화 장기기억을 분리
- 문제: AI 코칭이 장기 컨텍스트를 사용하고 있었지만, 러너 정체성/반복 belief 같은 구조화 계층과 코드가 먼저 계산하는 판단 엔진이 명확히 분리되어 있지 않았다.
- 결정: `coach-run`에서 `runningAnalysisEngine`을 만들어 HR drift, 부하 변화, 회복 상태, 부상 위험, 과훈련 경고, 훈련 적합성 점수를 먼저 계산한다. `TrainingMemory`에는 `runnerIdentity`와 `coachBeliefs`를 추가하고, OpenAI 응답은 Responses API strict JSON schema로 강제한다.
- 선택 이유: 계산 가능한 판단은 코드가 책임지고, OpenAI는 그 판단을 설명/코칭 언어로 바꾸는 역할로 좁혀야 개인화 품질과 재현성이 올라간다.
- 검증: 중요 경로 `supabase/functions/coach-run/index.ts`는 `npm run supabase:functions:check`로 Deno 타입 체크를 통과시킨다. 전체 변경은 `npm run test:run`, `npm run build`, `npm run harness:check`로 확인한다.
- 적용 범위: `supabase/functions/coach-run/index.ts`, `src/entities/training-memory/model.ts`, `.harness/project/ai-coaching-goal.md`, `.harness/project/running-coaching-standards.md`, `.harness/project/architecture-rules.md`, `.harness/project/domain-rules.md`.

## 2026-06-02 - 추세 Lens 원본 신호와 표시용 처방 게이트 분리
- 문제: 종합 판단은 회복/강도 safety gate로 상향 후보를 막지만, 개별 Lens의 `다음 처방 영향`에는 원본 `raise-candidate`가 남아 사용자가 개별 Lens만 보고 즉시 상향으로 오해할 수 있었다.
- 결정: `buildTrendLensResult`는 단일 Lens의 원본 분석 신호로 유지하고, 화면에서는 `buildTrendAnalysis`가 5개 Lens를 함께 계산한 뒤 recovery/intensity warning을 전역 safety gate로 적용한 표시용 결과를 사용한다. 좋은 신호의 hero/explanation은 유지하되, 최종 처방 문구는 게이트 통과 여부를 반영한다.
- 선택 이유: Lens별 좋은 신호는 코칭 근거로 보존해야 하지만, 실행 처방은 회복/부하/부상 게이트와 일관되어야 한다. 원본 분석과 표시용 처방을 분리하면 테스트와 UI가 둘 다 명확해진다.
- 포기한 대안: 각 Lens 계산 함수에 다른 Lens 상태를 직접 주입하는 방식은 Lens 독립성과 단위 테스트 경계를 흐리므로 채택하지 않는다.
- 적용 범위: `src/shared/lib/trendInsights.ts`, `src/pages/trends/TrendsPage.vue`, `.harness/project/domain-rules.md`.

## 2026-06-02 - 추세 종합 판단 클릭은 렌즈 선택만 수행
- 문제: 종합 판단 항목 클릭 시 해당 Lens를 선택한 뒤 `scrollIntoView({ block: 'start' })`로 Lens 상세까지 강제 이동하면서 모바일 화면 위치가 튀거나 사용자가 현재 맥락을 잃는 회귀가 생겼다.
- 결정: 종합 판단 항목 클릭은 관련 Lens 탭 선택만 수행한다. Lens 상세 영역으로의 강제 자동 스크롤은 제거하고, 버튼 기본 브라우저 스타일 영향은 CSS에서 명시적으로 차단한다.
- 선택 이유: 종합 판단 카드와 Lens 탭은 상하로 인접해 있어 선택 변경만으로도 연결성이 유지된다. 반면 자동 스크롤은 모바일 WebView와 root tab pager 맥락에서 화면 위치를 예측하기 어렵게 만든다.
- 포기한 대안: `scrollIntoView` 옵션을 `nearest`로 약화하는 방식은 브라우저/viewport 상태에 따라 여전히 위치 이동이 달라질 수 있어 채택하지 않는다.
- 적용 범위: `src/pages/trends/TrendsPage.vue`, `src/app/styles.css`.

## 2026-06-02 - Root tab swipe release animation은 route 전환보다 먼저 수행
- 문제: Issue #92에서 스와이프 판정 직후 `router.push`가 먼저 실행되고, track은 아직 dragging 상태라 CSS transition이 꺼져 있었다. 그 결과 손을 뗀 offset 지점에서 다음 패널까지 이어지는 애니메이션 없이 route index가 즉시 바뀌어 화면이 확 넘어갔다.
- 결정: root tab swipe는 release 단계에서 `swipeTrackIndex`로 현재 시각 기준 index를 고정하고, `swipeOffset`을 패널 폭 끝까지 transition시킨 뒤 route를 변경한다. route 변경 후 reset은 시각 위치가 같은 상태에서 수행한다.
- 선택 이유: 사용자가 손을 뗀 순간의 offset은 다음 장면 전환의 시작점이어야 한다. route 변경을 먼저 하면 Vue route index 변경과 dragging transition off 상태가 결합해 전환 애니메이션을 볼 수 없다.
- 운영 보정: 사용자 최종 완료 승인 전 Issue close가 금지되어 있으므로 PR 본문에 `Closes #...`를 넣지 않는다. #92는 이전 PR 본문의 `Closes #92` 때문에 조기 close되어 다시 열었다.
- 적용 범위: `src/app/App.vue`, GitHub Issue/PR 운영 문구.

## 2026-06-02 - Root tab swipe 차단은 내부 horizontal gesture만 opt-out
- 문제: Issue #92 후속 확인에서 root swipe 차단 selector가 `button`, `[role="button"]`, 일반 차트까지 포함해 요약의 최근 세션 같은 일반 버튼형 카드에서 홈 간 스와이프가 시작되지 않았다.
- 결정: 일반 button/card/list row/summary row/non-interactive chart는 root tab swipe를 막지 않는다. 실제 내부 좌우 드래그나 horizontal scroll을 가진 컴포넌트만 `data-no-swipe`, `[data-horizontal-scroll]`, `role="slider"`, overflow-x scroll 감지로 opt-out한다.
- 선택 이유: root pager의 click suppression은 horizontal swipe 후 accidental click을 막을 수 있다. 터치 시작점이 pressable이라는 이유만으로 root swipe를 차단하면 모바일 앱의 기본 탭 이동 제스처가 깨진다.
- 추가 결정: iOS/WebView에서 double-tap zoom은 웹 viewport/touch guard와 네이티브 WKWebView zoom gesture 비활성화를 함께 적용한다. iOS 앱 orientation은 Info.plist 생성 설정과 AppDelegate supported orientation을 portrait로 고정한다.
- 적용 범위: `src/app/App.vue`, `src/shared/ui/BottomSheetSelect.vue`, `src/shared/ui/TrendLensChart.vue`, `index.html`, `src/app/styles.css`, `/Users/smart-tn-083/practice/RunningCoach`.

## 2026-06-04 - 템포 심박 상한·심박존을 개인 심박 기준으로 공식 파생 (Issue #123 조사 → #127 구현)
- 배경: #123 조사 결과 템포 상한 165와 Z0~Z5 존이 개발자 개인값으로 4곳(`heartRateZones` Z4, `coach-run` tempoHeartRateCeilingBpm/boundary, `performanceProjection`, `trendInsights`)에 하드코딩돼 있었고, `AthleteProfile`에 개인 심박 입력 필드·환산식·개인화 경로가 전혀 없었다(문서 약속만 존재). 랩 "8랩"은 1km 분할이 아니라 소스(FIT/HealthKit) lap 레코드를 1:1 저장한 순번임도 확인.
- 결정: 심박존·템포/이지/회복 상한을 단일 공식으로 파생한다. 우선순위는 **LTHR > 측정 HRmax > Tanaka(208−0.7×나이) 추정 > 상수 fallback**. anchor=LTHR, 측정/추정 HRmax에서는 LT≈0.9×HRmax(역치 88~92% HRmax 중앙값). 존 경계는 anchor를 기준 상수 비율로 만들어 anchor=165면 기존 상수와 정확히 일치(미입력 회귀 0).
- 웹 근거: 템포 ~75~85% HRmax, 역치 ~85~92% HRmax / ~80~88% HRR; Tanaka 식이 220−나이보다 정확(특히 40세+); Friel LTHR(30분 단독 TT 마지막 20분 평균) 기반 존; Karvonen %HRR. (ASICS, Marathon Handbook, Tanaka PMC5862813, Joe Friel, RunReps)
- 포기한 대안: Karvonen(%HRR) 중심 — 사용자가 LTHR 우선을 선택. 안정심박은 입력은 받아 코칭 맥락으로 보존하되 anchor 산출엔 직접 쓰지 않음(추후 HRR 확장 여지). 랩 거리 정규화는 별도 decision 후보로 보류(route 기반 fastSegments 우선 정책 유지).
- 안전: Tanaka 추정은 단정 근거가 아니라 보수 신호로만 쓰고 측정/역치 입력을 권유. 레벨·나이로 안전 상한을 낮추지 않는다. 의료 단정 금지.
- 적용 범위: `src/entities/training-memory/model.ts`(AthleteProfile 3필드+normalize), `src/shared/lib/heartRateZones.ts`(deriveHeartRateModel), `src/shared/lib/performanceProjection.ts`, `src/shared/lib/trendInsights.ts`, `src/pages/dashboard/DashboardPage.vue`, `src/shared/ui/AppHeader.vue`, `src/pages/memory/MemoryPage.vue`, `supabase/functions/coach-run/index.ts`(deriveCoachHeartRateModel), `.harness/project/domain-rules.md`.
