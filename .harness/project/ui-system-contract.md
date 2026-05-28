# PaceLAB UI System Contract

PaceLAB은 외부 UI 라이브러리를 전면 도입하지 않는다. 대신 자체 디자인 토큰과 `src/shared/ui` 공통 컴포넌트를 제품 디자인시스템으로 취급한다.

## 목적

- 화면별 즉흥 CSS와 일회성 마크업을 줄인다.
- 모바일 앱형 UI의 톤앤매너를 유지한다.
- 새로운 UI를 만들 때 재사용 가능한 컴포넌트로 승격할지 먼저 판단한다.
- 색상, spacing, typography, radius, shadow, z-index를 토큰으로 통제한다.

## 토큰 계층

전역 토큰은 `src/app/styles.css`의 `:root`와 `.theme-light`에서 관리한다.

- 색상: `--color-*`
- 표면: `--color-surface-card`, `--color-surface-panel`, `--color-field`
- 상태: `--color-state-selected`, `--color-primary-soft`, `--color-danger-soft`
- spacing: `--space-1`부터 `--space-7`
- radius: `--radius-card`, `--radius-button`, `--radius-field`, `--radius-sheet`, `--radius-pill`
- typography: `--text-*`, `--font-weight-*`
- elevation: `--shadow-card`, `--shadow-float`, `--shadow-button`
- layer: `--z-toast`, `--z-bottom-sheet`, `--z-stack`, `--z-confirm-sheet`

새 색상이나 고정 수치가 필요하면 먼저 토큰으로 승격할 수 있는지 검토한다. 화면 CSS에 hex, 임의 shadow, 임의 z-index를 새로 흩뿌리지 않는다.

## 공통 컴포넌트 계약

새 UI를 만들기 전에 다음 컴포넌트를 우선 검토한다.

- 화면 골격: `PageLayout`, `ContentStack`, `SectionCard`, `SectionHeader`
- 액션: `ActionGroup`, `PrimaryButton`, `SecondaryButton`, icon-only button 패턴
- 입력: `ClearableField`, `DateField`, `BottomSheetSelect`, `ScaleSlider`, `FormGrid`
- 지표: `StatCard`, `MetricGrid`, `UnitValue`
- 목록: `ListRow`, `RunSessionList`, `RunTypeBadge`, `RunTypeIcon`, `RunMetaChips`
- 피드백: `ToastHost`, bottom sheet confirm 패턴
- 코칭/차트: `CoachMessage`, `TrendChart`, `LapMetricChart`, `LapSplitChart`

공통 컴포넌트가 80% 이상 맞으면 컴포넌트를 확장한다. 화면 전용 CSS로 별도 구현하는 것은 마지막 선택이다.

## 승격 기준

아래 중 하나라도 해당하면 `src/shared/ui` 공통 컴포넌트 승격을 먼저 검토한다.

- 같은 UI 구조가 두 화면 이상에서 쓰인다.
- 모바일 safe area, z-index, stack, bottom sheet, toast, 입력 clearing 같은 상호작용 안정성이 필요하다.
- 숫자+단위, 날짜+요일, 세션 유형, 메타 칩처럼 도메인 포맷 규칙이 있다.
- 라이트/다크 테마 양쪽에서 일관된 대비가 필요하다.
- 이후 사용자 필터, 통계, 코칭 화면에서 재사용될 가능성이 있다.

## 화면 CSS 허용 범위

페이지 파일 전용 CSS는 다음 수준만 허용한다.

- 공통 컴포넌트를 배치하는 grid/flex 조합
- 해당 화면에만 존재하는 시각화 영역의 local layout
- 공통 컴포넌트 variant로 표현하기 어려운 도메인 시각화

반대로 버튼, 카드, 리스트, 입력, 셀렉트, 날짜, 토스트, 바텀시트, 스택 헤더를 페이지마다 새로 만들지 않는다.

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

## 리뷰 체크리스트

UI 변경 리뷰 시 아래를 확인한다.

- 새 UI가 기존 공통 컴포넌트를 우선 사용했는가?
- 새 색상/spacing/z-index/font-weight가 토큰 없이 추가되지 않았는가?
- 다크/라이트 테마 양쪽에서 의미와 대비가 유지되는가?
- 모바일 폭에서 텍스트와 단위가 겹치지 않는가?
- stack, bottom sheet, toast, fixed CTA가 서로 z-index 충돌하지 않는가?
- 모바일 입력 화면에서 바깥 터치 키보드 dismiss가 동작하고, 입력 내부 액션은 방해받지 않는가?
- 반복될 가능성이 있는 패턴을 하네스 문서나 공통 컴포넌트로 승격했는가?

## 현재 결정

- PrimeVue, Vuetify, Element Plus, Naive UI 같은 외부 UI 라이브러리는 전면 도입하지 않는다.
- TDS Mobile은 참고 자료로 유지하되, PaceLAB의 자체 토큰과 컴포넌트로 구현한다.
- `BottomSheetSelect`처럼 상호작용이 까다로운 컴포넌트는 공통 컴포넌트에서 기능을 확장하고 테스트를 추가한다.
