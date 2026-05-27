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

## 2026-05-27 - 부상 선택 UI 3D around-view 전환
- 2D 인체 도식은 모바일에서 전후좌우 부위 인지가 약하므로 `InjuryBodySelector`는 Three.js 기반 3D 모델로 유지한다.
- 모델은 드래그 회전, 터치/raycast 선택, 선택 부위 3D 하이라이트를 제공하고, 목록 선택은 보조 입력으로 둔다.
- 부상 선택 UI는 의료 진단용 해부학 모델이 아니라 러닝 코칭을 위한 부위 정규화 입력이다. 상세 진단은 금지하고 훈련 강도 조절과 보강운동 처방의 입력값으로만 사용한다.
- 전신 단일 모델은 세그먼트가 겹치고 터치 영역이 길쭉하게 왜곡되므로 상체/허리, 하체, 발/발목을 별도 3D 모델 범위로 나눈다. 각 범위는 러너 부상 판단에 필요한 근육/힘줄/근막/관절 세그먼트를 실제 위치에 가깝게 배치한다.
