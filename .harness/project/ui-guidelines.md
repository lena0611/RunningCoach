# PaceLAB UI Guidelines

PaceLAB is a personal running coach app, not an admin dashboard.

## Product Feel

- Mobile-first.
- **Dark-only.** 라이트 모드/테마 토글은 지원하지 않는다(2026-07 리디자인에서 제거 확정). 새 UI는 다크 팔레트 기준으로만 검증한다.
- The visual target is between Apple Fitness, Strava, and a ChatGPT coaching card.
- Primary screens should feel like a running app: strong metrics, card-based summaries, and readable coaching text.
- Avoid wireframe/admin-table layouts unless debugging.

## Visual Rules

- Use CSS design tokens from `src/app/styles.css`.
- PaceLAB follows a TDS-inspired mobile system, not raw Toss branding. Treat TDS as interaction/layout guidance: neutral grey scales, clear typography hierarchy, pressable rows, fixed CTA bars, bottom sheets, and toast behavior. Keep PaceLAB's running-coach identity and green primary color.
- Brand asset draft is PACELAB. Web loading fallback and PWA icons live under `public/pacelab-*`; iOS splash uses the native `PaceLabSplashView`. Treat these as replaceable draft assets until the final brand document is fixed.
- TDS adaptation source: https://tossmini-docs.toss.im/tds-mobile/
- Before any UI/UX change, inspect the relevant TDS Mobile category and choose the closest pattern first. Examples: screen headers -> `Top`, repeated items -> `ListRow`, forms -> `TextField`, selections -> `BottomSheet`, persistent save actions -> `FixedBottomCTA`, feedback -> `Toast`, confirmations -> `Dialog` or bottom sheet. Then adapt the pattern to PaceLAB instead of inventing a new local interaction.
- If no TDS pattern fits, document the reason in the implementation note or harness decision log before adding a new page-specific UI pattern.
- Define theme values through CSS tokens. 라이트 모드 오버라이드는 만들지 않는다 — 다크 단일 `:root` 토큰이 유일한 진실이다.
- New colors should be added as semantic tokens or TDS-like scale tokens first. Do not scatter page-specific hex values across components.
- 달성 순간(자기기록·목표 완료·퀘스트 클리어·연속 스트릭·레벨업)에만 `--color-celebrate`(라임)를 쓴다. 그 외 모든 일상 CTA·강조는 `--color-primary`(에메랄드). 라임을 일상 UI에 쓰지 않는다.
- Typography must use a small set of shared scale tokens: display, title, body, caption, and metric. Avoid one-off font-size values in page components unless the component is genuinely unique.
- 본문·제목은 Pretendard Variable(`--font-sans`), 숫자·시간·페이스·거리는 JetBrains Mono tabular(`--font-mono`)를 쓴다. `UnitValue`는 자동 적용되고, 그 외 도메인 숫자에는 `.num-mono` 유틸리티를 쓴다.
- Important metrics use large, bold numerals.
- Metric units such as `km`, `%`, and `회` must render smaller than the number and should not be concatenated at the same visual size in compact cards.
- Supporting labels and metadata are smaller and muted.
- Cards should have generous spacing, soft borders, and `--radius-card`.
- Section titles need visible breathing room from the previous section; use `--section-stack-gap` for section-to-section spacing and `--section-title-body-gap` between a title and its body.
- Repeated list content should prefer a ListRow pattern over mini cards: primary title, muted detail, optional right metric/addon, and a clear press/action target.
- Run session lists are compact previews. Show only the run type plus one highest-priority meta chip so rows never clip text at mobile widths; show the full metadata only in session detail.
- Compact repeated rows such as Run Log must use icon-only edit/delete actions with accessible labels. Do not use text buttons when the row has limited horizontal space.
- Primary actions use green emphasis; destructive actions are subdued red, not loud.
- Keep bottom navigation usable with one hand on mobile.
- Fixed mobile bottom navigation must use `viewport-fit=cover`, `env(safe-area-inset-bottom)`, a fixed nav height token, and matching `.app-main` bottom reserve. The nav should stay attached to the visual viewport before and after full scroll.
- Bottom navigation is icon-first. Labels stay under icons as small captions, not as the primary visual element.
- Bottom navigation must use explicit programmatic navigation through the router, not rely only on raw anchor default behavior. This keeps iOS WebView taps predictable.
- Main tabs support interactive horizontal pager navigation. During a swipe, the adjacent tab page should be visibly attached and move with the finger, not just route after release. Once horizontal intent is detected, vertical scrolling must be locked until release. Swipes should be disabled over text inputs, bottom sheets, side drawers, deep stack layers, and horizontally scrollable content so local gestures are not stolen by the root pager.
- Root tab pager must not disable swipe just because the pointer starts on an ordinary button, card, list row, summary row, or non-interactive chart. Horizontal drag should still become a root tab swipe, and the existing click suppression handles accidental taps after a swipe. Only components with their own horizontal gesture or scroll contract should opt out through `data-no-swipe`, `[data-horizontal-scroll]`, `role="slider"`, or an actual horizontally scrollable container.
- Root tab pager panels stay mounted for swipe continuity. Any `position: fixed`, Teleport-rendered, or viewport-level sticky element inside a tab must be scoped to the active route/panel, or explicitly hidden when its `.tab-swipe-panel` has `aria-hidden='true'`, so Run Log headers or other tab-local chrome never leak into Dashboard, Trends, or Memory.
- Root tab navigation through the bottom nav resets the main scroll position to top. Deep in-tab stacks preserve the root surface and restore the previous stack page scroll on Back.
- Do not use native `<select>` for app workflows. Use `BottomSheetSelect`, opening options in a bottom sheet.
- `BottomSheetSelect` overlays must sit above screen stacks, fixed action bars, and side drawers. It must stop pointer/click propagation on the trigger and sheet so stack swipe/overlay handlers cannot swallow the tap. When adding stack/drawer/modal z-index layers, keep the common bottom sheet layer higher than those surfaces and destructive confirmation sheets higher than ordinary selection sheets.
- App date inputs must use the shared `DateField` wrapper instead of exposing native `input[type='date']` directly. The visible field must show the shared weekday format such as `2026-05-23(토)` while the hidden native input only provides the platform picker.
- Pace fields must display rounded `m:ss` values. Never show raw fractional seconds such as `7:13.2714718`.
- Account/profile management belongs in the header account drawer, not inside the `Memo` tab.
- The account drawer opens from right to left. Profile editing is a second right-to-left stack inside the drawer.
- Account-level settings live in the account drawer as a separate settings stack, opened by an icon-only gear action in the account header. Do not add global settings into tab pages.
- 테마 설정 UI는 존재하지 않는다(다크 단일). `settingsStore`는 알림 등 나머지 설정을 소유하며, 새 설정은 이 store 또는 형제 settings 도메인으로 확장한다 — 컴포넌트에 localStorage 읽기를 흩뿌리지 않는다.

## Screen Stack Pattern

Use a screen stack when the user is drilling into a deeper flow without changing the main tab.

- A tab remains the root surface. Deeper screens slide over it instead of replacing the bottom tab context. Anything that is NOT a bottom-nav tab root (요약/기록/추세/기억) is a stack detail.
- First-level stack screens (entry: opened from a tab via tap) animate **bottom-to-top** (rise / `stack-page-up`) and show only a **close (X) action in the top right**.
- Going forward from a first-level stack into a deeper detail/edit screen animates **right-to-left** (push / `stack-page`) and shows a **back (←) action on the left of the title** (no close X). This is the router's forward direction.
- The shared `StackPage` enforces this automatically: `back=false` → rise + top-right close; `back=true` → push + left back. Only override `transition` for special cases.
- Focused management flows such as Memory goal/injury list, create, and edit use a full-screen stack page, not an inner card section. Second-level or deeper stack headers show only Back on the left; Close is hidden because Back is the expected navigation affordance.
- Stack navigation must push pages onto an in-tab stack instead of replacing the root route. Back pops one stack page and restores that page's prior scroll/data state; Close exits the stack to the tab root.
- Nested stack transitions must be visible. When a stack page opens another detail/create/edit page, wrap the keyed page body in a right-to-left `Transition` instead of swapping conditional content in place.
- Stack headers use compact icon buttons to preserve title space on mobile. Titles are Korean-only, left aligned, and placed immediately to the right of Back when Back is present.
- Stack and drawer headers must use icon-only Back/Close buttons with accessible `aria-label`; do not show literal text buttons such as "뒤로" or "닫기" in header chrome.
- Custom non-primary buttons (chips, list rows, tabs, ghost surfaces built on `<button>`) must reset `box-shadow: none`. The global `button` rule applies a green primary glow (`--shadow-button`); leaving it produces an odd drop shadow on surface-styled controls. This has recurred on `.drawer-link-row` and `.glossary-chip` — always reset the shadow when restyling a `<button>` as a surface/chip/tab.
- Edit/create stack pages use a fixed full-width bottom action bar for saving. Save is disabled until dirty state is detected.
- Destructive actions ask for confirmation in a bottom sheet, not `window.confirm`.
- User consent for app-state changes such as saving detected goals, routine updates, or coaching-basis changes must use a bottom sheet confirmation. Do not ask the user to confirm those changes as ordinary chat text.
- Use stacks for account/profile editing, run detail/edit flows, and focused settings. Do not use a stack for ordinary tab-to-tab navigation.
- Session detail must expose the same management affordances from every entry path: HealthKit refresh when available, edit, delete, and AI coaching. Entry pages may route the actual edit/delete flow to the canonical Run Log stack, but the user must see the actions on the detail surface.
- The bottom navigation remains a root-level control. Stack overlays sit above it when modal, or keep it visually stable when inline.
- Horizontal page slide transitions are for root tab movement. Deeper stack screens use their own right-to-left stack transition.

## Screen Priorities

- Dashboard: home screen, weekly/monthly distance, Easy ratio, hard session count, next recommended session, recent runs.
- Dashboard hero copy must not imply measured physiology unless the app has measured it. Use clear labels like "훈련 요약" instead of ambiguous labels like "오늘의 컨디션".
- Dashboard and Coach must surface the active goal and active injury context near the top. The user should not have to infer which goal or restriction the recommendation used.
- Upload: simple HealthKit/FIT/manual import flow with large upload/import cards.
- Run Log: chronological cards, run type badges, distance/pace/HR summary, edit/delete actions.
- Trends: 전문 러닝 인사이트 화면. Lens selector, 기간/비교 기준, 핵심 변화 hero, 3~4개 요약 카드, 시각화, 해석, 근거 세션, 다음 처방 영향을 순서대로 보여준다. 통계표보다 발전/퇴보와 처방 조정 신호를 우선한다.
- Memory: training context only: goal management, injury management, AI-managed weekly routine, long-run strategy, heat/style notes. Do not mix account registration controls into this screen. Weekly routine is shown as AI-managed context, not as a freeform user-authored plan.
- Memory goal and injury management must use separated flows: overview card -> list -> edit or new item screen. Do not place active selection, edit fields, creation fields, and full lists in one long mixed form.
- Memory overview should summarize the current coaching basis first, then provide drill-in cards for goal and injury management. Deep edit fields belong only on focused edit/create screens.
- Memory injury management must normalize body parts. Use the shared body selector with rotatable front/right/back/left views plus upper/lower/foot list fallback. Do not reintroduce free-text-only injury area entry; free text belongs in notes, triggers, and management details.
- Coach: chat-like user and coach messages, markdown rendered as readable headings, paragraphs, lists, code blocks, and dividers.
- Streaming coach answers should auto-follow the latest text line while the user is at the bottom. If the user intentionally scrolls upward, stop auto-following and show a centered down-arrow button above the input bar that smoothly returns to the latest message.
- User-facing dates must include the weekday, e.g. `2026-05-24(일)`. Store raw ISO dates in data, but format every displayed date through the shared formatter.
- Calendar run-count shoulder chips are exception indicators, not the main signal. Show them only for dates with two or more sessions; single-run days should rely on the highlighted date circle alone.
- Metric values with units must use `UnitValue` or an equivalent shared pattern. Units are inline flow content, never absolutely positioned, and must stay smaller than the number without overlapping at mobile widths.
- Toast messages must use the shared toast store and `ToastHost` component. Feature stores/pages should call the shared toast API instead of keeping one-off toast state or rendering inline toast markup. Default placement is bottom with a rise animation. System/background events such as HealthKit sync use top placement with a drop animation and stronger success/error colors.
- HealthKit sync toasts must distinguish state by tone: new records saved uses success/primary, no change uses neutral/subtle, and sync failure uses error/red.

## Component Rules

Detailed token/component enforcement lives in `.harness/project/ui-system-contract.md`. Treat that contract as the first reference when creating or refactoring UI.

Prefer shared UI components in `src/shared/ui`:

- `AppShell`
- `AppHeader`
- `PageLayout`
- `ContentStack`
- `SectionGroup`
- `SectionHeader`
- `ActionGroup`
- `FormGrid`
- `BottomNav`
- `StatCard`
- `SectionCard`
- `MetricPairList`
- `RunTypeBadge`
- `PrimaryButton`
- `SecondaryButton`
- `CoachMessage`
- `EmptyState`
- `MetricGrid`
- `BottomSheetSelect`
- `DateField`
- `ToastHost`
- `TrendChart`
- `ListRow`

New page work should reuse these before adding page-specific layout.

Common display components should not decide how much page space they receive. Page-level spacing, grids, stacks, section headers, action rows, and forms must be owned by layout components such as `PageLayout`, `ContentStack`, `SectionGroup`, `SectionHeader`, `ActionGroup`, and `FormGrid`.

If a page needs a new button, card, input, select, toast, bottom sheet, list row, metric card, date display, or stack header, first extend an existing shared component. Add page-specific markup only when the pattern is truly one-off and document why if it is likely to repeat.

Charts should use `TrendChart` and ECharts unless there is a specific reason to add another chart primitive. Keep chart libraries lazy-loaded or page-split so the root app chunk does not grow unnecessarily. Chart y-axis domains must go through the shared metric-domain helper rather than raw `dataMin`/`dataMax`; heart rate, pace, cadence, elevation, temperature, distance, percent, and count charts need metric-specific padding and minimum spans so normal variation is not visually exaggerated. Session detail pace and heart-rate charts intentionally use fixed comparable y-axis domains: pace 3'30"~12'00"/km at 30-second intervals, heart rate 0~210bpm at 10bpm intervals. Do not overlay unrelated units such as pace, heart rate, and cadence in one plot on mobile; split them into separate compact charts unless the comparison itself is the primary task.

## TDS-Inspired Pattern Mapping

- `Top`: Use `AppHeader` for root screens and stack headers for deep screens. Header copy must be compact: small service label, large page title, and one right-side action.
- `ListRow`: Use for logs, goals, injuries, account details, and other repeated navigable items. Do not turn every row into a heavy card.
- `MetricPairList`: Use for dense detail metrics that need a single grouped surface with two columns per row and hairline dividers. Do not use separate mini cards when the metrics are peer facts in one section.
- `Button`: Primary is filled green, secondary is weak/neutral, danger is weak red unless the destructive action is inside a confirmation sheet.
- TDS-inspired tone should prefer grey-scale surfaces, weak/filled action hierarchy, and hairline-level dividers over visible boxed borders. Use background, spacing, typography, and subtle shadows to separate sections before adding borders.
- `TextField`: Use box-style inputs with persistent labels. iOS zoom prevention requires 16px or larger input text.
- `BottomSheet`: Use for selection and delete confirmation. It must be Teleported or root-hosted above all stacks.
- Bottom sheets must support drag-to-dismiss from the handle/header area. The drag gesture should only start from the sheet chrome so scrolling long sheet content remains stable.
- Selection bottom sheets should render options as compact rows inside one grouped surface with dividers. Avoid separate card styling for every option unless the option contains rich multi-line content.
- `Toast`: Bottom is default. Top is reserved for system/background events such as HealthKit sync.
- Top system toasts triggered during app startup or activation should use a small display delay so the page has painted before the drop animation starts.
- `Skeleton`: Metric cards, stat grids, coach threads, and repeated card/list surfaces must keep their final layout dimensions while loading. Do not replace the whole card or thread with a loading text or remove surfaces during fetch; keep labels/actions/current context visible and skeleton only the data/message area that is not available yet.
- `FixedBottomCTA`: Edit/create stack pages use a fixed full-width save CTA. Disable it until dirty state is true.
- `CoachMessage`: Assistant answers should feel like ChatGPT-style conversation, not a report card inside a large bordered box. Keep user input as a compact bubble, but render coach answers as open text with markdown structure, spacing, lists, and dividers.
- `StackPage`: Full-screen stack pages enter from right to left and leave with the exact reverse motion when back/close is pressed. Do not remove stack layers immediately without a leave transition. This is now a real shared component at `src/shared/ui/StackPage.vue` (#275) — use it instead of hand-rolling `memory-stack-layer/page/header/content` markup. It owns the Teleport + Transition, the header Back/Close icon button, `data-no-swipe`, and the optional `#footer` action bar. Transition is derived from `back` by default — entry (`back=false`) rises bottom-to-top with a top-right close X; forward drill-in (`back=true`) slides right-to-left with a left back arrow. The legacy class names are preserved verbatim so global CSS, App swipe-blocking, and RunDetailContent sticky offsets keep working.

## Prohibited Patterns

- Default browser button styling.
- Flat gray wireframe boxes.
- Table-first admin UI for ordinary user workflows.
- Large explanatory copy that describes how to use the interface inside the app.
- Heavy animation.
- Adding a CSS framework without a deliberate stack decision.
