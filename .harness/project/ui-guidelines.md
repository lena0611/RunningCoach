# PaceLAB UI Guidelines

PaceLAB is a personal running coach app, not an admin dashboard.

## Product Feel

- Mobile-first.
- Follow iOS day/night appearance with `prefers-color-scheme`; dark remains the default visual baseline.
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
- Define theme values through CSS tokens. Add light-mode overrides in `@media (prefers-color-scheme: light)` instead of hard-coding one-off light colors.
- New colors should be added as semantic tokens or TDS-like scale tokens first. Do not scatter page-specific hex values across components.
- Typography must use a small set of shared scale tokens: display, title, body, caption, and metric. Avoid one-off font-size values in page components unless the component is genuinely unique.
- Light mode must be checked separately from dark mode. Buttons need explicit foreground contrast, and cards/nav should look clean white rather than washed-out green-gray.
- Important metrics use large, bold numerals.
- Metric units such as `km`, `%`, and `회` must render smaller than the number and should not be concatenated at the same visual size in compact cards.
- Supporting labels and metadata are smaller and muted.
- Cards should have generous spacing, soft borders, and `--radius-card`.
- Repeated list content should prefer a ListRow pattern over mini cards: primary title, muted detail, optional right metric/addon, and a clear press/action target.
- Compact repeated rows such as Run Log must use icon-only edit/delete actions with accessible labels. Do not use text buttons when the row has limited horizontal space.
- Primary actions use green emphasis; destructive actions are subdued red, not loud.
- Keep bottom navigation usable with one hand on mobile.
- Fixed mobile bottom navigation must use `viewport-fit=cover`, `env(safe-area-inset-bottom)`, a fixed nav height token, and matching `.app-main` bottom reserve. The nav should stay attached to the visual viewport before and after full scroll.
- Bottom navigation is icon-first. Labels stay under icons as small captions, not as the primary visual element.
- Bottom navigation must use explicit programmatic navigation through the router, not rely only on raw anchor default behavior. This keeps iOS WebView taps predictable.
- Main tabs support interactive horizontal pager navigation. During a swipe, the adjacent tab page should be visibly attached and move with the finger, not just route after release. Once horizontal intent is detected, vertical scrolling must be locked until release. Swipes should be disabled over text inputs, bottom sheets, side drawers, deep stack layers, and horizontally scrollable content so local gestures are not stolen by the root pager.
- Root tab navigation through the bottom nav resets the main scroll position to top. Deep in-tab stacks preserve the root surface and restore the previous stack page scroll on Back.
- Do not use native `<select>` for app workflows. Use `BottomSheetSelect`, opening options in a bottom sheet.
- `BottomSheetSelect` overlays must sit above screen stacks, fixed action bars, and side drawers. It must stop pointer/click propagation on the trigger and sheet so stack swipe/overlay handlers cannot swallow the tap. When adding stack/drawer/modal z-index layers, keep the common bottom sheet layer higher than those surfaces and destructive confirmation sheets higher than ordinary selection sheets.
- App date inputs must use the shared `DateField` wrapper instead of exposing native `input[type='date']` directly. The visible field must show the shared weekday format such as `2026-05-23(토)` while the hidden native input only provides the platform picker.
- Pace fields must display rounded `m:ss` values. Never show raw fractional seconds such as `7:13.2714718`.
- Account/profile management belongs in the header account drawer, not inside the `Memo` tab.
- The account drawer opens from right to left. Profile editing is a second right-to-left stack inside the drawer.
- Account-level settings live in the account drawer as a separate settings stack, opened by an icon-only gear action in the account header. Do not add global settings into tab pages.
- Theme settings are owned by `settingsStore`: `system` follows iOS appearance, while manual `light`/`dark` applies explicit `html.theme-light` or `html.theme-dark` classes. Future settings should extend this store or a sibling settings domain instead of scattering localStorage reads in components.

## Screen Stack Pattern

Use a screen stack when the user is drilling into a deeper flow without changing the main tab.

- A tab remains the root surface. Deeper screens slide over it instead of replacing the bottom tab context.
- First-level stack screens open from right to left and show only a close action in the top right.
- Second-level stack screens continue right-to-left inside the same stack container.
- Focused management flows such as Memory goal/injury list, create, and edit use a full-screen stack page, not an inner card section. Second-level or deeper stack headers show only Back on the left; Close is hidden because Back is the expected navigation affordance.
- Stack navigation must push pages onto an in-tab stack instead of replacing the root route. Back pops one stack page and restores that page's prior scroll/data state; Close exits the stack to the tab root.
- Nested stack transitions must be visible. When a stack page opens another detail/create/edit page, wrap the keyed page body in a right-to-left `Transition` instead of swapping conditional content in place.
- Stack headers use compact icon buttons to preserve title space on mobile. Titles are Korean-only, left aligned, and placed immediately to the right of Back when Back is present.
- Stack and drawer headers must use icon-only Back/Close buttons with accessible `aria-label`; do not show literal text buttons such as "뒤로" or "닫기" in header chrome.
- Edit/create stack pages use a fixed full-width bottom action bar for saving. Save is disabled until dirty state is detected.
- Destructive actions ask for confirmation in a bottom sheet, not `window.confirm`.
- Use stacks for account/profile editing, run detail/edit flows, and focused settings. Do not use a stack for ordinary tab-to-tab navigation.
- The bottom navigation remains a root-level control. Stack overlays sit above it when modal, or keep it visually stable when inline.
- Horizontal page slide transitions are for root tab movement. Deeper stack screens use their own right-to-left stack transition.

## Screen Priorities

- Dashboard: home screen, weekly/monthly distance, Easy ratio, hard session count, next recommended session, recent runs.
- Dashboard hero copy must not imply measured physiology unless the app has measured it. Use clear labels like "훈련 요약" instead of ambiguous labels like "오늘의 컨디션".
- Dashboard and Coach must surface the active goal and active injury context near the top. The user should not have to infer which goal or restriction the recommendation used.
- Upload: simple HealthKit/FIT/manual import flow with large upload/import cards.
- Run Log: chronological cards, run type badges, distance/pace/HR summary, edit/delete actions.
- Memory: training context only: goal management, injury management, AI-managed weekly routine, long-run strategy, heat/style notes. Do not mix account registration controls into this screen. Weekly routine is shown as AI-managed context, not as a freeform user-authored plan.
- Memory goal and injury management must use separated flows: overview card -> list -> edit or new item screen. Do not place active selection, edit fields, creation fields, and full lists in one long mixed form.
- Memory overview should summarize the current coaching basis first, then provide drill-in cards for goal and injury management. Deep edit fields belong only on focused edit/create screens.
- Coach: chat-like user and coach messages, markdown rendered as readable headings, paragraphs, lists, code blocks, and dividers.
- User-facing dates must include the weekday, e.g. `2026-05-24(일)`. Store raw ISO dates in data, but format every displayed date through the shared formatter.
- Metric values with units must use `UnitValue` or an equivalent shared pattern. Units are inline flow content, never absolutely positioned, and must stay smaller than the number without overlapping at mobile widths.
- Toast messages must use the shared toast store and `ToastHost` component. Feature stores/pages should call the shared toast API instead of keeping one-off toast state or rendering inline toast markup. Default placement is bottom with a rise animation. System/background events such as HealthKit sync use top placement with a drop animation and stronger success/error colors.

## Component Rules

Prefer shared UI components in `src/shared/ui`:

- `AppShell`
- `AppHeader`
- `PageLayout`
- `ContentStack`
- `SectionHeader`
- `ActionGroup`
- `FormGrid`
- `BottomNav`
- `StatCard`
- `SectionCard`
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

Common display components should not decide how much page space they receive. Page-level spacing, grids, stacks, section headers, action rows, and forms must be owned by layout components such as `PageLayout`, `ContentStack`, `SectionHeader`, `ActionGroup`, and `FormGrid`.

Charts should use `TrendChart` and ECharts unless there is a specific reason to add another chart primitive. Keep chart libraries lazy-loaded or page-split so the root app chunk does not grow unnecessarily. Chart y-axis domains must go through the shared metric-domain helper rather than raw `dataMin`/`dataMax`; heart rate, pace, cadence, elevation, temperature, distance, percent, and count charts need metric-specific padding and minimum spans so normal variation is not visually exaggerated. Do not overlay unrelated units such as pace, heart rate, and cadence in one plot on mobile; split them into separate compact charts unless the comparison itself is the primary task.

## TDS-Inspired Pattern Mapping

- `Top`: Use `AppHeader` for root screens and stack headers for deep screens. Header copy must be compact: small service label, large page title, and one right-side action.
- `ListRow`: Use for logs, goals, injuries, account details, and other repeated navigable items. Do not turn every row into a heavy card.
- `Button`: Primary is filled green, secondary is weak/neutral, danger is weak red unless the destructive action is inside a confirmation sheet.
- TDS-inspired tone should prefer grey-scale surfaces, weak/filled action hierarchy, and hairline-level dividers over visible boxed borders. Use background, spacing, typography, and subtle shadows to separate sections before adding borders.
- `TextField`: Use box-style inputs with persistent labels. iOS zoom prevention requires 16px or larger input text.
- `BottomSheet`: Use for selection and delete confirmation. It must be Teleported or root-hosted above all stacks.
- Selection bottom sheets should render options as compact rows inside one grouped surface with dividers. Avoid separate card styling for every option unless the option contains rich multi-line content.
- `Toast`: Bottom is default. Top is reserved for system/background events such as HealthKit sync.
- Top system toasts triggered during app startup or activation should use a small display delay so the page has painted before the drop animation starts.
- `FixedBottomCTA`: Edit/create stack pages use a fixed full-width save CTA. Disable it until dirty state is true.
- `CoachMessage`: Assistant answers should feel like ChatGPT-style conversation, not a report card inside a large bordered box. Keep user input as a compact bubble, but render coach answers as open text with markdown structure, spacing, lists, and dividers.
- `StackPage`: Full-screen stack pages enter from right to left and leave with the exact reverse motion when back/close is pressed. Do not remove stack layers immediately without a leave transition.

## Prohibited Patterns

- Default browser button styling.
- Flat gray wireframe boxes.
- Table-first admin UI for ordinary user workflows.
- Large explanatory copy that describes how to use the interface inside the app.
- Heavy animation.
- Adding a CSS framework without a deliberate stack decision.
