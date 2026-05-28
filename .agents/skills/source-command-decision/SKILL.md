---
name: "source-command-decision"
description: "중요한 구조 결정, 예외, 충돌 해결 이유를 결정 로그에 기록합니다."
---

# source-command-decision

Use this skill when the user asks to run the migrated source command `decision`.

## Command Template

# /decision

`AGENTS.md`의 읽기 순서를 따른 뒤 `.harness/session/decision-log.md`를 확인합니다.

## 수행
1. 결정한 내용, 선택지, 선택 이유, 포기한 대안을 짧게 정리합니다.
2. 회사 공통, 스택, 템플릿, 프로젝트, 개인 기준이 충돌했다면 우선순위와 해결 방식을 남깁니다.
3. `.harness/session/decision-log.md`에 날짜별 항목으로 기록합니다.

## 기준
- 소비자 프로젝트의 `decision-log.md`는 하네스 릴리스 노트가 아닙니다.
- 릴리스 변경사항은 본체 저장소의 `CHANGELOG.md`에 둡니다.
