# GitHub Pages + Supabase 운영 플레이북

이 문서는 RunContext에서 검증한 GitHub Pages 정적 프론트, Supabase Auth/DB/Edge Function, iOS WebView 하이브리드 구조를 이후 개인 프로젝트에서 재사용하기 위한 기준이다.

## 기본 구조
- 프론트엔드는 GitHub Pages에서 정적 파일로 배포한다.
- 데이터 저장, 인증, 서버 비밀키 사용, OpenAI 호출은 Supabase에 둔다.
- 브라우저에는 Supabase publishable key만 노출한다.
- OpenAI API Key, Supabase service role key, secret key는 브라우저와 GitHub Pages 빌드 산출물에 넣지 않는다.
- iOS 하이브리드 앱은 GitHub Pages URL을 `WKWebView`로 열고, 필요한 네이티브 기능만 JavaScript bridge로 제공한다.
- 일반 공개 브라우저는 네이티브 bridge가 없으면 기능 화면이 아니라 접근 안내 화면으로 보낸다.
- localhost는 개발 편의를 위해 기능 화면 접근을 허용한다.

## 에이전트가 할 수 있는 일
- Vue/Vite 앱 코드, 라우터 가드, Supabase client, repository 계층, Pinia store를 구현한다.
- GitHub Pages workflow를 작성하고 배포 산출물이 `/RunningCoach/` 같은 repository path에서 동작하도록 Vite `base`를 설정한다.
- Supabase migration SQL, RLS 정책, Edge Function 코드를 작성한다.
- Supabase CLI가 로그인/연결되어 있으면 migration push와 Edge Function deploy를 실행한다.
- `.env.example`, README, 하네스 문서에 필요한 변수와 운영 절차를 기록한다.
- 공개되어도 되는 값과 비밀값을 구분하고, `.gitignore`와 staged file 검사를 통해 `.env`, `dist`, `node_modules`, Supabase `.temp`가 커밋되지 않게 점검한다.
- Magic link, OTP, OAuth, deep link 같은 인증 흐름의 장단점을 설명하고 앱 구조에 맞는 구현을 선택한다.
- GitHub Actions, local build, harness check, 기본 배포 검증을 수행한다.

## 에이전트가 할 수 없는 일
- 사용자의 GitHub/Supabase/OpenAI 계정에 임의로 로그인하거나 결제/보안 설정을 대신 완료할 수 없다.
- GitHub repository variables/secrets 값을 알 수 없으면 직접 설정할 수 없다.
- Supabase dashboard의 일부 UI 설정, 이메일 rate limit 정책, Auth provider 설정은 사용자가 직접 확인해야 한다.
- OpenAI API Key, Supabase secret key, service role key 같은 민감정보를 사용자 대신 보관하거나 대화에 노출해서는 안 된다.
- iPhone 신뢰 설정, Apple Developer 계정 권한, Xcode signing/provisioning, HealthKit 권한 허용은 사용자가 로컬 장비에서 직접 처리해야 한다.
- 메일 magic link나 OTP 코드를 대화에 붙여넣게 해서는 안 된다. 토큰이 포함된 URL이 노출되면 세션 폐기 또는 사용자 재생성이 필요할 수 있다.

## 사용자가 직접 해야 하는 GitHub 설정
- GitHub Pages 최초 설정:
  - 대상 repository로 이동한다.
  - `Settings`를 연다.
  - 왼쪽 메뉴에서 `Pages`를 연다.
  - `Build and deployment` 섹션에서 `Source`를 `GitHub Actions`로 변경한다.
  - 저장 버튼이 있으면 저장한다.
- Repository Settings > Secrets and variables > Actions > Variables에 프론트 공개 변수를 등록한다.
- RunContext 기준 필수 변수:
  - `VITE_SUPABASE_URL`: Supabase Project URL
  - `VITE_SUPABASE_ANON_KEY`: Supabase publishable key
- 사용하지 않는 변수는 workflow에서 제거한다. OTP 방식에서는 `VITE_AUTH_REDIRECT_URL`이 필요 없다.
- GitHub Actions 최신 배포가 성공했는지 확인한다.
- 배포 URL 예:
  - `https://lena0611.github.io/RunningCoach/`

## 사용자가 직접 해야 하는 Supabase 설정
- Project Settings > API keys에서 publishable key와 Project URL을 확인한다.
- `VITE_SUPABASE_ANON_KEY`에는 publishable key만 넣는다. secret key 또는 service role key를 넣지 않는다.
- Edge Function secret에는 서버에서만 필요한 값을 넣는다.
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
- Authentication > Sign In / Providers에서 Email provider가 enabled인지 확인한다.
- Magic link/OAuth를 쓰는 경우 Authentication > URL Configuration에서 Site URL과 Redirect URL을 설정한다.
- OTP 코드 입력 방식은 redirect URL을 핵심 경로로 쓰지 않지만, 나중에 magic link/OAuth로 전환할 수 있으니 GitHub Pages와 localhost URL을 정상 값으로 유지한다.
- Supabase 기본 이메일 발송 제한은 개발 중에 금방 걸릴 수 있다. 기본 SMTP에서 rate limit을 수정할 수 없다면 기다리거나 custom SMTP를 연결한다.
- RLS 정책은 `user_id = auth.uid()` 기준으로 본인 데이터만 읽고 쓰게 둔다.

## 민감정보 처리 원칙
- 절대 커밋하지 않는다:
  - `.env`
  - Supabase secret key
  - Supabase service role key
  - OpenAI API Key
  - access token, refresh token이 들어간 magic link URL
- 커밋 전 확인:
  - `git status --short --ignored`
  - `git diff --cached --name-only`
  - staged file에 `.env`, `dist`, `node_modules`, `supabase/.temp`가 없는지 확인
- 사용자가 토큰이 포함된 URL을 공유한 경우:
  - 해당 링크는 더 이상 공유하지 않게 안내한다.
  - Supabase 세션 revoke, 사용자 삭제/재생성, 비밀번호/토큰 재발급 중 가능한 조치를 권한다.

## 인증 방식 선택 기준
- Magic link:
  - 장점: 사용자가 링크만 누르면 된다.
  - 단점: iOS WebView 앱에서는 메일 링크가 Safari로 열려 WebView 세션에 반영되지 않을 수 있다.
  - iOS 앱으로 복귀시키려면 URL scheme, Universal Link, native token handoff가 필요하다.
- Email OTP:
  - 장점: 앱 WebView 안에서 6자리 코드 입력으로 세션을 만들 수 있어 redirect 문제가 적다.
  - 단점: 이메일 발송 제한은 magic link와 동일하게 적용된다.
  - RunContext MVP의 기본값이다.
- OAuth:
  - 장점: 익숙한 로그인 UX.
  - 단점: redirect/deep link 설계가 필요하고 iOS WebView에서 세션 연결을 별도로 검증해야 한다.

## iOS WebView 하이브리드 기준
- WebView는 GitHub Pages URL을 연다.
- 프론트는 `window.webkit.messageHandlers.runContextHealthKit` 같은 bridge 존재 여부로 네이티브 앱 안인지 판단한다.
- bridge가 없고 localhost도 아니면 `/access`로 보낸다.
- `/auth` 직접 접근도 bridge가 없으면 `/access`로 보내야 한다.
- HealthKit, 파일 import 같은 네이티브/로컬 기능은 사용자 확인 후 저장한다.

## 장애 대응 체크리스트
- GitHub Pages에서 일반 브라우저가 `/access`로 가는가?
- iOS WebView에서 `/auth` 또는 기능 화면에 접근 가능한가?
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`가 GitHub repository variables에 있는가?
- GitHub Actions 최신 deploy가 성공했는가?
- Supabase Email provider가 enabled인가?
- 이메일 발송 제한에 걸리지 않았는가?
- magic link URL이 localhost나 잘못된 URL로 생성되면 Site URL/Redirect URL 또는 앱의 redirect 설정을 점검한다.
- OTP 방식에서는 메일의 6자리 코드만 앱에 입력하고, 링크는 누르지 않는다.
