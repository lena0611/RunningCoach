# 웹 변경 검증 루프 (사람 시각 검증 + 마이그레이션 배포)

unit 테스트와 `npm run harness:check`(lint/test/build)가 통과해도 다음은 **정적 검사로 못 잡는다** — 그리고 실제로 새어나갔다(#388):
- **UI 실패**: 텍스트 오버플로우, 레이아웃 깨짐, 데이터 흐름 불일치(예: "다음 훈련"이 옛 weeklyPattern·새 스케줄 불일치).
- **마이그레이션 미배포**: 스케줄 기능이 `training_schedule` 테이블 미배포로 **라이브에서 통째로 죽음**(파일만 만들고 `db push` 안 함). 모든 런이 "추가"로 오판.

## 업무 규칙 (웹 변경 시 필수)

1. **UI/화면 변경 = 시각 검증.** 자동 E2E(Playwright 반복 빌드 루프)는 **쓰지 않는다**(vite/esbuild + chromium이 보안 에이전트 스캔·Spotlight와 함께 맥 CPU 폭주). 검증은 **chrome-devtools MCP로 localhost 자가 검증**을 1차로 한다(2026-06-18 도입):
   - **에이전트 자가 검증(웹 UI/레이아웃/데이터흐름/콘솔)**: `mcp__chrome-devtools__navigate_page`로 `http://localhost:5173/` 열고(사용자가 dev 서버+로그인 유지), `take_snapshot`/`take_screenshot`/`list_console_messages`로 렌더·잘림·카피·콘솔을 직접 확인. 모바일 잘림은 `resize_page(390x844)`로 본다. **이건 사용자 스크린샷 요청 없이 자율로 한다.**
     - 주의: **localhost = 작업트리(HMR), 프로덕션 아님.** 그래서 배포는 별도로 **Pages 런 success 확인**(`gh run list --workflow=pages.yml` HEAD `completed success`)까지 하고 "라이브 반영"이라 보고한다. 머지 ≠ 배포.
     - chrome-devtools MCP는 시스템 기본 node가 v12라 그냥 `npx`로는 실패 → user MCP를 `bash -c 'export PATH=<node24>/bin:$PATH; exec npx -y chrome-devtools-mcp'`로 등록(연결됨).
   - **여전히 사용자 실기기 스모크가 필요한 것(이때만 콕 집어 요청)**: ① iOS 브릿지 기능(라이브 한계 도전·HealthKit 임포트·TTS·백그라운드 — 웹은 "iOS 앱에서만" 폴백) ② 새 데이터 흐름(새 임포트 직후 포스트런 인터뷰, 새 TT 반영 등 — 데이터가 생겨야 보임) ③ localhost 세션 만료 시 재로그인.
   - CSS 안전(텍스트 `overflow-wrap`, flex `min-width:0`/grid `minmax(0,1fr)` 등)은 작성 시점에 선제 적용한다.

1-b. **순서 = 검증 후 머지(main 청결, 2026-06-18 확정).** localhost는 작업트리(현재 브랜치)를 HMR로 반영하므로, **머지 전에** 브랜치 상태에서 chrome-devtools MCP로 자가 검증한다 → 통과해야 main에 머지. 검증 실패 코드를 main에 올렸다 fix-forward 하지 않는다. 구체 흐름: 브랜치 구현 → 단위테스트·타입체크 → **localhost 자가 검증(통과 게이트)** → 커밋·PR·머지 → Pages success 확인. 단 **localhost로 못 보는 것**(iOS 브릿지·새 데이터 흐름·세션 만료, 위 ①②③)은 예외로 **머지 후 실기기 스모크**로 확인한다(localhost에 검증 수단이 없으니 머지 전 게이트 불가).

2. **요구사항은 일반화·확대 검토.** 단일 케이스(예: 목요일 하나)만 고치지 말고 전체(주 전체·모든 상태·엣지)를 스스로 일반화해 검수한다. 렌더 없이 검증 가능한 순수 로직은 **단위테스트로 대표+엣지 케이스를 덮는다**(예: 생성기 출력을 날짜별로 덤프해 검수).

3. **DB 백엔드 기능 = 마이그레이션 배포 확인.** 머지·완료 전 `supabase migration list`로 **원격 적용 여부**를 확인하고, 미적용이면 `supabase db push`. **마이그레이션 파일 생성 ≠ 배포.** 새 테이블/컬럼에 의존하는 기능은 배포 확인 전까지 "동작한다"고 보고하지 않는다.

4. **빌드 빈도 최소화(맥 부하).** `npm run harness:check`(=vite build)와 커밋/푸시(=git hook이 build 트리거)를 남발하지 않는다. 빠른 검증은 `vue-tsc`/`vitest`(무거운 esbuild 빌드 아님)로 하고, build/harness:check는 **배치로 모아 1회**. Playwright chromium 실행 금지.

5. **데이터 흐름/코칭 기능의 완료 기준** = "단위테스트 통과"가 아니라 "실데이터/실기기에서 동작 확인(사용자 시각 검증)". 단위테스트는 필요조건일 뿐 충분조건 아님.

(근거: 2026-06-17 #388 — 스케줄 기능 마이그레이션 미배포로 라이브 전멸 + 코치 카드 오버플로우. unit/harness:check 다 통과했으나 실제 앱은 깨져 있었음. 자동 E2E는 보안 에이전트/인덱서와 함께 맥 CPU 폭주를 유발해 사람 시각 검증으로 전환.)
