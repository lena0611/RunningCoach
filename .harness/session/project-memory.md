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
- OpenAI API Key는 브라우저나 iOS 앱에 두지 않고 Supabase Edge Function secret에만 둔다.
- iOS 네이티브 로컬 프로젝트는 `/Users/smart-tn-083/practice/RunningCoach`에 있다.
- Workoutdoors export 파일은 FIT 입력을 보조 경로로 유지한다. 기본 반복 사용 흐름은 HealthKit 자동 동기화와 세션별 HealthKit 재갱신이다.
- Strava 연동은 GitHub Pages 단독 정적 앱만으로 처리하지 않는다. OAuth `client_secret`, refresh token, webhook callback 보호를 위해 Cloudflare Worker, Vercel Function 등 최소 서버리스 백엔드를 둔다.
- AI 코칭은 세션 상세에서 열며, 별도 Coach 하단 탭은 제거된 상태다.
- PaceLAB은 workstream 대화창 분리 운영을 명시적으로 채택했다. 하네스 본체의 일반 가이드는 선택형이지만, 이 프로젝트 안에서는 강하게 적용한다.
- 정식 개발 작업의 단일 출처는 GitHub Issues이고, 전체 상태판은 GitHub Project `PaceLAB Development`로 둔다. `.harness/project/*`는 장기 기준과 결정 문서로 유지한다.
- 대화창은 작업 유형별로 분리한다. 기획, 버그픽스, UI/UX, 코칭/훈련 로직, HealthKit/iOS, Supabase/OpenAI Edge Function, 부상관리 도메인, 하네스/정책은 서로 다른 대화창에서 진행한다.
- 각 대화창은 모든 사용자 요청마다 현재 workstream 범위를 먼저 식별한다. 범위가 불명확하거나 요청이 범위를 넘으면 구현을 넓히지 않고 사용자에게 확인하거나 대상 workstream 인수인계를 제안한다.
- 모든 업무 요청은 시작할 때 `완료 책임 창`을 정한다. 완료 책임 창은 업무 목표, 완료 조건, 후속 workstream 인수인계, 최종 리뷰, 검증 후보 정리를 소유한다.
- 단일 workstream 업무는 해당 workstream 창이 완료 책임 창이다. 여러 workstream을 거치는 업무는 처음 업무 목표를 받은 창이 임시 완료 책임 창이며, 업무 중심이 더 명확한 workstream으로 드러나면 완료 책임을 이관한다.
- 현재 창에 수행 역할이 일부 있어도 선행 결정이나 선행 구현이 다른 workstream에 있으면 그 workstream을 먼저 안내한다.
- 사용자가 완료를 명시해도 현재 창에서 완료 처리할 수 있는지와 후속 workstream 확인이 필요한지를 먼저 검토한다.
- 기존 workstream으로 안정적으로 처리하기 어려운 새 도메인이 반복되면 `01-harness-ops`에서 새 workstream 추가 여부를 검토한다.
- 새 대화창의 시작 문서와 종료 기록 기준은 `.harness/project/workflow-rules.md`의 `대화창 분리 운영`을 따른다.
- 완료 승인 전 자동 검증/커밋 금지 원칙은 하네스 본체 `0.2.51`에 반영되었으므로 `CLAUDE.md`와 `AGENTS.md`를 따른다.
- Node 버전 불일치로 npm 스크립트가 실패하면 중단하지 않고 프로젝트 루트에서 `. "$HOME/.nvm/nvm.sh" && nvm use`로 `.nvmrc` 버전을 활성화한 뒤 재시도한다.
- 부상관리 도메인은 0~5 통증 체크인, 사용자 승인 기반 완치 처리, 목표 예상/훈련 강도에 반영되는 부상/회복 게이트, 근거 출처와 의료 한계를 포함한 참고용 보강운동 기준을 따른다.

## 기록 원칙
- 한 번뿐인 구현 세부사항은 기록하지 않습니다.
- 반복되는 도메인 규칙, 아키텍처 경계, 검증 기준만 남깁니다.
- 오래된 사실을 바꿀 때는 `decision-log.md`에 변경 이유를 남깁니다.
