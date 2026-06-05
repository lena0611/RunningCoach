# Manual Actions

에이전트나 하네스가 직접 처리할 수 없어 사용자가 직접 확인해야 하는 작업 목록입니다.

> 하네스 본체의 운영 목록이 아닙니다. 이 프로젝트의 외부 콘솔, secret, capability, Pages/배포 설정 같은 수동 조치만 남깁니다.

## Open

| 상태 | 항목 | 필요한 사용자 조치 | 관련 작업 |
| --- | --- | --- | --- |
| TBD | 예: 외부 서비스 secret 등록 | 콘솔에서 값을 등록하고 결과를 알려주세요. | TBD |
| done | GitHub Project `PaceLAB Development` 생성 권한 부여 | 2026-05-29 `gh auth refresh -s project` 완료 후 Project 생성, repo 연결, 필드 설정 완료. URL: `https://github.com/users/lena0611/projects/1` | 2026-05-29 GitHub Issues + Projects 도입 |
| done | Supabase Edge Function `coach-run` 스트리밍 복구 배포 | 2026-05-28 23:14 KST 배포 완료. Supabase Functions list 기준 `coach-run` ACTIVE version 45, updated_at 2026-05-28 14:14:11 UTC. 앱에서 AI 코칭이 토큰 단위로 표시되는지 재시도만 남았습니다. | 2026-05-28 coach-run 단일 호출 스트리밍 복구 |
| open | 하네스 본체에 "세션 파일 슬림 유지 원칙" 승격 요청 | 2026-06-05 본체 개발 에이전트에 브리프 전달 예정. 본체가 managed 파일(`.claude/commands/reminder.md`, `.harness/skills/registry.json`, `.harness/session/README.md`, `.harness/documentation/decision-flow.md`, 선택적으로 시드 템플릿·harness:check 린트)에 "next-session-reminder/active-context는 부트스트랩+포인터만, project/* 규칙 본문 복붙 금지, 슬림 유지" 지침을 반영해야 한다. **반영 확인 후 이 프로젝트에서 업데이트**: `nvm use` → `npm run harness:outdated -- --base-only` → `npm run harness:update -- --base-only` → `git diff --stat .harness .claude` → (완료 승인 후) `npm run harness:check`. `--base-only` 필수(기본 update는 stack). owned 파일인 두 세션 파일은 보존되므로 슬림화 내용 유지됨. | 2026-06-05 세션 파일 슬림화 + 본체 원칙 승격 |

## 작성 기준

- Supabase secret, GitHub/GitLab Pages 설정, Apple capability, 인증서, 스토어/클라우드 콘솔 설정처럼 로컬 코드 수정만으로 끝나지 않는 일을 기록합니다.
- 완료되면 상태를 `done`으로 바꾸고, 확인한 날짜와 근거를 관련 작업 칸에 남깁니다.
- 수동 조치가 구현 방향에 영향을 주면 `decision-log.md`에도 결정 근거를 남깁니다.
