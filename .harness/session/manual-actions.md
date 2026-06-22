# Manual Actions

에이전트나 하네스가 직접 처리할 수 없어 사용자가 직접 확인해야 하는 작업 목록입니다.

> 하네스 본체의 운영 목록이 아닙니다. 이 프로젝트의 외부 콘솔, secret, capability, Pages/배포 설정 같은 수동 조치만 남깁니다.

## Open

| 상태 | 항목 | 필요한 사용자 조치 | 관련 작업 |
| --- | --- | --- | --- |
| TBD | 예: 외부 서비스 secret 등록 | 콘솔에서 값을 등록하고 결과를 알려주세요. | TBD |
| done | 하네스 본체 개선요청 — `harness:update`가 소비자 `CLAUDE.md` 무단 덮어쓰기 | **2026-06-22 base 0.2.70에서 해소** — 진입 파일(CLAUDE/AGENTS/copilot)을 마커 기반 머지(`<!-- harness-managed:start/end -->`)로 전환: 소비자 수정본은 보존하고 마커 안(본체 영역)만 갱신해 무단 덮어쓰기가 없어짐. 요청서: `.harness/session/harness-body-improvement-request-claude-md-overwrite.md`. | 2026-06-15 base 0.2.64 → 2026-06-22 0.2.70 해소 |
| open | 루트 `CLAUDE.md` 마커 마이그레이션(선택) | 0.2.70 마커 머지 도입 후 루트 `CLAUDE.md`는 소비자 수정본이라 마커 없이 보존됨(그대로도 동작 — 완전 소비자 소유로 유지). 본체 `CLAUDE.md` 기준 갱신을 받고 싶을 때만: 본체 영역을 `harness-managed:start/end`로 감싸고 프로젝트 지침을 end 아래로 옮긴 뒤 `harness:update` 재실행. ⚠ 경계 오설정 시 다음 업데이트가 프로젝트 내용을 침범할 수 있어 신중히. (AGENTS.md·copilot은 자동 이전 완료.) | 2026-06-22 base 0.2.70 업데이트 |
| done | GitHub Project `PaceLAB Development` 생성 권한 부여 | 2026-05-29 `gh auth refresh -s project` 완료 후 Project 생성, repo 연결, 필드 설정 완료. URL: `https://github.com/users/lena0611/projects/1` | 2026-05-29 GitHub Issues + Projects 도입 |
| done | Supabase Edge Function `coach-run` 스트리밍 복구 배포 | 2026-05-28 23:14 KST 배포 완료. Supabase Functions list 기준 `coach-run` ACTIVE version 45, updated_at 2026-05-28 14:14:11 UTC. 앱에서 AI 코칭이 토큰 단위로 표시되는지 재시도만 남았습니다. | 2026-05-28 coach-run 단일 호출 스트리밍 복구 |
| done | 하네스 본체에 "세션 파일 슬림 유지 원칙" 승격 요청 | 2026-06-05 본체 v0.2.54에 반영 확인 완료. `harness:update -- --base-only`로 0.2.53→0.2.54 업데이트. managed 파일 `.claude/commands/reminder.md`, `.harness/session/README.md`, `.harness/documentation/decision-flow.md`, `.harness/skills/registry.json`에 "next-session-reminder/active-context는 부트스트랩+포인터만, project/* 규칙 본문 복붙 금지, append-only 금지" 지침 반영됨. owned 두 세션 파일은 보존(변경 없음) 확인. | 2026-06-05 세션 파일 슬림화 + 본체 원칙 승격 |

## 작성 기준

- Supabase secret, GitHub/GitLab Pages 설정, Apple capability, 인증서, 스토어/클라우드 콘솔 설정처럼 로컬 코드 수정만으로 끝나지 않는 일을 기록합니다.
- 완료되면 상태를 `done`으로 바꾸고, 확인한 날짜와 근거를 관련 작업 칸에 남깁니다.
- 수동 조치가 구현 방향에 영향을 주면 `decision-log.md`에도 결정 근거를 남깁니다.
