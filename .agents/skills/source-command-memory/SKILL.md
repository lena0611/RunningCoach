---
name: "source-command-memory"
description: "오래 유지되는 프로젝트 사실과 기준을 프로젝트 메모리에 기록합니다."
---

# source-command-memory

Use this skill when the user asks to run the migrated source command `memory`.

## Command Template

# /memory

`AGENTS.md`의 읽기 순서를 따른 뒤 `.harness/session/project-memory.md`를 확인합니다.

## 수행
1. 임시 진행 상황이 아니라 오래 유지될 사실인지 먼저 판단합니다.
2. 도메인, 구조, 운영 기준, 반복 검증 규칙 중 장기 기억으로 남길 내용을 추립니다.
3. `.harness/session/project-memory.md`를 갱신합니다.

## 기준
- 단기 진행 상황은 `active-context.md`에 둡니다.
- 구조 결정과 이유는 `decision-log.md`에 둡니다.
- 본체 개발 메모리와 소비자 프로젝트 메모리는 설치 시 분리됩니다.
