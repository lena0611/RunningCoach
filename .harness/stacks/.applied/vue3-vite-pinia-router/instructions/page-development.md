# Page Development

## 새 페이지 작업 순서

1. 기존 화면과 공용 컴포넌트에서 같은 패턴을 먼저 찾습니다.
2. `src/views/{area}/{Page}.vue`에 route-level page를 만듭니다.
3. 필요한 경우 `src/views/{area}/com/`, `src/views/{area}/pop/`에 전용 컴포넌트를 둡니다.
4. `componentRegistry`에 `menuCode -> component` lazy import를 추가합니다.
5. 서버 메뉴, 권한, label, 노출 조건 등록이 필요한지 확인합니다.
6. 검색/페이징/초기 데이터/i18n/권한 표시 기준을 적용합니다.
7. `npm run harness:check` 또는 프로젝트 검증 명령을 실행합니다.

## Vue 파일 구조

`<script setup>` 기준으로 다음 순서를 유지합니다.

1. global adapter, emit, ref, composable 선언
2. props
3. data, computed
4. watch
5. init, lifecycle
6. open 계열 method
7. API method
8. event handler와 기타 method
9. expose

순서는 리뷰와 탐색 비용을 낮추기 위한 기준입니다. 프로젝트가 이미 다른 로컬 순서를 갖고 있으면 로컬 기준을 우선하고 충돌을 기록합니다.

## 화면 상태

- 검색 조건은 URL query에 복원 가능한 형태로 둡니다.
- 페이지네이션이 있는 목록은 페이지 상태와 검색 조건을 함께 관리합니다.
- 단순 리포트나 대시보드는 필터 전용 composable을 사용합니다.
- API 응답 raw data를 바로 템플릿에 흩뿌리지 않고 필요한 형태로 가공합니다.

## 금지 기준

- 새 화면에서 같은 API를 여러 lifecycle에 중복 호출하지 않습니다.
- 권한 체크를 템플릿 곳곳에 복사하지 않고 helper나 store API를 사용합니다.
- 다국어 대상 문구를 key 없이 새로 고정하지 않습니다.
- 공용 SCSS로 해결 가능한 간격, 정렬, 폰트 스타일을 화면 scoped style에 반복 작성하지 않습니다.
