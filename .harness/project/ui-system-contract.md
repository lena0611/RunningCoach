# PaceLAB UI System Contract

PaceLAB은 외부 UI 라이브러리를 전면 도입하지 않는다. 대신 자체 디자인 토큰과 `src/shared/ui` 공통 컴포넌트를 제품 디자인시스템으로 취급한다.

## 목적

- 화면별 즉흥 CSS와 일회성 마크업을 줄인다.
- 모바일 앱형 UI의 톤앤매너를 유지한다.
- 새로운 UI를 만들 때 재사용 가능한 컴포넌트로 승격할지 먼저 판단한다.
- 색상, spacing, typography, radius, shadow, z-index를 토큰으로 통제한다.

## 토큰 계층

전역 토큰은 `src/app/styles.css`의 `:root`에서 관리한다(다크 단일 — 라이트 모드 오버라이드 없음).

- 색상: `--color-*`
- 표면: `--color-surface-card`, `--color-surface-panel`, `--color-field`
- 상태: `--color-state-selected`, `--color-primary-soft`, `--color-danger-soft`
- spacing: `--space-1`부터 `--space-7`
- radius: `--radius-card`, `--radius-button`, `--radius-field`, `--radius-sheet`, `--radius-pill`
- typography: `--text-*`, `--font-weight-*`
  - 처방 템플릿, 코칭 근거, 복귀 기준, 날씨 조언처럼 사용자가 판단에 쓰는 본문성 정보 텍스트는 `--text-info-size`, `--text-info-line`을 우선 사용한다. 이런 문장은 caption 크기로 낮추지 않는다.
- 숫자 표시: 사용자-facing 숫자는 `src/shared/lib/format.ts`의 공통 포맷터를 거쳐 3자리 쉼표를 적용한다. 정수는 `formatInteger`, 소수 고정 자리 숫자는 `formatNumberWithCommas`를 사용하고, 단위는 `UnitValue` 또는 같은 숫자/단위 분리 패턴으로 렌더링한다. 날짜, 시간, 페이스처럼 콜론/따옴표 기반 도메인 포맷은 각 전용 포맷터를 따른다.
- elevation: `--shadow-card`, `--shadow-float`, `--shadow-button`
- layer: `--z-toast`, `--z-bottom-sheet`, `--z-stack`, `--z-confirm-sheet`

새 색상이나 고정 수치가 필요하면 먼저 토큰으로 승격할 수 있는지 검토한다. 화면 CSS에 hex, 임의 shadow, 임의 z-index를 새로 흩뿌리지 않는다.

## 공통 컴포넌트 계약

새 UI를 만들기 전에 다음 컴포넌트를 우선 검토한다.

- 화면 골격: `PageLayout`, `ContentStack`, `SectionGroup`, `SectionCard`, `SectionHeader`
- 스택(전체화면 오버레이): `StackPage` — `memory-stack-*` 마크업 + Teleport + Transition + 헤더 뒤로/닫기 버튼 + `data-no-swipe`를 한 곳에서 강제한다. 화면마다 `memory-stack-layer/page/header/content`를 손으로 반복하지 말고 이 컴포넌트를 쓴다(#275). props: `open`, `title`/`#title`, `transition`(미지정 시 `back`으로 자동: 진입 back=false→rise 밑→위, 전진 back=true→push 우→좌), `back`(false=우상단 닫기X / true=좌측 뒤로←), `#actions`, `#footer`, `bare`(자식이 자체 `.memory-stack-content`를 렌더할 때, 예: `RunDetailContent`), `contentClass`/`pageClass`/`layerClass`/`footerClass`.
  - 현재 `StackPage`로 통일됨: GlossarySheet · TrendsPage · DashboardPage(상세 4) · MemoryPage(9패널 셸) · AppHeader(3패널) · RunLogPage(상세/추가/수정) · RacePage(설정).
  - **의도적 비(非)이전(naive하게 고치지 말 것)**: RacePage 메인('한계 도전')+Dashboard Race 모달(레이어 전용 래퍼·라이브 GPS 코어, StackPage화 시 always-mount 전환 필요) / RunLogPage 코치 뷰(레이어 `@pointerdown.capture` 키보드 해제·커스텀 스크롤 ref·이중 footer·스트리밍 — StackPage 비호환). 이전하려면 StackPage에 레이어 이벤트 패스스루/레이어 전용 모드를 먼저 추가해야 한다.
- 액션: `ActionGroup`, `PrimaryButton`, `SecondaryButton`, icon-only button 패턴
- 입력: `ClearableField`, `DateField`, `BottomSheetSelect`, `ScaleSlider`, `FormGrid`
- 지표: `StatCard`, `MetricGrid`, `MetricPairList`, `UnitValue`
- 정보 그리드: `InfoPairGrid`
- 목록: `ListRow`, `RunSessionList`, `RunTypeBadge`, `RunTypeIcon`, `RunMetaChips`
- 피드백: `ToastHost`, bottom sheet confirm 패턴
- 코칭/차트: `CoachMessage`, `TrendChart`, `LapMetricChart`, `LapSplitChart`

공통 컴포넌트가 80% 이상 맞으면 컴포넌트를 확장한다. 화면 전용 CSS로 별도 구현하는 것은 마지막 선택이다.

## 승격 기준

아래 중 하나라도 해당하면 `src/shared/ui` 공통 컴포넌트 승격을 먼저 검토한다.

- 같은 UI 구조가 두 화면 이상에서 쓰인다.
- 모바일 safe area, z-index, stack, bottom sheet, toast, 입력 clearing 같은 상호작용 안정성이 필요하다.
- 숫자+단위, 날짜+요일, 세션 유형, 메타 칩처럼 도메인 포맷 규칙이 있다.
- 이후 사용자 필터, 통계, 코칭 화면에서 재사용될 가능성이 있다.

## Bottom Sheet Gesture Contract

- 공통 bottom sheet는 핸들/헤더 drag release에서 즉시 DOM을 제거하지 않는다. 닫힘으로 판정되면 sheet 높이만큼 `transform`을 애니메이션한 뒤 close callback을 호출하고, `dragOffset`/inline transform 상태를 반드시 초기화해 다음 open이 중간 위치에서 시작하지 않게 한다.
- 임계값 미만 drag release나 pointer cancel은 `transform: 0`으로 복귀 transition을 보여준 뒤 inline transform을 제거한다. `bottom-sheet-dragging` 클래스가 남아 transition을 막는 상태로 끝나면 회귀로 본다.

## 화면 CSS 허용 범위

페이지 파일 전용 CSS는 다음 수준만 허용한다.

- 공통 컴포넌트를 배치하는 grid/flex 조합
- 해당 화면에만 존재하는 시각화 영역의 local layout
- 공통 컴포넌트 variant로 표현하기 어려운 도메인 시각화

반대로 버튼, 카드, 리스트, 입력, 셀렉트, 날짜, 토스트, 바텀시트, 스택 헤더를 페이지마다 새로 만들지 않는다.

## 카드 밀도

- `SectionCard` 안에 다시 카드형 surface를 반복해서 넣기 전에 grouped row/list 구조를 먼저 검토한다.
- 반복 목록이나 복합 콘텐츠 섹션은 제목/액션을 카드 내부에 넣기보다 바깥 `SectionHeader` + 콘텐츠 surface 구조를 우선한다.
- 목록, 후보, 처방 기준처럼 반복되는 콘텐츠는 개별 미니 카드보다 하나의 grouped surface 안 row + divider 패턴을 우선한다.
- 세션 상세처럼 여러 지표를 한 영역에서 읽는 화면은 개별 미니 카드 그리드보다 `MetricPairList` 같은 grouped 2열 row + divider 구조를 우선한다.
- 프로필이나 계정 요약처럼 짧은 label/value 정보는 `InfoPairGrid`를 우선 사용한다. 세로 디바이더는 기본값을 `false`로 두고, 구분선이 정보 위계를 실제로 돕는 경우에만 prop으로 켠다.
- 카드 안 카드가 필요한 경우는 비교/선택/상태 강조처럼 독립된 표면이 실제 의미를 가질 때로 제한한다.
- 모바일 폭에서 패딩이 누적되어 주요 텍스트나 입력 공간이 줄어들면 바깥 카드 또는 안쪽 카드 중 하나를 `flat`/row 구조로 낮춘다.
- 섹션과 섹션 사이의 위쪽 여백은 부모별 임의 gap이 아니라 `--section-stack-gap`을 기준으로 맞춘다. 섹션 제목과 본문 사이 간격은 `--section-title-body-gap`으로 통제한다.

## 모바일 입력 동작

- 입력 필드 선택 기준:
  - 요일, 성별, 출생연도, 러닝 경력, 주간 목표 횟수처럼 선택지가 명확한 값은 자유 텍스트/숫자 입력 대신 `BottomSheetSelect`를 우선 사용한다.
  - 운동강도, 수면 점수, 컨디션 점수, 스트레스, 통증 심각도처럼 주관적이고 범위가 있는 값은 `ScaleSlider`를 우선 사용한다.
  - 부상 부위처럼 해석 차이를 줄여야 하는 도메인 값은 자유 텍스트가 아니라 정규화 선택 UI를 사용한다. 부상관리는 `InjuryBodySelector`로 WebGL/Three.js 없이 동작하는 생성 이미지 기반 스틸컷 around-view와 상체/하체/발 목록을 함께 제공하고, 복수 선택과 부위별 `ScaleSlider` 통증 레벨을 기본 패턴으로 둔다. 상체/허리와 하체는 45도 단위 9컷(0~360도)을 제공하고, 발/발목은 전면/후면/내측/외측/발등/발바닥처럼 러닝 부상 판단에 필요한 관점별 스틸컷을 제공한다. 기본 상태에서 부위를 미리 파란 덩어리로 채우지 말고 이미지 위 투명 hit-zone을 두며, 부위 터치 후 상세 후보를 고르게 하고 선택된 부위만 노드로 표시한다. 생성 이미지 자산을 교체하더라도 컴포넌트 API와 선택 데이터 구조는 유지한다.
  - 부상 체크인은 `InjuryCheckInSheet` 같은 전역 bottom sheet로 짧게 묻고, Memory 화면 진입에 의존하지 않는다. 통증은 0~5 `ScaleSlider`, 러닝 중/후 악화, 일상 보행/계단 반응, 강훈련/롱런 가능 여부는 segmented choice로 처리한다. 해소 후보는 사용자 승인 버튼으로만 저장하고, 안내 문구는 의료 진단/치료가 아니라 러닝 부하 조절 참고용임을 분명히 한다.
  - 이름, 메모, 느낌, 통증 설명처럼 사용자의 자연어가 필요한 값만 `ClearableField` 텍스트/textarea로 둔다.
  - 거리, 시간, 페이스, 심박, 기온처럼 실제 측정값을 보정 입력하는 값은 숫자/포맷 입력을 유지하되 단위와 표시 형식은 공통 포맷터를 따른다.
- 채팅, 스택 상세, 바텀시트처럼 모바일 키보드가 떠 있는 화면은 입력폼 바깥 터치 시 현재 입력의 focus를 해제해 키보드를 내려야 한다.
- 하단 고정/스티키 CTA는 iOS WebView 키보드와 겹치지 않도록 전역 `--keyboard-inset-bottom` 변수를 사용한다. 새 fixed CTA를 만들 때 `env(safe-area-inset-bottom)`만 쓰지 않는다.
- iOS 키보드 위의 폼 이동/완료 accessory bar는 웹 CSS로 화면별 제어가 어렵다. 제거가 필요하면 WKWebView 네이티브 레이어에서 별도 처리하고, 웹은 바깥 터치 dismiss 동작을 기본 UX로 제공한다.
- 입력 영역 내부 버튼, 슬래시 커맨드, 전송 버튼은 focus 해제 예외 영역으로 유지한다.

## Stack Sticky 요소

- stack 화면 안에서 지도, 요약 패널, CTA 같은 요소를 `position: sticky`로 고정할 때는 `top: 0`, 헤더 높이, 음수 보정 같은 추정값으로 완료하지 않는다.
- sticky 기준은 실제 스크롤 컨테이너와 stack header의 관계로 결정한다. 구현 전 해당 요소가 viewport 기준으로 붙는지, stack content 기준으로 붙는지 `getBoundingClientRect()`로 확인한다.
- stack header 아래에 정확히 맞물려야 하는 sticky 요소는 `header.getBoundingClientRect().bottom - scrollContainer.getBoundingClientRect().top` 같은 실제 렌더링 좌표를 CSS 변수로 반영하는 방식을 우선한다.
- `.memory-stack-content`처럼 공통 padding을 가진 컨테이너를 page-specific 화면에서 덮어쓸 때는 CSS 선언 순서와 선택자 특이성을 함께 확인한다. 공통 선언이 뒤에서 다시 이기면 `padding-top: 0` 같은 보정이 적용된 것처럼 보여도 실제 모바일에서는 16px 틈이 남을 수 있다.
- sticky 요소의 z-index만 올려서 겹침을 숨기는 방식은 최종 해결로 보지 않는다. header bottom과 sticky target top의 실제 좌표 차이가 0px인지 확인한다.
- 지도와 선택 구간 정보바처럼 하나로 붙어 다녀야 하는 요소는 각각 sticky로 만들지 말고 하나의 sticky group 안에 묶는다. group 내부 gap은 0으로 두고, `overflow: hidden`과 radius를 group에 적용해 뒤 스크롤 콘텐츠가 틈으로 보이지 않게 한다.
- drawer/stack 안의 sticky header는 panel padding과 음수 margin 상쇄로 맞추지 않는다. header는 스크롤 컨테이너의 top에 붙이고, 불투명한 surface 배경과 필요한 하단 shadow/border를 가져 아래 폼 내용이 비쳐 보이지 않게 한다.
- 세션 상세처럼 지도와 차트가 상호작용하는 화면은 sticky 위치를 바꿀 때 차트 tooltip, 지도 레이어, fixed CTA, 스플릿 섹션 진입 시 sticky 해제 타이밍을 함께 확인한다.

## 리뷰 체크리스트

UI 변경 리뷰 시 아래를 확인한다.

- 새 UI가 기존 공통 컴포넌트를 우선 사용했는가?
- 새 색상/spacing/z-index/font-weight가 토큰 없이 추가되지 않았는가?
- 다크 팔레트에서 의미와 대비가 유지되는가? (라이트 모드는 지원하지 않음)
- 달성 맥락이 아닌 곳에 `--color-celebrate`(라임)를 쓰지 않았는가?
- 모바일 폭에서 텍스트와 단위가 겹치지 않는가?
- stack, bottom sheet, toast, fixed CTA가 서로 z-index 충돌하지 않는가?
- stack 화면의 sticky 요소가 있다면 header bottom과 sticky top이 의도한 좌표에서 맞물리는지 모바일 viewport에서 계측했는가?
- 여러 요소를 하나의 sticky group으로 묶었다면 group 내부 시각 간격이 의도한 값인지, 뒤 스크롤 콘텐츠가 틈으로 보이지 않는지 확인했는가?
- drawer/stack sticky header 아래로 폼 label이나 입력값이 비쳐 보이지 않는 불투명 배경 구조인가?
- 모바일 입력 화면에서 바깥 터치 키보드 dismiss가 동작하고, 입력 내부 액션은 방해받지 않는가?
- 반복될 가능성이 있는 패턴을 하네스 문서나 공통 컴포넌트로 승격했는가?

## 현재 결정

- PrimeVue, Vuetify, Element Plus, Naive UI 같은 외부 UI 라이브러리는 전면 도입하지 않는다.
- TDS Mobile은 참고 자료로 유지하되, PaceLAB의 자체 토큰과 컴포넌트로 구현한다.
- `BottomSheetSelect`처럼 상호작용이 까다로운 컴포넌트는 공통 컴포넌트에서 기능을 확장하고 테스트를 추가한다.
