# 현재 컨텍스트

이 문서는 이 프로젝트에서 최근 작업 상태와 다음 작업을 짧게 이어받기 위한 소비자 프로젝트 전용 문서입니다.

> 하네스 본체의 개발 기록이 아닙니다. 설치된 프로젝트의 현재 작업 맥락만 기록합니다.

## 현재 상태
- generatedAt: 2026-05-20T09:14:34.453Z
- baseHarness: 0.2.39
- activeStack: `.harness/policy/profile.json` 참고
- harnessMode: `.harness/policy/profile.json` 참고

## 최근 작업
- 긴 대화창을 새 스레드로 넘기기 위한 최신 인수인계는 `.harness/session/thread-handoff-2026-05-28.md`를 먼저 확인한다.
- 현재 제품명은 `PaceLAB`이다. 사용자-facing UI에서 `RunContext` 표현은 제거하는 방향이다.
- 현재 구조는 GitHub Pages 정적 프론트 + Supabase Auth/Postgres/Edge Function + OpenAI API + iOS WKWebView/HealthKit 하이브리드다.
- iOS 네이티브 로컬 프로젝트는 `/Users/smart-tn-083/practice/RunningCoach`에 있다.
- HealthKit 자동 동기화, 세션별 HealthKit 재갱신, FIT 보조 import를 유지한다.
- AI 코칭은 세션 상세에서 열며, 별도 Coach 하단 탭은 제거된 상태다.
- 작업 후 `source ~/.nvm/nvm.sh && nvm use`를 먼저 적용하고 `npm run build`, `npm run harness:check -- --no-cache` 순서로 검증한다.

## 확인할 일
- 새 대화에서 이 문서만 보지 말고 `.harness/session/thread-handoff-2026-05-28.md`를 먼저 읽는다.
- 코칭/훈련 알고리즘 작업은 `.harness/project/ai-coaching-goal.md`, `.harness/project/domain-rules.md`, `.harness/project/running-coaching-standards.md`를 함께 확인한다.
- HealthKit/iOS 작업은 `.harness/project/healthkit-data-contract.md`와 네이티브 로컬 프로젝트를 함께 확인한다.
- Supabase Edge Function 변경 시 `coach-run` 배포가 별도로 필요하다.
