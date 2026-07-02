# CLAUDE — RunningCoach 네이티브(iOS/watchOS)

이 파일은 네이티브 작업 진입점입니다.
**이 네이티브는 웹(PaceLAB)과 같은 모노레포의 일부입니다(#250).** 웹 하네스 기준(`.harness/`)을 따릅니다.

## repo 정체 (중요 — 과거 별도-repo 아님)
- **단일 `.git` / 단일 origin.** repo 루트 = `run-ai`(웹). 네이티브는 그 하위 `native/`.
- 과거 별도 네이티브 repo(`RunningCoach-Native-Swift`, `practice/RunningCoach/RunningCoach/` 2중첩, catch-all `.git`)는 **archive됨.** 그 시절 기준(별도 remote·PR #1/#2·catch-all 비활성화)은 더 이상 유효하지 않다.
- git 명령은 run-ai 워크트리(또는 그 워크트리) 기준. iOS/watchOS 작업도 같은 워크트리의 `native/` 하위에서 한다.
- 상세: 웹 `CLAUDE.md`의 "모노레포 구조 (#250)" 섹션, 메모리 `native-repo-git-management`.

## 커밋 / 원자성
- 웹+네이티브 변경을 **하나의 commit/PR로 원자적**으로 한다. 특히 `runContext*` 브리지 계약은 웹 `src/features/*/*Bridge.ts`(및 store)와 네이티브 `RunContextWebView.swift`를 **동시 변경**한다.
- 코드가 끝나면 (기기 검증 전이라도) **즉시 커밋해 유실을 막는다.** 단 앱이 빌드되는 coherent 상태로만 — 예: 새 타겟/패키지 링크 같은 Xcode(pbxproj) 변경이 필요한 작업은, 그 링크가 반영돼 빌드가 green인 상태로 함께 커밋한다(반쪽 커밋 금지).
- `main` 직접 커밋/푸시 지양 — feature branch + PR. run-ai 하네스의 commit/push hook 검증을 신뢰한다.

## iOS/watchOS 완료 흐름 (웹과 다름)
- 웹은 main 머지 → GitHub Pages 자동배포가 "완료" 체크포인트를 만든다. **네이티브는 자동배포가 없다** — Xcode 재빌드 + 기기 설치(사용자만 가능)가 검증 수단이다. watchOS는 **실기기(Apple Watch)** 가 필요하다.
- 네이티브 빌드는 `npm run harness:check` 대상이 아니다(수동). 단 **순수 로직 Swift 패키지는 CLI 검증 가능**하다 — 예: `cd native/RaceCore && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test` (⚠️ `/usr/bin/swift` 커맨드라인툴은 XCTest가 없어 실패한다).
- "기기 검증 대기"를 이유로 커밋을 무기한 보류하지 않는다.

## 공유 코드 (RaceCore)
- `native/RaceCore/` 스위프트 패키지 = 웹 순수 로직 `src/shared/lib/selfRace/ghost.ts`의 네이티브 포팅(`GhostRaceEngine`). **iOS 앱과 watchOS 앱이 함께 링크**한다.
- ghost.ts는 이제 **3-소비자 계약**(web · iOS · watch). ghost.ts를 바꾸면 `RaceCore/Sources/RaceCore/GhostRaceEngine.swift` + `RaceCoreTests`를 함께 갱신하고, 웹 `.harness/project/data-change-impact-map.md`의 self-race 항목에도 워치 소비자를 반영한다.

## 웹과의 계약
- 웹 프론트는 같은 repo `run-ai`(`src/`). 자체 `.harness`/git hook을 보유한다.
- HealthKit/세션상세/스플릿/케이던스/route/자동동기화·레이싱 관련 네이티브 변경은 웹 데이터 계약과 **양방향**으로 맞춘다.
- WebView 브리지 식별자(`window.RunContextHealthKit`, `window.RunContextLiveRun`, `window.RunContextAuth` 등)는 웹·네이티브 양쪽을 함께 수정한다. (워치 앱은 이 WebView 브리지 밖 — 네이티브 SwiftUI + WCSession으로 폰과 통신한다.)

## git 위생
- `.gitignore`로 Xcode 산출물(`DerivedData/`, `build/`, `*.xcuserstate`, `xcuserdata/`), SwiftPM `.build/`, 생성된 웹 번들(`RunningCoach/WebApp/`)을 제외한다. 추적된 산출물이 없도록 유지한다.
