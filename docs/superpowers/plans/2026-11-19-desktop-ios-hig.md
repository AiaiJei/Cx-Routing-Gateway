# Desktop Frontend iOS-Inspired Refinement Plan

**Goal:** Refine the PR #4 Desktop UI with semantic iOS-inspired color and controls, remove the sidebar title, and add SVG icons to all navigation destinations while preserving runtime-backed workflows.

**Architecture:** Keep PR #4's React/Vite/Electron runtime bridge, route structure, data clients, and CSS tokens. Add focused navigation-icon, protocol badge, segmented-control, and route-test dialog components. Electron invokes a route-scoped in-memory test method on the Gateway, preserving real auth/routing/logging while avoiding persistent test credentials.

**Spec:** `docs/superpowers/specs/2026-11-19-desktop-ios-hig-design.md`

## Tasks

1. **Add navigation icons and remove the sidebar title.** Update `AppShell.tsx`; add a focused icon component; update `AppShell.test.tsx` to verify six labeled SVG icons and absence of a sidebar brand link while the window title remains.
2. **Add semantic colors and shared control styling.** Update `tokens.css` and `app.css`; add a reusable `SegmentedControl.tsx` with accessible selected state and component tests; apply it to the log status filter and add consistent protocol/status classes where those values render.
3. **Add real route testing.** Add `RouteTestDialog.tsx`; add `testRoute` to the default workspace client and typed preload bridge; expose a route-scoped, expiring in-memory test credential from the Gateway server and call it through the Electron main process; cap real route tests at 10 per minute; add Gateway and component integration tests.
4. **Polish existing grouped surfaces.** Apply grouped row and modal/control treatments to current overview, settings, and shared dialogs; preserve responsive and reduced-motion behavior.
5. **Verify and review.** Run full Runtime and Desktop tests, `npm run build`, browser checks at desktop/narrow widths, `git diff --check`, and an independent diff review. Record any unavailable checks as `NOT_RUN`.

## Acceptance

- Sidebar contains no product/site title; all six destinations retain their labels and expose a corresponding decorative SVG icon.
- Keyboard navigation and status filtering work; focus is visible and selection is announced.
- Protocol/status hues are stable and paired with text; fixture and runtime availability wording is unchanged.
- A real route test is available only for enabled routes when the local runtime is active; the prompt is editable and initially `请回复OK`.
- The test request uses a temporary route-scoped credential that is not written to the config store and cannot call other routes.
- The dialog warns that real upstream requests may incur provider charges; the Gateway limits tests to 10 per minute and requested output to 256 tokens.
- Provider refusal text is displayed as a response rather than an empty-output fallback.
- Focus moves into the dialog, remains trapped there while open, and returns to the route action on close; dismissal is blocked while a request is pending.
- Failed Gateway calls retain HTTP status, request ID, and duration for correlation with usage logs.
- Tests and production build pass; responsive browser inspection is recorded.
