# Project Structure

## 권장 디렉터리

```text
src/
  apis/ or api/              # API namespace modules
  assets/scss/ or styles/    # global SCSS design system
  components/                # app-wide reusable components
  composable/ or composables/# reusable Composition API logic
  constants/                 # static mappings such as component registry
  directives/                # Vue custom directives
  plugins/                   # Vue app plugins and global adapters
  router/                    # Vue Router setup and guards
  service/ or services/      # app instance, i18n, external service bridges
  store/ or stores/          # Pinia stores
  utils/                     # pure utilities and browser helpers
  views/                     # route-level pages
```

## 배치 기준

- 여러 업무 영역에서 재사용하는 UI는 src/components 영역에 둡니다.
- 특정 화면이나 업무 영역에만 결합된 하위 컴포넌트는 해당 `src/views/{area}/` 아래에 둡니다.
- 전역 상태는 Pinia store에 두고, 화면 내부 상태는 `reactive` 또는 `ref`로 화면 안에 둡니다.
- 반복되는 화면 로직은 composable로 분리합니다.
- 메뉴 코드와 실제 Vue 컴포넌트의 정적 연결은 `componentRegistry` 같은 단일 파일에 모읍니다.
- API 호출 함수는 화면에 직접 흩뿌리지 않고 API namespace 모듈과 plugin adapter를 거쳐 사용합니다.

## 금지 기준

- 새 화면을 추가하면서 라우터, 메뉴 registry, 권한 흐름 중 하나만 갱신하지 않습니다.
- 공용 컴포넌트로 승격할 수 없는 도메인 결합 컴포넌트를 src/components 영역에 두지 않습니다.
- store에 화면 전용 임시 상태를 과도하게 올리지 않습니다.
- `@/` alias를 우회하기 위해 깊은 상대 경로를 반복하지 않습니다.
