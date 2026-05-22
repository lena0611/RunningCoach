# 프로젝트 메모리

세션이 바뀌어도 유지되는 이 프로젝트의 안정적인 사실을 기록합니다.

> 하네스 본체 저장소의 설계 메모리가 아닙니다. 이 프로젝트의 도메인, 운영 방식, 반복되는 검증 기준만 남깁니다.

## 프로젝트 성격
- 프로젝트/서비스 이름: `RunContext`
- 소유 팀 또는 담당 주체: 개인용
- 주된 작업 유형: 개인 러닝 기록, 목표 추적, 규칙 기반 코칭
- 활성 스택: `.harness/policy/profile.json` 참고

## 반복해서 참고할 사실
- OpenAI/AI 자동 코칭은 비용과 운영 부담 때문에 기본 방향에서 제외한다.
- 기본 앱은 정적 Vue/PWA로 유지하고, 러닝 기록은 로컬 저장소에 구조화된 `RunLog`와 `TrainingMemory`로 저장한다.
- Workoutdoors export 파일은 FIT 단일 포맷을 우선한다. FIT는 공식 세션/랩 요약을 담고 있어 GPX 좌표 재계산보다 안정적이다.
- 파일 업로드 UX가 모바일에서 번거로우므로, 향후 확장으로 Strava 연동을 검토한다.
- Strava 연동은 GitHub Pages 단독 정적 앱만으로 처리하지 않는다. OAuth `client_secret`, refresh token, webhook callback 보호를 위해 Cloudflare Worker, Vercel Function 등 최소 서버리스 백엔드를 둔다.
- Strava 확장 목표는 `Workoutdoors -> Strava 업로드 -> RunContext에서 최신 러닝 가져오기 -> RunLog 저장 -> 규칙 기반 코칭` 흐름이다.

## 기록 원칙
- 한 번뿐인 구현 세부사항은 기록하지 않습니다.
- 반복되는 도메인 규칙, 아키텍처 경계, 검증 기준만 남깁니다.
- 오래된 사실을 바꿀 때는 `decision-log.md`에 변경 이유를 남깁니다.
