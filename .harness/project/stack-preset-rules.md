# 스택 프리셋 로컬 규칙

이 문서는 `npm run stack:apply`가 활성 스택 프리셋을 프로젝트 로컬 규칙으로 정착시키는 장소입니다.

프리셋은 공통 하네스의 강제 규칙이 아닙니다. 프로젝트가 특정 스택을 선택했을 때, 그 선택을 로컬 개발방법론의 일부로 기록합니다.

<!-- harness-stack-rules:start -->
## 적용된 스택: Vue 3 + Vite + Pinia + Vue Router Stack Harness

- stackId: `vue3-vite-pinia-router`
- framework: Vue 3 / Vite / Pinia / Vue Router / SCSS
- designPattern: admin frontend + server-driven menu routing + Pinia module stores + global plugin adapter + SCSS design system

이 섹션은 `npm run stack:apply`가 생성한 로컬 규칙입니다. 공통 하네스의 전역 강제가 아니라, 이 프로젝트가 선택한 스택 기준으로 해석합니다.

---

### instructions/overview.md

# Overview

이 스택 기준은 Vue 3, Vite, Pinia, Vue Router를 사용하는 관리자형 프론트엔드 프로젝트에 적용합니다.

## 적용 범위

- Vite 기반 개발 서버, proxy, build 설정
- Vue 3 Composition API와 `<script setup>` 중심의 화면 개발
- Pinia 기반 전역 상태와 localStorage 캐시
- Vue Router 전역 가드와 메뉴 코드 기반 화면 연결
- API 모듈 자동 등록과 globalProperties 어댑터
- vue-i18n 기반 다국어 메시지 로딩과 캐시
- SCSS 디자인 시스템과 공용 컴포넌트 우선 사용
- `npm run dev`, `npm run build`, `npm run harness:check` 기준 검증 흐름

## 제외 범위

- 특정 업무 도메인의 용어, 권한 코드, 메뉴 코드
- 특정 서비스의 API endpoint 상세
- 특정 화면의 UI 문구나 운영 정책
- 개인 개발자 전용 선호 규칙
- 프로젝트 scaffold 파일 자체

제외 범위의 내용은 적용 프로젝트의 프로젝트 기준 문서에 둡니다.

## 기본 원칙

1. 회사 공통 기준은 그대로 따르고, 이 문서는 Vue3 스택에서 필요한 구체 기준만 추가합니다.
2. 스택 기준은 프로젝트 로컬룰로 정착된 뒤 적용 프로젝트의 기존 기준과 함께 읽습니다.
3. 특정 화면 구현보다 구조, 흐름, 검증 가능성에 집중합니다.
4. 코드가 이미 가진 로컬 규칙이 있으면 먼저 감지하고, 충돌은 리포트로 드러냅니다.

---

### instructions/project-structure.md

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

---

### instructions/runtime-env.md

# Runtime And Environment

## Node

- 하네스 실행 최소 Node는 `20.19.0`입니다. 스택 하네스 스크립트는 이 버전에서 동작하도록 유지합니다.
- `package.json`에는 `>=20.19.0`로 기록합니다.
- 스택 하네스 패키지는 소비자 프로젝트에 `.nvmrc`를 주입하지 않습니다.
- 기존 프로젝트의 `.nvmrc`는 프로젝트/Jenkins 빌드 계약으로 보고 자동 덮어쓰기하지 않습니다.
- Node 20은 2026-04-30에 EOL이므로 신규 프로젝트는 Jenkins 검증이 준비되는 대로 Node 22/24 전환을 검토합니다.
- 프로젝트에 `.nvmrc`가 있으면 개발 서버와 빌드 전 `nvm use` 기준을 따릅니다.
- Node 버전 변경으로 native dependency가 깨질 수 있으므로, 버전이 바뀐 뒤에는 의존성 재설치를 고려합니다.

## Vite

- `vite.config.*`는 개발 서버 proxy, base path, alias, plugin, build option의 단일 진실 출처입니다.
- `@` alias는 `src`를 가리키도록 유지합니다.
- 개발 서버 proxy는 로컬 개발 전용입니다. 운영 빌드는 같은 origin 또는 배포 환경의 gateway 규칙을 따릅니다.
- 운영 base path가 있으면 `base`에 명시하고, 라우터 history와 배포 경로가 일치하는지 확인합니다.

## 환경 변수

- 개발자별 값은 `.env.local`에 두고 커밋하지 않습니다.
- 공유 가능한 예시는 `.env.local.example` 또는 `.env.example`에 둡니다.
- 클라이언트에 노출되는 값만 `VITE_` prefix를 사용합니다.
- 운영 secret은 Vite env에 넣지 않습니다.

## PWA와 서비스 워커

- PWA를 사용하는 프로젝트는 update prompt, cache glob, maximum file size를 명시합니다.
- 서비스 워커 갱신은 사용자 작업 손실을 만들 수 있으므로 즉시 강제 reload보다 확인 흐름을 둡니다.
- PWA plugin은 빌드 결과와 운영 배포 정책을 함께 검토합니다.

---

### instructions/routing.md

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

---

### instructions/state-management.md

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

---

### instructions/api-i18n.md

# API And I18n

## API Layer

- API 모듈은 namespace 단위로 분리합니다.
- Vue plugin에서 API 모듈을 자동 등록하고 `app.config.globalProperties.$api` 같은 단일 접근점을 제공합니다.
- 화면은 HTTP client를 직접 생성하지 않고 API namespace를 통해 호출합니다.
- 공통 error handling은 `catch(gp.$error)` 또는 프로젝트의 표준 error adapter로 모읍니다.
- 인증 token, 권한, 메뉴, 설정처럼 모든 응답에서 갱신될 수 있는 정보는 HTTP interceptor에서 처리합니다.

## Global Adapter

- router, user, permission, menu, utility, dialog처럼 전역 접근이 필요한 항목은 `globalProperties`와 `provide` 중 프로젝트 표준을 정해 일관되게 씁니다.
- Pinia store에서 global adapter를 써야 한다면 pinia plugin으로 주입하고, 순환 참조를 만들지 않습니다.
- 브라우저 console 디버깅용 전역 객체는 개발 모드에서만 노출합니다.

## I18n

- `vue-i18n`은 Composition API 모드 기준으로 초기화합니다.
- 메시지를 서버에서 받아오는 프로젝트는 Pinia store와 localStorage cache를 함께 설계합니다.
- 언어 전환은 locale 즉시 변경, 사용자 설정 저장, 메시지 fetch, i18n message 갱신 순서로 수행합니다.
- 화면 문구는 번역 key와 기본 문구를 함께 남길 수 있는 wrapper를 사용해 리뷰 가능성을 높입니다.
- 외부 진입 ticket이나 사용자 설정에 언어가 포함되면 앱 초기화 초기에 locale을 확정합니다.

---

### instructions/ui-style.md

# UI And Style

## SCSS 구조

- 전역 SCSS는 `import.scss` 같은 entry 파일에서 순서를 통제합니다.
- variable, color, font, reset을 먼저 로드하고, component style과 layout style을 뒤에 둡니다.
- reset, layout, utility, form, button, table, modal, tab, pagination 같은 영역을 파일 단위로 분리합니다.
- 같은 파일에 unrelated style을 계속 추가하지 않습니다.

## 스타일 작성 우선순위

1. 공용 utility class
2. layout 또는 content 공용 class
3. 공용 component props/class
4. 화면의 `<style scoped>`

`<style scoped>`는 공용 기준으로 표현할 수 없는 화면 고유 조정에만 씁니다.

## 관리자형 UI 기준

- 화면은 반복 업무에 맞게 조밀하고 예측 가능한 구조를 우선합니다.
- 페이지 wrapper, title, content container, contents box 같은 기본 골격을 유지합니다.
- 검색 조건, 표, pagination, modal, tab, form control은 기존 공용 컴포넌트를 먼저 찾습니다.
- 같은 화면 패턴을 새로 만들면 공용화 대상인지 검토합니다.

## 컴포넌트 기준

- 앱 전체 공용 컴포넌트는 domain 용어를 몰라도 사용할 수 있어야 합니다.
- 특정 업무 API나 데이터 구조에 결합된 컴포넌트는 해당 view 하위에 둡니다.
- 팝업 컴포넌트는 `open`, `close`, `isOpened` 같은 표준 인터페이스를 프로젝트 기준으로 맞춥니다.
- 부모가 자식 method를 호출해야 하면 `ref + defineExpose` 사용 범위를 문서화합니다.

---

### instructions/page-development.md

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

---

### instructions/verification.md

# Verification

## 기본 명령

적용 프로젝트는 최소 다음 명령을 가져야 합니다.

```bash
npm run dev
npm run build
npm run harness:check
```

프로젝트에 lint, test, typecheck가 있으면 `harness:check`가 함께 실행되도록 유지합니다.

## 변경별 확인 기준

| 변경 | 확인 |
| --- | --- |
| `vite.config.*` | dev server, proxy, base path, alias, build option 확인 |
| `src/router/**` | 인증/권한/외부 진입 guard 순서 확인 |
| `componentRegistry` | menuCode와 Vue 파일 연결 확인 |
| `src/store/**` | load/save/remove, localStorage key, 서버 응답 갱신 위치 확인 |
| `src/apis/**`, `src/plugins/**` | API namespace 등록과 error handling 확인 |
| `src/assets/scss/**` | import 순서와 공용 class 중복 확인 |
| 새 page | 공용 컴포넌트, query 복원, 권한, i18n, build 확인 |

## 자동화 원칙

- 수동 개발자에게 git hook은 선택형일 수 있습니다.
- AI 에이전트 작업은 hook 설치 여부와 무관하게 `harness:check`를 완료 기준으로 봅니다.
- 스택 기준이 바뀌면 `.harness/project/stack-preset-rules.md`와 실제 코드 구조를 함께 확인합니다.
- scaffold 템플릿을 별도로 적용한 경우에는 해당 템플릿의 검증 명령도 함께 실행합니다.
<!-- harness-stack-rules:end -->

## 운영 원칙
- 이 파일의 관리 섹션은 `stack:apply`와 `stack:reset`이 갱신합니다.
- 관리 섹션 밖에는 프로젝트 고유 보충 규칙을 적을 수 있습니다.
- 기존 로컬 방법론과 충돌하면 `.harness/project/local-methodology.md`의 우선순위 기준을 따릅니다.
