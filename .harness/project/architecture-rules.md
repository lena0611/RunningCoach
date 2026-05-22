# 아키텍처 규칙

프로젝트 고유의 모듈 경계, 의존 방향, 데이터 흐름을 기록합니다.

## 레이어와 책임
- `src/app`: 앱 부트스트랩, 라우터, 전역 스토어, 전역 스타일을 담당한다.
- `src/pages`: 화면 단위 조합을 담당한다.
- `src/widgets`: 재사용 가능한 화면 블록을 담당한다.
- `src/features`: 파일 import, 규칙 기반 코칭, 컨텍스트 생성 같은 사용자 행동 중심 로직을 담당한다.
- `src/entities`: `RunLog`, `Lap`, `TrainingMemory` 같은 도메인 타입과 상수를 담당한다.
- `src/shared`: 포맷터, 통계 계산, 공통 UI, 외부 라이브러리 타입 선언을 담당한다.

## 의존 방향
- 상위 레이어는 하위 레이어를 사용할 수 있지만, 하위 레이어가 pages/widgets에 의존하지 않는다.
- 도메인 타입은 `entities`에 두고 계산 유틸은 `shared/lib` 또는 관련 `features`에 둔다.
- 정적 앱 기본 경로에서는 서버 API 호출을 만들지 않는다.

## 공개 API 경계
- 현재 웹 앱은 정적 PWA이며 공개 서버 API가 없다.
- iOS 확장 방향은 하이브리드 앱이다. Vue 화면은 WebView 또는 로컬 번들로 유지하고, 네이티브 iOS 레이어는 HealthKit 권한/조회와 웹-네이티브 브리지만 담당한다.
- Strava 연동을 추가할 때만 별도 서버리스 API를 둔다. 이 API는 Strava OAuth, refresh token, activity fetch만 책임진다.
- 서버리스 API는 `RunLog` 영구 저장소가 아니다. 개인 데이터 저장은 기본적으로 브라우저 로컬 저장소가 담당한다.
- 개인 서버/클라우드 동기화는 현재 기본 범위가 아니다.

## 데이터 흐름
- FIT 파일 선택 -> 브라우저 로컬 파싱 -> 사용자가 확인/수정 -> `RunLog` 저장 -> 대시보드/Rule Coach 계산
- iOS 하이브리드 확장: Workoutdoors -> Apple 건강 앱/HealthKit 저장 -> 네이티브 iOS HealthKit 조회 -> 웹 앱에 `RunLog` 후보 전달 -> 사용자 확인/저장
- `TrainingMemory` 수정 -> 로컬 저장 -> Rule Coach와 컨텍스트 생성에 반영
- 백업/복원 확장: 로컬 저장 데이터 -> JSON export/import -> 동일 브라우저 또는 새 기기에서 복원
- 장기 확장: Strava activity fetch -> `RunLog` 후보 생성 -> 사용자 확인/저장

## HealthKit 브리지 계약
- HealthKit 데이터 구조와 `RunLog` 매핑은 `.harness/project/healthkit-data-contract.md`를 기준으로 한다.
- 네이티브는 `HKWorkout` 러닝 세션과 관련 quantity samples를 구조화된 후보로 변환한다.
- 웹 앱은 HealthKit 원본 객체를 직접 다루지 않고 `HealthKitRunCandidate` 같은 plain JSON 후보만 받는다.

## 새 모듈 추가 규칙
- 새 파일 import 포맷을 추가하기 전에 FIT 단일 포맷으로 해결할 수 없는 이유를 `decision-log.md`에 남긴다.
- 새 코칭 규칙은 근거와 입력 데이터, 출력 영향을 함께 기록한다.
- 외부 API 연동은 secret 보관이 필요한지 먼저 판단하고, 필요하면 정적 프론트가 아니라 서버리스 경계로 분리한다.
- HealthKit 연동은 서버리스나 웹 브라우저 코드가 아니라 iOS 네이티브 타깃에서 구현한다. 웹 앱은 HealthKit 권한 요청이나 직접 조회를 담당하지 않는다.

## 변경 규칙
- 아키텍처 경계 변경은 `decision-log.md`에 이유를 남깁니다.
- 공통 하네스의 스택 기준과 충돌하면 로컬 규칙의 적용 범위와 예외를 명시합니다.
