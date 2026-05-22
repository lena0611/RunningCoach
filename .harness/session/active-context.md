# 현재 컨텍스트

이 문서는 이 프로젝트에서 최근 작업 상태와 다음 작업을 짧게 이어받기 위한 소비자 프로젝트 전용 문서입니다.

> 하네스 본체의 개발 기록이 아닙니다. 설치된 프로젝트의 현재 작업 맥락만 기록합니다.

## 현재 상태
- generatedAt: 2026-05-20T09:14:34.453Z
- baseHarness: 0.2.39
- activeStack: `.harness/policy/profile.json` 참고
- harnessMode: `.harness/policy/profile.json` 참고

## 최근 작업
- 하네스가 설치되었거나 업데이트되었습니다.
- 프로젝트 구조 분석 결과는 `.harness/session/project-scan-report.md`를 확인합니다.
- 설치/업데이트 직후 요약은 `.harness/session/handoff.md`를 확인합니다.
- RunContext는 AI 없는 정적 PWA 방향으로 전환 중이다.
- 러닝 파일 import는 FIT 단일 포맷으로 좁혔고, GPX/TCX/CSV 파싱 로직은 제거했다.
- 향후 편의성 확장은 Strava API 연동이다. 단, 정적 앱 단독이 아니라 서버리스 백엔드로 OAuth/refresh token을 처리해야 한다.

## 확인할 일
- `.harness/project/project-charter.md`의 TBD 항목을 프로젝트 상황에 맞게 채웁니다.
- 큰 작업이나 낯선 영역이면 에이전트가 `npm run harness:context -- "<작업 설명>"`으로 판단 컨텍스트를 만듭니다.
- 작업 후 `npm run harness:check`로 기준, 링크, 검증 상태를 확인합니다.
- 다음 구현 시 FIT import 정확도, 모바일 업로드 흐름, 규칙 기반 코칭 품질을 우선 확인한다.
