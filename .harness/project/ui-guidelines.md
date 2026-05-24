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
- Important metrics use large, bold numerals.
- Supporting labels and metadata are smaller and muted.
- Cards should have generous spacing, soft borders, and `--radius-card`.
- Primary actions use green emphasis; destructive actions are subdued red, not loud.
- Keep bottom navigation usable with one hand on mobile.
- Do not use native `<select>` for app workflows. Use `BottomSheetSelect`, opening options in a bottom sheet.

## Screen Priorities

- Dashboard: home screen, weekly/monthly distance, Easy ratio, hard session count, next recommended session, recent runs.
- Upload: simple HealthKit/FIT/manual import flow with large upload/import cards.
- Run Log: chronological cards, run type badges, distance/pace/HR summary, edit/delete actions.
- Memory: sectioned profile, goals, weekly routine, long-run strategy, injury/heat/style notes.
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
