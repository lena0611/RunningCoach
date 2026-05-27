# vue3-vite-pinia-router

Vue 3 + Vite + Pinia + Vue Router 기반 관리자형 프론트엔드 프로젝트를 위한 기술스택 하네스입니다.

이 저장소는 프로젝트 scaffold 템플릿이 아닙니다. 회사 공통 개발 기준 위에 얹는 스택별 개발 기준입니다.
실제 프로젝트 개발자는 이 스택 하네스의 `init`만 실행하면 됩니다. `init`이 내부적으로 공통 하네스를 설치하거나 업데이트한 뒤 Vue3 스택 기준을 프로젝트 로컬룰로 정착시킵니다.

## 목적

- Vue3 관리자형 프론트엔드에서 반복되는 구조와 작업 순서를 하나의 기준으로 통일합니다.
- Vite 환경, Pinia 스토어, Vue Router 가드, API 플러그인, i18n, SCSS 디자인 시스템, 검증 명령을 같은 맥락으로 묶습니다.
- 특정 프로젝트의 도메인 규칙, 업무 용어, 화면별 정책은 포함하지 않습니다. 그런 내용은 적용 프로젝트의 `.harness/project/local-methodology.md`와 도메인 문서에 둡니다.

## Node 기준

- 하네스 실행 최소 버전은 Node `20.19.0`입니다. 스택 하네스 스크립트는 이 버전에서 동작하도록 유지합니다.
- `package.json`에는 `>=20.19.0`로 기록합니다.
- 스택 하네스 본체 개발 레포에는 개발용 `.nvmrc`를 두며, npm/버전/lockfile 작업 전 `nvm use`를 먼저 실행합니다.
- 스택 하네스 패키지는 소비자 프로젝트에 `.nvmrc`를 주입하지 않습니다.
- 기존 프로젝트의 `.nvmrc`는 프로젝트/Jenkins 빌드 계약으로 보고 자동 덮어쓰기하지 않습니다.
- Node 20은 2026-04-30에 EOL이므로 신규 프로젝트는 Jenkins 검증이 준비되는 대로 Node 22/24 전환을 검토합니다.

## 적용 방법

적용 대상 프로젝트 폴더에서 아래 명령을 실행합니다.

### 기본 적용

```bash
cd <적용할-프로젝트>
nvm use
npx -y git+https://git.smartscore.kr/ai-standard/harnesses/vue3-vite-pinia-router.git#v0.1.26 init
```

`init`은 다음을 순서대로 수행합니다.

1. `manifest.json`의 `baseHarness`에 명시된 공통 하네스를 설치하거나 업데이트합니다.
2. 이 저장소의 Vue3/Vite/Pinia/Router 기준을 `.harness/project/stack-preset-rules.md`에 로컬룰로 정착시킵니다.
3. 스택 기준 스냅샷을 `.harness/stacks/.applied/vue3-vite-pinia-router/`에 남깁니다.
4. `.harness/harness-lock.json`에 설치된 공통 하네스와 이 스택 하네스의 repo, ref, version을 기록합니다.
5. 현재 프로젝트 스캔 리포트를 `.harness/session/project-scan-report.md`에 생성합니다.
6. 설치/업데이트 인수인계 요약을 `.harness/session/handoff.md`에 생성합니다.
7. 설치 직후 자동 검사는 `npm run harness:check -- --brief`로 실행해 성공/실패와 핵심 영향만 확인합니다.

이 저장소는 scaffold 템플릿이 아니므로 업무 파일을 복사하지 않습니다.

새 프로젝트의 기본 코드 묶음이 필요하면 스택 하네스 설치 후 별도 scaffold 템플릿을 선택합니다.

```bash
npm run templates:list
npm run template:apply -- --preset-git https://git.smartscore.kr/ai-standard/stacks/cloud-front-admin-template.git --ref v0.1.1
```

템플릿을 적용하면 `.harness/project/template-contract.md`에 템플릿 사용 계약 브리지가 생성되고, 프로젝트별 예외나 추가 기준은 적용 프로젝트의 `.harness/project/*` 문서에 남깁니다.

### 옵션

```bash
npx -y git+https://git.smartscore.kr/ai-standard/harnesses/vue3-vite-pinia-router.git#v0.1.26 init --no-scan
npx -y git+https://git.smartscore.kr/ai-standard/harnesses/vue3-vite-pinia-router.git#v0.1.26 init --no-handoff
npx -y git+https://git.smartscore.kr/ai-standard/harnesses/vue3-vite-pinia-router.git#v0.1.26 init --no-check
npx -y git+https://git.smartscore.kr/ai-standard/harnesses/vue3-vite-pinia-router.git#v0.1.26 init --force-stack
npx -y git+https://git.smartscore.kr/ai-standard/harnesses/vue3-vite-pinia-router.git#v0.1.26 init --force --confirm-overwrite-project-files
npx -y git+https://git.smartscore.kr/ai-standard/harnesses/vue3-vite-pinia-router.git#v0.1.26 init --allow-mismatch
```

- `--no-scan`: 설치 후 스캔 리포트 자동 생성을 끕니다.
- `--no-handoff`: 설치/업데이트 인수인계 요약 자동 생성을 끕니다.
- `--no-check`: 설치 후 통합 검사를 자동 실행하지 않습니다.
- `--force-stack`: 다른 스택 기준이 이미 적용되어 있으면 reset 후 이 스택 기준으로 전환합니다.
- `--force --confirm-overwrite-project-files`: 공통 하네스의 프로젝트 소유 문서까지 덮어쓰는 위험을 명시적으로 인지하고 진행합니다.
- `--allow-mismatch`: 감지된 기존 스택과 맞지 않아도 마이그레이션 목적으로 명시 적용합니다.

같은 스택 기준이 이미 적용되어 있으면 `init`은 기존 스택 적용분을 reset한 뒤 다시 적용해 업데이트합니다.

스택 하네스를 새 버전으로 올릴 때는 적용 프로젝트에서 `npm run harness:outdated`로 업데이트 후보를 확인하고, 반영하려면 `npm run harness:update`를 실행합니다. 기본 전략은 현재 설치된 버전의 SemVer caret 범위 안에서 최신 태그를 다시 선택하는 방식입니다. 예를 들어 `1.0.0`이 설치되어 있으면 `^1.0.0` 범위의 최신 패치/마이너를 받습니다. 이때 공통 하네스도 `manifest.json`의 `baseHarness` 요구사항에 맞춰 함께 업데이트되고, 실제 적용된 버전은 `.harness/harness-lock.json`과 `npm run stack:status`에서 확인합니다.

```bash
npm run harness:outdated
npm run harness:update
npm run harness:outdated -- --json
npm run harness:update -- --dry-run
```

### 호환성 불일치

이미 다른 기술스택이 있는 프로젝트에 이 스택 하네스를 실행하면, 설치 전에 `package.json`과 기존 하네스 적용 상태를 먼저 검사합니다. Vue2, Vue Router 3, Vuex, Vue CLI, React, Angular 같은 불일치 단서가 감지되면 공통 하네스 설치를 시작하기 전에 중단합니다.

중단 시 프로젝트 파일은 변경하지 않습니다. GitLab의 `ai-standard/harnesses` 목록을 조회할 수 있고 현재 프로젝트와 맞는 스택 하네스가 있으면 추천 명령을 보여줍니다. 터미널이 대화형이면 추천 스택 하네스로 계속 진행할지 묻습니다.

마이그레이션 목적이라면 `--allow-mismatch`를 붙여 의도를 명시하고, 예외 사유를 프로젝트 기준 문서에 남깁니다.

### 적용 결과 확인

```bash
npm run harness:check
npm run harness:check -- --brief
```

`npm run harness:check`는 적용 대상 프로젝트에서 실행하는 통합 검사입니다. 공통 하네스의 기준 동기화, 문서 링크, 스택 기준 적용 상태를 확인하고, 적용 대상 프로젝트에 `lint`, `test`, `build` 같은 검증 script가 있으면 함께 실행합니다. 즉, 이 명령은 이 저장소가 아니라 실제 업무 프로젝트가 현재 기준을 지킬 수 있는 상태인지 확인합니다.

`--brief`는 설치 직후처럼 긴 파일 목록보다 성공/실패와 요약이 중요한 상황에서 사용합니다. 상세 파일 목록과 기준별 영향은 일반 `npm run harness:check` 또는 `npm run harness:check -- --verbose`로 다시 확인할 수 있습니다.

적용 후 확인할 파일:

- `.harness/project/stack-preset-rules.md`
- `.harness/policy/profile.json`
- `.harness/harness-lock.json`
- `.harness/stacks/.applied/vue3-vite-pinia-router/manifest.json`

## 구성

| 파일 | 역할 |
| --- | --- |
| `manifest.json` | `harness-seed`가 읽는 스택 기준 manifest |
| `policies.json` | 스택 기준과 프로젝트 코드 영역의 매핑 |
| `scripts/init.mjs` | 공통 하네스 설치와 Vue3 스택 기준 적용을 한 번에 수행하는 사용자 진입점 |
| `instructions/overview.md` | 기준 적용 범위와 제외 범위 |
| `instructions/project-structure.md` | 디렉터리와 파일 배치 기준 |
| `instructions/runtime-env.md` | Node/Vite/env/PWA 기준 |
| `instructions/routing.md` | Vue Router와 서버 주도 메뉴 기준 |
| `instructions/state-management.md` | Pinia 스토어 기준 |
| `instructions/api-i18n.md` | API 플러그인과 i18n 기준 |
| `instructions/ui-style.md` | SCSS, 컴포넌트, 화면 스타일 기준 |
| `instructions/page-development.md` | 새 페이지 추가 흐름 |
| `instructions/verification.md` | 검증 명령과 점검 기준 |

## 로컬 검증

이 저장소 자체를 수정하는 관리자는 아래 명령으로 스택 기준 패키지가 깨지지 않았는지 확인합니다.

```bash
npm run check
npm run test:init
```

`npm run check`는 이 저장소의 `manifest.json`, `policies.json`, `instructions/*.md` 연결성을 확인합니다. 적용 대상 프로젝트의 코드 품질을 검사하는 명령이 아니라, 이 기술스택 하네스 패키지가 `harness-seed`에서 읽을 수 있는 구조인지 확인하는 저장소 자체 검증입니다.

`npm run test:init`은 임시 프로젝트에 이 스택 하네스를 적용해 공통 하네스 설치, 스택 기준 적용, 업데이트 재실행 흐름을 확인합니다. 기본적으로 형제 폴더의 `../harness-seed`를 사용하며, 다른 위치를 쓰려면 `HARNESS_SEED_PATH=/path/to/harness-seed npm run test:init`으로 실행합니다.

## 명령 구분

| 명령 | 실행 위치 | 확인하는 것 |
| --- | --- | --- |
| `npm run check` | 이 저장소 | manifest, policy, instruction 파일 연결성 |
| `npm run test:init` | 이 저장소 | 임시 프로젝트에 공통 하네스 + Vue3 스택 기준이 함께 설치되는지 |
| `npm run harness:check` | 스택 기준을 적용한 업무 프로젝트 | 공통 하네스 검사, 스택 기준 적용 상태, 프로젝트의 lint/test/build |
