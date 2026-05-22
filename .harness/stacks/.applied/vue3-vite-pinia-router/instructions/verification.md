# Verification

## 기본 명령

적용 프로젝트는 최소 다음 명령을 가져야 합니다.

```bash
npm run dev
npm run build
npm run harness:check
```

프로젝트에 lint, test, typecheck가 있으면 `harness:check`가 함께 실행되도록 유지합니다.

## 변경별 확인 기준

| 변경 | 확인 |
| --- | --- |
| `vite.config.*` | dev server, proxy, base path, alias, build option 확인 |
| `src/router/**` | 인증/권한/외부 진입 guard 순서 확인 |
| `componentRegistry` | menuCode와 Vue 파일 연결 확인 |
| `src/store/**` | load/save/remove, localStorage key, 서버 응답 갱신 위치 확인 |
| `src/apis/**`, `src/plugins/**` | API namespace 등록과 error handling 확인 |
| `src/assets/scss/**` | import 순서와 공용 class 중복 확인 |
| 새 page | 공용 컴포넌트, query 복원, 권한, i18n, build 확인 |

## 자동화 원칙

- 수동 개발자에게 git hook은 선택형일 수 있습니다.
- AI 에이전트 작업은 hook 설치 여부와 무관하게 `harness:check`를 완료 기준으로 봅니다.
- 스택 기준이 바뀌면 `.harness/project/stack-preset-rules.md`와 실제 코드 구조를 함께 확인합니다.
- scaffold 템플릿을 별도로 적용한 경우에는 해당 템플릿의 검증 명령도 함께 실행합니다.
