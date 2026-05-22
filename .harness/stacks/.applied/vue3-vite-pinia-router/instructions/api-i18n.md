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
