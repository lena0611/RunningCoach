# LLM 프로바이더 런북 (coach-run)

AI 코칭(coach-run Edge Function)의 LLM 프로바이더 구성·키/모델 정보 위치·복귀 절차의 단일 출처.
LLM 콜 지점은 `supabase/functions/coach-run/index.ts` **한 곳**이며, OpenAI 호환 Chat Completions 형식을 사용한다.

## 현재 구성 (2026-07-07 업데이트, PR #598)

| 항목 | 값 |
|---|---|
| 프로바이더 | **NVIDIA build.nvidia.com 무료 API** |
| 모델 | 사용자가 설정에서 전환(**DeepSeek V4 Pro** ↔ **GLM-5.2**). 기본 `deepseek-ai/deepseek-v4-pro` (GLM이 NVIDIA에서 DEGRADED라 기본 전환) |
| Base URL | `https://integrate.api.nvidia.com/v1` (코드 기본값) |
| 사용 env | `LLM_API_KEY`(필수) / `LLM_BASE_URL`(선택) / `LLM_MODEL`(선택, 서버 기본 모델) |
| 모델 스위처 | 설정(계정 드로어 > 설정) "코칭 모델". 웹 `settingsStore.coachingModel` → coach-run `body.model`. 서버 allowlist 검증(`ALLOWED_LLM_MODELS`), 그 외 env/기본값 폴백 |
| 모델 레지스트리 | 웹 `src/shared/lib/coaching/coachModels.ts` ↔ coach-run `ALLOWED_LLM_MODELS` (미러 유지) |
| 리포트별 모델 | `coach_reports.model` 컬럼에 생성 모델 저장, 피드백 밑 "✨ &lt;모델&gt; 제공" 캡션 |

새 모델 추가/교체 시: 웹 `coachModels.ts`(COACH_MODELS)와 coach-run `ALLOWED_LLM_MODELS`를 **함께** 갱신하고, 실호출로 json_schema strict·한국어·스트리밍·report-first 키순서를 검증한다(§7 체크리스트).

⚠️ **개발 기간 한정.** NVIDIA API Trial ToS는 프로덕션(실사용자 서비스) 사용을 금지한다(평가·개발·리서치만 허용).
**출시 전 반드시 유료 프로바이더로 복귀**해야 한다. 무료 티어 제약: 계정당 약 40 RPM, temperature/top_p 상한 1, 1회 출력 상한 32,768 토큰.

## 키·모델 정보가 있는 곳

### NVIDIA (현재 사용 중)
- **실사용 키**: Supabase Edge Function secrets의 `LLM_API_KEY` (Supabase 대시보드 → Edge Functions → Secrets. 값은 재조회 불가, 이름만 확인 가능)
- **키 원본**: 프로젝트 루트 `.env`의 `NVIDIA_API_KEY` (gitignore, 이 로컬 머신에만 존재)
- **재발급**: https://build.nvidia.com (무료 가입, `nvapi-` 프리픽스 키)
- **모델/Base URL**: secret `LLM_MODEL`/`LLM_BASE_URL` 미설정 상태 → 코드 기본값 사용 (`coach-run/index.ts`의 env 로딩 블록)

### OpenAI (직전 프로바이더, 롤백 대상)
- **키**: Supabase Edge Function secrets의 `OPENAI_API_KEY` — **현재 코드는 안 읽지만 롤백 참조용으로 의도적으로 남겨둠.** 값은 재조회 불가.
- **모델**: secret `OPENAI_MODEL` = `gpt-5.4-mini` (마찬가지로 잔존)
- **키 원본**: 로컬에 보관 안 함. 값이 필요하면 https://platform.openai.com → API keys에서 재발급.

## 복귀(롤백) 절차 — 코드 변경 불필요

1. secret 교체 (repo 루트에서, 사용자 직접 실행 — 에이전트는 secret 쓰기 차단됨):
   ```bash
   supabase secrets set \
     LLM_API_KEY=<OpenAI API 키> \
     LLM_BASE_URL=https://api.openai.com/v1 \
     LLM_MODEL=gpt-5.4-mini
   ```
   `supabase secrets set`은 함수 재시작을 유발하므로 **재배포 불필요** (반영까지 수 분 걸릴 수 있음).
2. 라이브 코칭 1회 스모크 (앱에서 실제 코칭 요청 → 스트리밍 응답·한국어 확인). 정적 검사로는 런타임 토큰 문제를 못 잡는다.
3. 완전 정리 시(선택): 코드 기본값(`LLM_BASE_URL`/`LLM_MODEL`)을 새 프로바이더로 바꾸는 커밋 + 이 문서 갱신.

다른 OpenAI 호환 프로바이더로 가는 경우도 동일하게 secret 3종만 바꾸면 된다.
단, 요청 본문에 프로바이더 전용 파라미터를 추가하지 말 것(호환성이 곧 롤백 안전판).

## 전제 조건 (프로바이더가 반드시 지원해야 하는 것)

- Chat Completions `messages` + `response_format: json_schema (strict)` — coach-run은 응답 구조를 스키마로 강제한다
- SSE 스트리밍 (`stream: true`, `data:`/`[DONE]`, `choices[0].delta.content`)
- 스키마 property 순서 보존(스트리밍 UI가 `report` 키를 먼저 받아야 함) — 전환 시 실호출로 확인할 것
- 한국어 출력 품질 — 지침에 한국어 강제 라인이 있으나 전환 시 실호출로 혼입 여부 확인

## 관련

- 코드: `supabase/functions/coach-run/index.ts` (env 로딩·`callCoachLlm`·`callCoachLlmStream`)
- 배포 secret 목록: `.harness/project/github-pages-supabase-playbook.md`
- 에이전트 메모리: `nvidia-free-api-dev-only` (출시 화제 시 복귀 상기 규칙)
- 미해결: `.env.example` 5~6행이 옛 `OPENAI_*` 안내로 남아 있음(에이전트 편집 권한 제한) → 수동 갱신 필요
