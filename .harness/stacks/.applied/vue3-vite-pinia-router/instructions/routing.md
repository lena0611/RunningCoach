# Routing

## 기본 구조

- Vue Router 생성은 `src/router/index.*`에서 수행합니다.
- 라우트 정의는 작은 단위로 분리하되, 최종 export는 하나의 routes 배열로 모읍니다.
- 관리자형 앱에서는 `Root` layout 아래에 업무 화면을 배치하고, 로그인/팝업/외부 진입 화면은 별도 route로 분리합니다.
- 개발 전용 layout 또는 guide route는 `import.meta.env.DEV` 조건으로만 포함합니다.

## 서버 주도 메뉴 구조

메뉴 구조를 서버가 소유하는 프로젝트에서는 다음 기준을 따릅니다.

- 프론트는 전체 메뉴 트리를 하드코딩하지 않습니다.
- 프론트는 `menuCode -> Vue component` 연결만 정적으로 관리합니다.
- 화면 접근은 가능한 한 단일 route 패턴과 `menuCode` param으로 처리합니다.
- 권한과 노출 조건은 서버 응답의 권한 배열, 메뉴 tree, 조건 metadata를 기준으로 판단합니다.
- 메뉴 tree가 버전 기반으로 내려오면 Pinia store와 localStorage에 캐시하고, 요청 header로 현재 버전을 선언합니다.

## Router Guard

- 인증, 외부 진입, 권한 확인은 가장 먼저 실행되는 전역 `beforeEach`에서 처리합니다.
- 화면 component 안의 guard는 UI 정리, 로그, 화면 단위 부수 효과처럼 늦게 실행되어도 되는 일만 담당합니다.
- 비동기 guard는 중복 로그인, 중복 ticket exchange, 중복 redirect가 발생하지 않도록 모듈 수준 상태나 명시적 플래그를 둡니다.
- 접근 불가 시 사용자가 머무를 수 있는 안전한 기본 화면으로 보냅니다.

## Component Registry

- registry는 메뉴 코드와 Vue component lazy import만 연결합니다.
- 메뉴 계층, label, 권한, 노출 조건은 registry에 두지 않습니다.
- 새 메뉴 화면을 만들면 Vue 파일 생성, registry 연결, 서버 메뉴 등록 요청을 하나의 작업으로 봅니다.
