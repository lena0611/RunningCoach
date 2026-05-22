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
