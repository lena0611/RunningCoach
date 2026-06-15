# 하네스 본체 개선요청서 — `harness:update`가 소비자 `CLAUDE.md` 내용을 무단 삭제

- 대상 본체: `harness-seed` (https://git.smartscore.kr/ai-standard/harnesses/harness-seed.git)
- 발견 버전: 0.2.56 → **0.2.64** 업데이트 시 (소비자: RunningCoach/PaceLAB, 2026-06-15)
- 심각도: **High (소비자 데이터 무단·무경고 손실)**
- 작성: 소비자 프로젝트 측 (PaceLAB)

---

## 1. 증상 (재현)

`npm run harness:update -- --base-only` (0.2.56→0.2.64) 실행 후, 소비자가 직접 작성한 `CLAUDE.md`의 **프로젝트 소유 내용이 통째로 사라짐**:

- `## 모노레포 구조 (#250)` 섹션 전체 (웹+네이티브 모노레포, 브리지 원자적 커밋, 네이티브 수동검증 — 프로젝트 핵심 아키텍처 지침)
- reading-list의 `ui-guidelines.md` / `ui-system-contract.md` 2줄 (UI 작업 전 필수 선행)

`git diff CLAUDE.md`는 **삭제만(insertions 0, deletions 9)** 보였고, 경고/백업 안내/머지 시도 없이 조용히 덮였다. 커밋 전 수동 발견·복원하지 못했다면 영구 손실.

## 2. 영향

`CLAUDE.md`는 **모든 에이전트의 1순위 진입점**이자 소비자가 프로젝트 고유 지침(아키텍처 경계, 읽기 순서, 워크플로우 예외)을 두는 곳이다. 이를 매 base 업데이트마다 무경고로 덮으면:
- 소비자별 운영 규칙이 업데이트마다 사라진다(업데이트를 두렵게 만듦 = 업데이트 채택 저해).
- 손실이 **조용해서** 리뷰에서 놓치기 쉽다(diff가 크면 묻힘).

## 3. 근본 원인 (코드 근거)

1. `CLAUDE.md`가 **전체 파일 단위 managed**로 등록됨
   - `.harness/install-manifest.json` → `managedFiles["CLAUDE.md"].sha256` (단일 해시 = 파일 전체를 본체가 소유)
2. 업데이트 본체(`update-harness.mjs`)는 `npx -y <git-spec> init …`로 본체 `init`에 위임하고, `init`이 managed 파일을 정본으로 **덮어쓴다**. 소비자 영역을 보존하는 머지 단계가 없다.
   - `.harness/bin/update-harness.mjs:296` (`args: ['-y', packageSpec, 'init', …]`)
3. `--force`/`--confirm-overwrite-project-files` 가드는 **project-owned 파일만** 보호한다(`update-harness.mjs:117-134`). `CLAUDE.md`는 project-owned가 아니라 managed/harness로 분류되어 **가드를 우회**한다.
   - `.harness/bin/policy-harness.mjs:568-575` `isHarnessScriptFile` → `CLAUDE.md`, `AGENTS.md`를 harness 파일로 분류.
4. **모순**: 시스템은 소비자가 `CLAUDE.md`를 수정할 수 있음을 이미 안다. `isUnmodifiedManagedHarnessFile`(`policy-harness.mjs:482-494`)은 sha 불일치(=로컬 수정)를 감지해 guard에서 관용한다. 그런데 **update는 그 로컬 수정을 머지/백업/경고 없이 폐기**한다. guard는 "수정 OK", update는 "수정 폐기" — 불일치.
5. **선례 불일치**: 0.2.59에서 `.claude/settings.json`은 같은 손실 위험 때문에 **project-owned로 재분류 + 멱등·비파괴 머지**로 고쳤다(누락 표면만 추가, 기존 값 보존). 동일한 버그 클래스인 `CLAUDE.md`/`AGENTS.md`에는 그 수정이 적용되지 않았다.

## 4. 개선 제안 (택1 또는 조합)

### A. 마커 기반 managed 영역 (권장)
`apply-stack.mjs`가 이미 쓰는 패턴을 `CLAUDE.md`에 적용:
- `.harness/bin/apply-stack.mjs:24-27` `<!-- harness-stack-rules:start/end -->`, `<!-- harness-template-contract:start/end -->`
- `CLAUDE.md`에 `<!-- harness-managed:start/end -->` 영역을 두고, **그 안만 본체가 갱신**, 밖은 소비자 소유로 보존.
- `managedFiles["CLAUDE.md"]`의 전체-파일 sha256을 **영역 해시 또는 마커 머지**로 대체.

### B. project-owned 재분류 + 비파괴 머지 (0.2.59 선례 그대로)
- `CLAUDE.md`/`AGENTS.md`를 project-owned로 재분류하고, 업데이트는 **누락된 본체 섹션만 추가**(멱등), 소비자 섹션은 보존. settings.json 머지 로직 재사용.

### C. 최소 안전망 (A/B 전까지 즉시)
- managed 파일이 기록된 sha256과 **다르면(=로컬 수정됨) 무조건 덮어쓰지 않는다**: 중단+경고, 또는 소비자본을 `.bak`로 백업하고 덮은 뒤 후처리 리포트에 명시. managed 파일 덮어쓰기에도 `--confirm-overwrite-project-files`를 요구.
- 업데이트 후처리 요약에 **"로컬 수정 상태에서 덮어쓴 managed 파일 목록"**을 항상 출력(조용한 손실 방지).

## 5. 권장 우선순위

1. **C (안전망)** — 즉시. 어떤 경우에도 *조용한* 손실을 없앤다.
2. **A 또는 B** — 근본 해결. `CLAUDE.md`는 본질적으로 하이브리드(본체 보일러플레이트 + 소비자 지침)이므로 마커 영역(A)이 가장 정확. settings.json 선례를 따르면 B도 일관적.

## 6. 회귀 테스트 제안
- init smoke test에 "소비자가 `CLAUDE.md`에 커스텀 섹션 추가 → base 업데이트 → 커스텀 섹션 보존 + 본체 영역만 갱신 + 멱등" 케이스 추가(현재 settings.json 머지 테스트와 동형).

## 7. 소비자 측 임시 조치 (이미 적용)
- 업데이트 후 `git diff CLAUDE.md`로 프로젝트 섹션 보존 확인 → 삭제됐으면 복원(이번에 모노레포/UI reading 복원, 순변경 0 확인).
- `decision-log.md` 2026-06-15 항목에 재발 방지 메모 기록.
