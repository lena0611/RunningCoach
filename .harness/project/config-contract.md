# Configuration Contract

프로젝트 설정과 환경값을 일관되게 추가하기 위한 계약 문서입니다.

## 환경값 원칙
- 공개 가능한 값과 비밀값을 먼저 구분합니다.
- 비밀값은 `.env.example`에 넣지 않습니다.
- 새로운 환경값을 추가하면 예시 설정 파일과 이 문서를 함께 갱신합니다.
- 스택별 접두사나 설정 명명 규칙은 공통 하네스가 정하지 않고 적용된 스택 하네스 또는 프로젝트 로컬룰을 따릅니다.

## 설정 추가 절차
1. 설정이 런타임인지 빌드타임인지 구분합니다.
2. 공개 가능한 값인지 비밀값인지 구분합니다.
3. 스택별 접두사나 naming convention이 있으면 해당 스택 기준을 따릅니다.
4. 사용 위치와 기본값 전략을 문서에 남깁니다.

## 현재 계약
- 예시 설정 파일은 공개 가능한 예시값만 포함합니다.
- 실제 비밀값은 저장소에 커밋하지 않습니다.
- 설정 계약이 바뀌면 project harness와 session harness에 반영합니다.

## PaceLAB 앱 실행 보안 설정
- 프론트 빌드에 노출 가능한 값은 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`뿐이다.
- `APP_SESSION_HMAC_SECRET`, `APPLE_TEAM_ID`, `APPLE_DEVICECHECK_KEY_ID`, `APPLE_DEVICECHECK_PRIVATE_KEY`, `APPLE_DEVICECHECK_ENVIRONMENT`, `PACELAB_ALLOWED_EMAILS`, `COACH_RUN_RATE_LIMIT_PER_HOUR`, `APP_SECURITY_MODE`, `APP_SECURITY_DEVELOPMENT_TOKEN`은 Supabase Edge Function secret 전용이다.
- 위 서버 secret은 `VITE_` prefix를 붙이지 않고, GitHub Pages Actions variables 또는 프론트 `.env`에 넣지 않는다.
- PaceLAB MVP 임시 운영 모드는 `APP_SECURITY_MODE=allowlist`다. 이 모드는 Apple DeviceCheck 키 없이 로그인 사용자 allowlist, 서버 발급 앱 세션, rate limit으로 비용성 기능을 통제하지만, "iOS 앱에서 실행된 기기"를 암호학적으로 증명하지는 않는다.
- `APP_SECURITY_MODE=devicecheck`는 유료 Apple Developer 계정에서 DeviceCheck key id와 `.p8` private key를 준비한 뒤에만 사용한다.
- `APP_SECURITY_DEVELOPMENT_TOKEN`은 로컬 Edge Function 개발 전용이며 운영 secret으로 설정하지 않는다.
- `PACELAB_ALLOWED_EMAILS`는 쉼표로 구분한 소문자 이메일 allowlist로 운영한다. 값이 비어 있으면 앱 세션 발급을 거부하는 것이 기본 동작이다.
- AI 코칭처럼 비용과 민감 데이터 접근이 있는 Edge Function은 `x-pacelab-app-session` 서버 세션 검증과 rate limit을 통과해야 한다.
