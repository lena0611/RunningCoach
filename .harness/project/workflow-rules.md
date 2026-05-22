# 작업 흐름 규칙

프로젝트 고유의 개발, 리뷰, 릴리스, 장애 대응 흐름을 기록합니다.

## 개발 흐름
- 먼저 도메인/아키텍처 결정이 일회성인지 반복 규칙인지 판단한다.
- 반복 규칙이면 `.harness/session/*`에만 두지 말고 `.harness/project/*` 문서로 승격한다.
- 구현은 정적 PWA 기본 경로를 우선하며, secret이 필요한 기능은 별도 서버리스 확장으로 분리한다.
- 모바일 반복 사용 흐름을 우선 검토한다.
- 사용자 답변이 "추천/예상한 기본값대로"인 경우, 적용한 기본값을 `developer-input-queue.md`와 관련 project 문서에 구체적으로 남긴다.

## 리뷰 기준
- 원본 파일 또는 secret이 브라우저 저장소에 남지 않는지 확인한다.
- FIT import 결과가 거리, 시간, 페이스, 심박, 케이던스를 일관되게 계산하는지 확인한다.
- 저장 데이터 스키마 변경은 기존 로컬 데이터 호환성을 검토한다.
- 코칭 규칙 변경은 사용자 목표, 최근 기록, 부상/더위 제약과 충돌하지 않는지 확인한다.
- 목표 관련 계산은 현재 목표 `2026-11-21까지 10km 59:59`를 기준으로 검토한다.

## 릴리스 절차
- GitHub Pages 같은 정적 배포를 기준으로 `npm run build` 결과물을 사용한다.
- 배포 전 정적 라우팅과 PWA manifest가 유지되는지 확인한다.

## 장애 대응
- 파일 import 실패 시 원본 파일을 저장하지 않고 사용자에게 수동 입력 경로를 제공한다.
- 저장 데이터 손상 가능성이 있으면 export/import 백업 기능을 우선 검토한다.
- Strava 연동 장애는 로컬 FIT import fallback을 유지한다.

## 검증 명령
- 기본 검증: `npm run build`
- 하네스 검증: `npm run harness:check`
- 하네스 문맥 확인이 필요한 큰 변경: `npm run harness:context -- "<작업 설명>"`

## 테스트 전략 선택지
테스트 루트나 `test` script가 없다면 아래 중 하나를 선택해 이 문서 또는 `decision-log.md`에 기록합니다.

1. 초기 단계: lint + build + 수동 확인
2. 단위 테스트: 프로젝트 스택에 맞는 unit test 도구 도입
3. 통합 테스트: API, 저장소, 외부 연동 경계 검증
4. E2E 테스트: 주요 사용자/운영 흐름 검증
5. 테스트 보류: 사유와 재검토 조건을 `decision-log.md`에 기록

## 변경 규칙
- 작업 흐름이 바뀌면 README, CI, hook, `harness:check` 명령과 함께 검토합니다.
- 임시 예외는 `waivers.json` 또는 `decision-log.md`에 범위와 만료 조건을 남깁니다.
- `npm run hooks:install`은 `core.hooksPath`를 `.githooks`로 설정합니다. 기존 `.git/hooks/*` 또는 기존 `core.hooksPath`의 hook은 삭제하지 않고 `harness.previousHooksPath`에 저장해 `.githooks/*`에서 먼저 체인 실행합니다.
