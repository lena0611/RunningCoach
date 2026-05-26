# 프로젝트 헌장

이 문서는 프로젝트의 현재 상태와 책임 범위를 고정하는 카드입니다. 신규 구축 프로젝트뿐 아니라 기존 안정 프로젝트의 유지보수, 마이그레이션, 운영 개선에도 사용할 수 있어야 합니다.

> 확정되지 않은 항목은 추측해서 채우지 않습니다. 필요한 질문은 `.harness/session/developer-input-queue.md`에 남깁니다.

## 1. 프로젝트 상태
- 상태: `new-build`
- 현재 단계: 개인용 MVP 설계 및 구현
- 하네스 적용 목적: 개인 앱 완성을 통해 하네스가 방향 전환, 도메인 규칙, 검증 흐름을 잘 기록하고 강제하는지 함께 검증한다.

## 2. 기본 식별
- 프로젝트/서비스 이름: `PaceLAB`
- 소유 팀 또는 담당 주체: 개인 사용자
- 주요 사용자 또는 연동 시스템: 사용자 본인, Workoutdoors export 파일, Apple 건강 앱/HealthKit, 장기 확장 후보인 Strava API
- 핵심 업무 설명: 러닝 기록을 구조화해 저장하고, 목표와 최근 훈련 흐름을 기반으로 AI 코칭을 제공한다.

## 3. 책임 범위
- 이 저장소가 책임지는 것: Vue 기반 정적 웹 UI, FIT 파일 로컬 파싱, HealthKit 브리지 수신, Supabase 기반 `RunLog`/`TrainingMemory` 저장, 대시보드 계산, OpenAI 기반 AI 코칭 요청
- 이 저장소가 책임지지 않는 것: 의료적 진단, Workoutdoors/Strava 원본 데이터의 정확성 보장, 원본 운동 파일 장기 저장
- 변경 시 특히 조심해야 할 영역: 운동 파일 import, 저장 데이터 스키마, 목표 가능성/피로도/다음 훈련 추천 계산, 모바일 사용 흐름

## 4. 작업 유형
- 주된 작업 유형: 신규 기능, 도메인 규칙 정리, 모바일 UX 개선, 문서화
- 자주 반복되는 변경: 파일 import 정확도 개선, 코칭 규칙 추가, 대시보드/메모리 화면 조정, 하네스 문서 승격
- 자주 발생하는 장애 또는 회귀 위험: 파일 형식별 파싱 오차, 거리/시간/케이던스 보정 오류, 저장 데이터 변경으로 인한 기존 로컬 데이터 호환성 문제

## 5. 목표와 성공 기준
- 신규 구축 기준: 해결하려는 문제, 핵심 목표, 비목표, 초기 성공 기준
- 유지보수 기준: 안정성, 회귀 방지, 변경 추적성, 릴리스 안전성
- 현재 프로젝트에서 우선할 성공 기준: iPhone에서 앱처럼 열 수 있고, FIT 파일 또는 HealthKit에서 `RunLog` 후보를 만들고 저장과 다음 훈련 추천까지 완료된다.

## 6. 제약과 계약
- 제품/업무 제약: 개인용 앱이며 원본 운동 파일은 저장하지 않는다. 저장 대상은 구조화된 러닝 데이터, 훈련 메모리, 코칭 리포트, 누적 코칭 기억이다. 서버 전환 이후 기존 localStorage 데이터는 마이그레이션하지 않는다.
- 기술 제약: 웹 UI는 Vue 정적 빌드를 유지한다. GitHub Pages 공개 접근은 안내 페이지로 보내고, iOS 하이브리드 앱 또는 localhost에서만 기능을 연다. iOS HealthKit 접근은 Xcode 네이티브 타깃에서 capability와 사용자 권한을 통해 처리한다. 활성 스택은 `.harness/policy/profile.json`의 `activeStack`을 따른다.
- 외부 시스템 계약: 현재 기본 경로는 FIT 파일 import다. iOS 하이브리드 확장에서는 Apple 건강 앱/HealthKit에서 Workout 데이터를 읽는다. Strava 연동은 MVP 이후 확장 후보이며 OAuth 보안을 위해 서버리스 백엔드가 필요하다.
- 일정/리소스 제약: 개인 MVP이므로 먼저 범위를 좁혀 안정적인 FIT import와 규칙 기반 코칭을 완성한다.

## 7. 현재 작업 맥락
- 현재 들어온 요청 또는 작업 흐름: 웹은 GitHub Pages 정적 배포로 유지하고, Supabase Auth/Postgres/Edge Functions와 OpenAI Responses API 기반 AI 코칭으로 전환한다.
- 먼저 확인해야 할 문서/코드/명령: `.harness/session/active-context.md`, `.harness/session/decision-log.md`, `src/features/extract-run-data/localFileExtractor.ts`, `npm run build`, `npm run harness:check`
- 보류 질문: 목표 달성 가능성 계산식과 훈련 프로그램 세부 규칙은 별도 확정이 필요하다. 현재 확정 목표는 2026-11-21까지 10km 59:59 달성이다.
