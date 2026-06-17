---
description: OpenAI Codex CLI로 현재 변경을 독립 교차검증한다(코드 리뷰).
allowed-tools: Bash, Read, Grep
---

# /codex

내 작업을 **OpenAI Codex CLI로 독립 교차검증**한다. Claude의 자기검증을 보완하는 제2의 눈.
인자 `$ARGUMENTS`로 초점/범위를 줄 수 있다(없으면 uncommitted 변경 전체).

## 실행 순서
1. **사전 점검**: `which codex`로 설치 확인. 없으면 `npm install -g @openai/codex` 안내. `~/.codex/auth.json` 없으면 사용자에게 `!codex login` 요청 후 중단.
2. **검증 대상 판단**:
   - `$ARGUMENTS`가 브랜치명(예: `main`)이면 → `codex exec review --base <branch>`
   - 그 외/없으면 → `codex exec review --uncommitted` (staged+unstaged+untracked)
   - 변경이 없으면 → 직전 커밋 대상 `codex exec review --base HEAD~1`
3. **리뷰 지침을 프롬프트로 넘긴다**(하네스 기준 주입). 아래 명령 형태로 실행한다:

   ```bash
   . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 && nvm use >/dev/null 2>&1
   codex exec review --uncommitted "한국어로 리뷰한다. 다음을 중점으로 심각도(blocker/major/minor)를 붙여라: \
   ① 버그·엣지케이스 ② 요구사항 일반화 누락(단일 케이스만 고치고 전체/모든 상태를 안 봄) \
   ③ 하네스 기준 위반(.harness/policy/ai-standard-guiding-policy.md, .harness/project/*) \
   ④ UI 오버플로우/렌더 위험 ⑤ DB 마이그레이션 배포 누락(파일만 만들고 db push 안 함) \
   ⑥ 타입 안전·null 처리. 근거 파일:라인을 명시하라."
   ```
4. **결과 처리**: Codex 출력을 그대로 인용하고, 각 지적에 내 **동의/반박**을 1줄씩 덧붙인다(Codex 맹신 금지 — 틀린 지적은 근거와 함께 반박). blocker/major는 수정 후보로 정리.

## 참고
- 비대화 모드(`codex exec`)라 세션을 멈추지 않는다. 시간이 걸리면 `run_in_background`로 돌리고 결과를 회수한다.
- 하네스 검증 루프([[web-change-verify-render-and-migration]])와 상호보완: Codex는 정적 교차검증, 사용자 시각검증은 별도 필수.
