# RunContext UI Guidelines

RunContext is a personal running coach app, not an admin dashboard.

## Product Feel

- Mobile-first.
- Follow iOS day/night appearance with `prefers-color-scheme`; dark remains the default visual baseline.
- The visual target is between Apple Fitness, Strava, and a ChatGPT coaching card.
- Primary screens should feel like a running app: strong metrics, card-based summaries, and readable coaching text.
- Avoid wireframe/admin-table layouts unless debugging.

## Visual Rules

- Use CSS design tokens from `src/app/styles.css`.
- Define theme values through CSS tokens. Add light-mode overrides in `@media (prefers-color-scheme: light)` instead of hard-coding one-off light colors.
- Light mode must be checked separately from dark mode. Buttons need explicit foreground contrast, and cards/nav should look clean white rather than washed-out green-gray.
- Important metrics use large, bold numerals.
- Supporting labels and metadata are smaller and muted.
- Cards should have generous spacing, soft borders, and `--radius-card`.
- Primary actions use green emphasis; destructive actions are subdued red, not loud.
- Keep bottom navigation usable with one hand on mobile.
- Fixed mobile bottom navigation must use `viewport-fit=cover`, `env(safe-area-inset-bottom)`, a fixed nav height token, and matching `.app-main` bottom reserve. The nav should stay attached to the visual viewport before and after full scroll.
- Bottom navigation is icon-first. Labels stay under icons as small captions, not as the primary visual element.
- Do not use native `<select>` for app workflows. Use `BottomSheetSelect`, opening options in a bottom sheet.
- Account/profile management belongs in the header account drawer, not inside the `Memo` tab.
- The account drawer opens from right to left. Profile editing is a second right-to-left stack inside the drawer.

## Screen Stack Pattern

Use a screen stack when the user is drilling into a deeper flow without changing the main tab.

- A tab remains the root surface. Deeper screens slide over it instead of replacing the bottom tab context.
- First-level stack screens open from right to left and include an explicit close/back action in the top right.
- Second-level stack screens continue right-to-left inside the same stack container.
- Use stacks for account/profile editing, run detail/edit flows, and focused settings. Do not use a stack for ordinary tab-to-tab navigation.
- The bottom navigation remains a root-level control. Stack overlays sit above it when modal, or keep it visually stable when inline.

## Screen Priorities

- Dashboard: home screen, weekly/monthly distance, Easy ratio, hard session count, next recommended session, recent runs.
- Upload: simple HealthKit/FIT/manual import flow with large upload/import cards.
- Run Log: chronological cards, run type badges, distance/pace/HR summary, edit/delete actions.
- Memory: training context only: goals, weekly routine, long-run strategy, injury/heat/style notes. Do not mix account registration controls into this screen.
- Coach: chat-like user and coach messages, markdown rendered as readable headings, paragraphs, lists, code blocks, and dividers.

## Component Rules

Prefer shared UI components in `src/shared/ui`:

- `AppShell`
- `AppHeader`
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

New page work should reuse these before adding page-specific layout.

## Prohibited Patterns

- Default browser button styling.
- Flat gray wireframe boxes.
- Table-first admin UI for ordinary user workflows.
- Large explanatory copy that describes how to use the interface inside the app.
- Heavy animation.
- Adding a CSS framework without a deliberate stack decision.
