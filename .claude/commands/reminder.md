---
description: 다음 세션에서 자동으로 떠올릴 리마인더를 확인하고 갱신합니다.
allowed-tools: Read, Write, Edit
---

# /reminder

`CLAUDE.md`의 읽기 순서를 따른 뒤 `.harness/session/next-session-reminder.md`를 확인합니다.

## 수행
1. 현재 작업에서 다음 세션에 반드시 이어받아야 할 항목을 정리합니다.
2. 미완료 작업, 다시 물어봐야 할 질문, 검증하지 못한 항목을 구분합니다.
3. `.harness/session/next-session-reminder.md`를 짧게 갱신합니다.

## 기준
- 이 파일은 다음 세션 시작 시 Claude Code `SessionStart` hook으로 표시됩니다.
- 본체 릴리스 변경 이력은 `CHANGELOG.md`에 남기고, 프로젝트별 이어받을 맥락만 여기에 둡니다.
