# Tab Patterns — 토큰 & 사용 규칙

PaceLAB의 모든 탭·전환 UI 스펙. 콘텐츠 페이지의 탭성 UI(뷰 전환·필터·모드·기간·상태 답변)는 이 문서를 SSOT로 본다.

**컴포넌트는 3개뿐이다. 화면별 인라인 탭 재작성 금지.** (구현: `src/shared/ui/SegmentTabs.vue`, `WeekStrip.vue`, `BottomNav.vue`)

| 컴포넌트 | 역할 | Vue 시그니처 |
|---|---|---|
| `BottomNav` | 하단 글로벌 내비 (5탭) | `<BottomNav :active>` |
| `SegmentTabs` | 콘텐츠 내 모든 탭/전환 (variant 5종) | `<SegmentTabs :variant :tone :items :active @change>` |
| `WeekStrip` | 요약 홈 날짜 스트립 | `<WeekStrip :days :today @select>` |

---

## 1. 토큰

전역 토큰(`--color-primary`/`--color-accent`/`--color-warning`/`--color-surface-*`/`--color-border`/`--color-muted-*`) 위에 얹는 탭 전용 토큰. `src/app/styles.css` `:root`에 정의. 컴포넌트는 이 토큰만 참조한다 — hex 하드코딩 금지.

스펙 방언 → 실제 토큰 매핑: `--ok`→`--color-primary` · `--accent`→`--color-accent` · `--warning`→`--color-warning` · `--surface-2`→`--color-surface-2` · `--text-3`→`--color-muted-2` · `--border`→`--color-border` · `--mono`→`--font-mono`.

토큰 목록: 비활성 공통(`--tab-inactive-bg/text/border/weight`, `--tab-active-weight`), tone 3종 활성 스킨(`--tab-{ok|accent|warning}-{bg|text|border|solid}`), variant 지오메트리(`--tab-{chip|seg|pill|under|group}-*`), WeekStrip(`--weekstrip-*`). 값의 정본은 `src/app/styles.css`.

---

## 2. Variant 스펙 (SegmentTabs)

공통: 활성 = `--tab-{tone}-bg` + `--tab-{tone}-border` + `--tab-{tone}-text` + 700 / 비활성 = inactive 토큰 + 600.

| variant | 구조 | 차이점 |
|---|---|---|
| `underline` | 투명 bg 텍스트 탭 + 하단 인디케이터 | 활성만 `--tab-{tone}-solid` 2px 언더라인 + `--color-text` 텍스트. 래퍼에 1px 하단선 |
| `chips` | 개별 칩, 가로 스크롤(`overflow-x:auto`) | 항목 수 제한 없음. 줄바꿈 없이 넘치면 스크롤. `data-horizontal-scroll` 계약 |
| `segmented` | 등폭(flex:1) 세그먼트 | 2~4개 고정. 항목에 `detail`(보조 설명 2줄) 옵션 |
| `pill` | 컨테이너(surface r999 pad4 + 1px border) 안 토글 | 활성 = `--tab-{tone}-solid` 솔리드 bg + 다크 텍스트(`--color-on-primary`) |
| `group` | 붙은 박스(surface r10 1px border), 셀 간 1px 내부 구분선 | gap 0. 활성 = 틴트 bg |

## 3. Tone 규칙

| tone | 의미 | 사용처 예 |
|---|---|---|
| `ok` (기본) | 브랜드 · 일반 선택 | 뷰 전환, 타입 필터, 모드 토글, 기간 |
| `accent` | 정보 · 분석 렌즈 · 단위 | 추세 렌즈, 차트 단위/기간, 격차 표시 단위 |
| `warning` | 주의 상태의 **답변** | 부상 체크인 통증 답변, 포스트런 통증 정도/부위 |

- tone은 **활성 스킨만** 바꾼다. 비활성은 항상 동일.
- **라임(`--color-celebrate`)은 탭에 사용 금지** — 달성 순간 전용.
- 한 화면에서 같은 계층의 탭은 tone을 통일한다.

## 4. 사용 규칙 (언제 무엇을)

| 상황 | 선택 |
|---|---|
| 화면 최상위 뷰 전환 (목록↔달력, 주간↔월간) | `underline` — 한 화면에 1개만 |
| 항목 5개 이상 또는 가변 (필터·렌즈) | `chips` |
| 폼 질문·설정의 2~4개 단일 선택 | `segmented` — 상태성 답변이면 tone으로 의미 부여 |
| 서로 배타적인 2개 모드 | `pill` |
| 카드 내부 조밀한 전환 (km↔mi, 100/500/1000m) | `group` |
| 글로벌 화면 이동 | `BottomNav` — 콘텐츠 탭으로 화면 이동 금지 |
| 날짜 선택 (요약 홈) | `WeekStrip` |

**금지**
- 같은 variant를 한 화면에 계층 구분 없이 중첩
- 탭으로 액션 실행 (탭은 전환만 — 액션은 Button)
- 인라인 스타일로 탭 재구현 — 반드시 위 3개 컴포넌트 사용

## 5. 접근성 & 동작

- SegmentTabs는 `role="tablist"` + 각 셀 `role="tab"` + `aria-selected`를 제공한다. 셀 최소 높이 32px(BottomNav 44px).
- 활성 표시는 색+굵기+보더 3중 — 색만으로 구분하지 않는다.
- **탭 라벨 폰트는 최소 14px**(가독성 지침 2026-07-07). variant 폰트 토큰(`--tab-*-font-size`)은 모두 14px 이상. `segmented`의 `detail` 보조 설명은 예외(caption 크기).
- `chips` 스크롤바 숨김(`scrollbar-width:none`).
- 전환 애니메이션: 배경/보더 `.15s ease` (pill 활성 이동 `.2s ease`).

## 6. 의도적 비(非)이전 (naive하게 SegmentTabs로 바꾸지 말 것)

아래는 형태상 탭처럼 보여도 컴포넌트 계약과 달라 이전 시 회귀가 난다. 이전하려면 별도 설계가 먼저다.

- **코치 `WeekTrainingCarousel`**: 요일 스트립 + 슬라이드 좌우 드래그 제스처 + `data-no-swipe`(루트 페이저 분리) + 같은날 더블 `×2` shoulder 배지. WeekStrip의 단순 프리뷰 계약과 다른 인터랙티브 위젯.
- **`RescheduleSheet` 요일 그리드**: 4열 grid 날짜 피커(바텀시트 내부). 가로 스트립이 아니다.
- **`TrendsPage` 렌즈 리스트**: 활성 상태 없이 즉시 StackPage 상세로 드릴다운하는 네비게이션 리스트(각 행에 값·설명·chevron). 탭이 아니라 ListRow 계열. `e2e/stackpage-275.spec.ts`가 `.trend-lens-row`를 참조한다.

## 7. 현재 적용 현황 (2026-07-07)

SegmentTabs 사용: DashboardPage(벤치마크 성별 segmented/accent) · InjuryCheckInSheet(3× segmented/warning) · PostRunInterviewSheet(통증 정도·부위 segmented/warning) · GlossarySheet(카테고리 chips/accent) · InjuryBodySelector(모델 segmented/ok + 각도 chips/ok) · RacePage(거리 chips/ok · 음성종류 segmented/ok · 구간 group/ok · 격차단위 group/accent).
`pill` variant는 컴포넌트에 구현돼 있으나 현재 사용처 없음(향후 배타 2모드 UI용).
