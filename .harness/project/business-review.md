# PaceLAB 사업화 검토

작성일: 2026-05-29

## 현재 전제
- PaceLAB은 아직 미출시 개발 진행 단계의 개인용 러닝 앱이다.
- 현재 사용자는 개발자 본인 1명이며, iOS 하이브리드 앱, HealthKit, Workoutdoors/FIT, Supabase, OpenAI 기반 AI 코칭 흐름을 검증 중이다.
- 단기 목표는 앱스토어 출시가 아니라 개인 사용에서 코칭 품질과 반복 사용 흐름을 안정화하는 것이다.
- 장기 후보는 App Store 출시와 구독형 앱 사업화다.

## 1차 사업성 판단
- 범용 러닝 기록 앱으로 포지셔닝하면 경쟁력이 약하다. Nike Run Club, Strava, Runkeeper 같은 앱은 기록, 커뮤니티, 기본 훈련 플랜 영역에서 이미 강하다.
- PaceLAB의 가능성은 기록 앱이 아니라 `한국어 개인 러닝 코치` 포지션에 있다.
- 핵심 차별화는 HealthKit/Workoutdoors 기반 실제 운동 기록, 사용자의 목표, 부상/회복 상태, 장기 기억을 묶어 다음 훈련 판단까지 이어주는 것이다.
- 현재 단계에서는 대중 출시보다 유료 가설 검증이 우선이다.

## 권장 포지션
> 한국어 러너를 위한 HealthKit/Workoutdoors 기반 개인 러닝 코치. 기록을 예쁘게 보여주는 앱이 아니라, 다음 훈련을 정하고 부상/회복/목표 가능성을 함께 조정하는 앱.

## 차별화 축
- 한국어 자연어 코칭: 해외 앱보다 설명력과 정서적 납득성이 좋다.
- 목표 중심 판단: 예를 들어 `2026-11-21까지 10km 59:59` 같은 실제 목표를 기준으로 훈련을 평가한다.
- HealthKit/Workoutdoors 실사용 흐름: 사용자가 이미 쓰는 기록 경로를 바꾸지 않고 코칭 레이어를 얹는다.
- 부상/회복 게이트: 통증, 회복, 수면, 피로 신호를 훈련 강도 조절에 반영한다.
- 개인 장기 기억: 일회성 AI 요약이 아니라 반복 패턴, 처방 준수, 회복 반응을 축적한다.
- 실행 가능한 처방: Workoutdoors나 Apple Watch에 옮길 수 있는 훈련 지시로 연결한다.

## 수익 모델 후보
### 1. 무료 + 유료 AI 코칭 구독
- 가장 현실적인 1차 모델이다.
- 무료: HealthKit/FIT 기록 저장, 기본 대시보드, 최근 기록 보기.
- 유료: 세션별 AI 코칭, 다음 훈련 추천, 목표 가능성, 부상/회복 반영, 주간 루틴 조정, 장기 기억.
- 장점: 무료 기록 앱 기대를 충족하면서 AI 비용이 드는 기능만 유료화할 수 있다.
- 리스크: 무료 기능만으로 충분하다고 느끼면 유료 전환이 약할 수 있다.

### 2. 저가 개인 코치형 구독
- Runna보다 낮은 가격대에서 한국어와 개인 데이터 기반 코칭을 강조한다.
- 초기 실험 가격 후보: 월 4,900~9,900원, 연 49,000~99,000원.
- 가격은 OpenAI API, Supabase, Apple 수수료, 환불/무료 체험 비용을 반영해 다시 계산해야 한다.

### 3. 일회성 유료 앱
- 권장하지 않는다.
- AI API와 백엔드 비용이 반복 발생하므로 일회성 가격과 비용 구조가 맞지 않는다.

### 4. 코치/동호회용 확장
- MVP 이후 확장 후보로 둔다.
- 여러 러너 관리, 코치 피드백, 그룹 과제, 데이터 권한 관리가 필요해 현재 개인앱과 제품 복잡도가 다르다.

## App Store 출시 전 필수 검토
- Apple Developer Program 가입이 필요하다. Apple은 Developer Program을 연 99 USD 멤버십으로 안내한다.
- 디지털 기능 잠금 해제나 구독은 App Store In-App Purchase/StoreKit 경계를 따른다.
- Small Business Program 대상이면 유료 앱과 In-App Purchase 수수료를 15%로 낮출 수 있다. 자격은 관련 계정 수익과 Apple 기준에 따라 달라진다.
- HealthKit을 쓰는 앱은 명확한 개인정보 처리방침과 권한 설명이 필요하다.
- HealthKit/건강 데이터는 타겟 광고, 마케팅, 데이터 마이닝 용도로 쓰지 않는다.
- AI 코칭은 의료 진단, 치료, 안전 보장을 암시하지 않는다. 앱 설명, 온보딩, 코칭 응답에 러닝 훈련 참고용이라는 경계를 둔다.

## 출시 전 검증 순서
1. 개인 사용으로 2~4주 동안 코칭 품질과 실제 훈련 결정 도움 여부를 검증한다.
2. AI 코칭이 추천한 다음 훈련을 실제로 수행했는지 기록한다.
3. TestFlight용 최소 온보딩, 개인정보 처리방침, 면책 문구, HealthKit 권한 설명을 준비한다.
4. 10~30명 규모의 무료 베타를 진행한다.
5. 베타 사용자가 다음 훈련 결정에 앱을 반복적으로 쓰는지 본다.
6. 결제 붙이기 전 유지율과 지불 의향을 확인한다.

## 유료 가설 검증 지표
- 주 2회 이상 앱 재방문 비율.
- 세션별 AI 코칭 리포트 생성률.
- 코칭 리포트 이후 추가 질문 또는 재요청률.
- 추천 훈련 실제 수행률.
- 2주 후 계속 사용할 의향.
- 월 4,900원 이상 지불 의향.
- 앱 없이도 알 수 있던 조언이 아니라는 사용자 피드백.

## 제품 범위 제안
### 개인용 MVP
- HealthKit/FIT 기록 저장.
- 세션 상세와 AI 코칭.
- 다음 훈련 추천.
- 목표 가능성.
- 부상/회복 체크인.
- 주간 루틴 유지/조정.

### TestFlight 베타
- 최소 온보딩.
- HealthKit 권한 설명.
- 개인정보 처리방침 링크.
- AI 코칭 한계 고지.
- 피드백 수집 경로.
- 무료 베타 기간과 유료화 예정 고지.

### App Store 유료 실험
- 무료 기록/대시보드.
- 유료 AI 코칭 구독.
- 무료 체험 또는 제한된 무료 코칭 횟수.
- 구독 상태와 사용량 표시.
- 결제/구독 해지 안내.

## 주요 리스크
- 코칭 품질: 일반적인 조언처럼 느껴지면 유료 전환이 어렵다.
- 비용: AI 호출량이 늘면 낮은 구독료에서 마진이 줄 수 있다.
- App Review: HealthKit, AI 코칭, 구독 설명이 불명확하면 심사 리스크가 있다.
- 개인정보: 건강/운동 데이터 처리 방식이 명확하지 않으면 신뢰를 잃는다.
- 포지셔닝: 기록 앱, 훈련 플랜 앱, AI 챗봇 사이에서 메시지가 흐려질 수 있다.
- 운영 부담: 개인 개발 앱이 사업 앱이 되면 고객지원, 장애 대응, 환불, 데이터 삭제 요청까지 책임 범위가 넓어진다.

## 현재 결론
- 지금은 출시 준비 단계가 아니라 `유료 가설 검증 전 단계`다.
- 바로 App Store에 대중 출시하는 것보다 개인 사용과 소규모 베타에서 코칭 가치와 지불 의향을 검증한다.
- 유료 기능의 중심은 기록 저장이 아니라 AI 코칭, 목표 전망, 부상/회복 반영, 주간 루틴 조정이다.
- 사업화 문구는 `러닝 기록 앱`이 아니라 `한국어 개인 러닝 코치`로 잡는다.

## 전달된 사용자 가치 로그
실제 배포가 위 포지션(`기록 앱이 아닌 코치`)·차별화 축과 정합하는지 추적하는 누적 로그다. 배포마다 1블록 — **무엇을 · 누구에게 · 범위·한계**. 엔지니어링 근거는 `.harness/session/decision-log.md`, 도메인 근거는 `running-coaching-standards.md`, 진행 상태는 `.harness/session/active-context.md`.

### 2026-06-22 — 같은 날 더블(#455 웹 Phase 1~3) + minGap 웹 동적 안내(#462 v1)
- **새 능력 (숙련 러너 — 경력 3년+·주 80km+·무부상):** 같은 날 오전/오후 2세션(더블·make-up)을 정식으로 처방·추가. 둘째는 이지/회복으로 자동 강제(같은 날 하드-하드 금지), 주말 즈음 빠진 이지런을 코치가 *부드럽게* 따라잡기 제안(무리면 놓아주라고 함).
- **보호·교육 (초보 — 다수 사용자):** 미적격이면 "아직 일러요" 차단 카드로 *왜인지* 설명하고 안전한 대안(다른 날로 옮기기·놓아주기)으로 유도. 전문 코치라면 말릴 걸 앱도 말려주는 신뢰 가치(차별화 축 "부상/회복 게이트"와 정합).
- **편의 (#462 v1):** 오전 런 실제 종료시각을 읽어 "오후는 N시 이후 권장(최적 M시~)"를 색으로 안내 — 회복 타이밍을 사용자가 머릿속으로 계산 안 해도 됨(글리코겐 재합성 근거). 차별화 축 "실행 가능한 처방"과 정합.
- **범위·한계 (정직):** 도달 좁음 — 자격 게이트 통과 + 오전 런 완료 후라야 동적 안내가 뜸. 다수 초보 체감은 당장 "차단 카드" 위주. 또 아직 *안내*지 *강제*가 아님 — 실제 둘째 세션 시작을 막는 하드가드는 네이티브 후속(#462, OPEN). 폭넓은 체감은 사용자층이 숙련으로 올라오고 네이티브 가드가 붙은 뒤.

## 참고 출처
- Apple Developer Program: https://developer.apple.com/programs/
- App Store Small Business Program: https://developer.apple.com/app-store/small-business-program/
- App Store Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple HealthKit Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/healthkit
- Apple HealthKit privacy documentation: https://developer.apple.com/documentation/healthkit/protecting_user_privacy
- Runna pricing: https://www.runna.com/pricing
- Nike Run Club training plans: https://www.nike.com/running/training-plans
- Nike Run Club feature announcement: https://about.nike.com/en/newsroom/releases/nike-run-club-app-new-features
- Strava subscription features: https://support.strava.com/hc/en-us/articles/216917657-How-much-does-Strava-cost-
