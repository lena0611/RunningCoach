# State Management

## Pinia Store

- 전역 사용자 정보, 권한, 메뉴 tree, 환경 설정, 언어 메시지처럼 앱 전체에서 공유되는 상태만 store에 둡니다.
- 화면 내부 입력값, 임시 선택값, 모달 상태는 화면 또는 composable 안에 둡니다.
- localStorage에 저장하는 store는 `load`, `save`, `remove` action을 명확히 둡니다.
- 서버 응답으로 갱신되는 store는 응답 처리 위치를 하나로 모읍니다.

## 권한과 메뉴 상태

- 권한 원천은 서버 응답입니다.
- 권한 store는 권한 배열을 저장하고 `isAllowed(code)` 같은 작은 조회 API를 제공합니다.
- 개발용 전체 허용 모드가 필요하면 localStorage 플래그로 명시하고 운영 권한 흐름과 분리합니다.
- 메뉴 store는 entry 또는 사용자 범위별 cache key를 분리합니다.

## 초기 데이터

- 여러 화면에서 반복 사용하는 초기 데이터는 앱 시작 후 한 번 로드하고 store에서 공유합니다.
- 화면마다 같은 초기 데이터 API를 직접 호출하지 않습니다.
- store getter는 필터링된 파생 목록을 제공하고, 화면은 computed로 참조합니다.
- localStorage에 저장하지 않아야 할 최신성 민감 데이터는 새로고침 시 다시 로드합니다.

## Composable

- URL query와 연결되는 검색/페이징 상태는 composable로 표준화합니다.
- composable은 `init`, `sync`, `reset`처럼 호출 시점이 분명한 API를 제공합니다.
- 화면에서 API 호출 순서를 숨기기보다, 상태 복원과 조회 타이밍을 읽기 쉽게 유지합니다.
