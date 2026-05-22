# Runtime And Environment

## Node

- 하네스 실행 최소 Node는 `20.19.0`입니다. 스택 하네스 스크립트는 이 버전에서 동작하도록 유지합니다.
- `package.json`에는 `>=20.19.0`로 기록합니다.
- 스택 하네스 패키지는 소비자 프로젝트에 `.nvmrc`를 주입하지 않습니다.
- 기존 프로젝트의 `.nvmrc`는 프로젝트/Jenkins 빌드 계약으로 보고 자동 덮어쓰기하지 않습니다.
- Node 20은 2026-04-30에 EOL이므로 신규 프로젝트는 Jenkins 검증이 준비되는 대로 Node 22/24 전환을 검토합니다.
- 프로젝트에 `.nvmrc`가 있으면 개발 서버와 빌드 전 `nvm use` 기준을 따릅니다.
- Node 버전 변경으로 native dependency가 깨질 수 있으므로, 버전이 바뀐 뒤에는 의존성 재설치를 고려합니다.

## Vite

- `vite.config.*`는 개발 서버 proxy, base path, alias, plugin, build option의 단일 진실 출처입니다.
- `@` alias는 `src`를 가리키도록 유지합니다.
- 개발 서버 proxy는 로컬 개발 전용입니다. 운영 빌드는 같은 origin 또는 배포 환경의 gateway 규칙을 따릅니다.
- 운영 base path가 있으면 `base`에 명시하고, 라우터 history와 배포 경로가 일치하는지 확인합니다.

## 환경 변수

- 개발자별 값은 `.env.local`에 두고 커밋하지 않습니다.
- 공유 가능한 예시는 `.env.local.example` 또는 `.env.example`에 둡니다.
- 클라이언트에 노출되는 값만 `VITE_` prefix를 사용합니다.
- 운영 secret은 Vite env에 넣지 않습니다.

## PWA와 서비스 워커

- PWA를 사용하는 프로젝트는 update prompt, cache glob, maximum file size를 명시합니다.
- 서비스 워커 갱신은 사용자 작업 손실을 만들 수 있으므로 즉시 강제 reload보다 확인 흐름을 둡니다.
- PWA plugin은 빌드 결과와 운영 배포 정책을 함께 검토합니다.
