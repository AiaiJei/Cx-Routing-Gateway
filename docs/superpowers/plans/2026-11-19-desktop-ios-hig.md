# Desktop Frontend iOS-Inspired Refinement Plan

**Goal:** Refine the six-screen Desktop UI with semantic iOS-inspired color and controls, remove the sidebar title, and add SVG icons to all navigation destinations.

**Architecture:** Keep React/Vite, route structure, data clients, and CSS tokens. Add focused shared navigation-icon and segmented-control components, then apply semantic tokens to existing screens.

**Spec:** `docs/superpowers/specs/2026-11-19-desktop-ios-hig-design.md`

## Tasks

1. **Add navigation icons and remove the sidebar title.** Update `AppShell.tsx`; add a focused icon component; update `AppShell.test.tsx` to verify six labeled SVG icons and absence of a sidebar brand link while the window title remains.
2. **Add semantic colors and shared control styling.** Update `tokens.css` and `app.css`; add a reusable `SegmentedControl.tsx` with accessible selected state and component tests; apply it to the log status filter and add consistent protocol/status classes where those values render.
3. **Polish existing grouped surfaces.** Apply grouped row and modal/control treatments to current overview, settings, and shared dialogs without changing data or interactions; preserve responsive and reduced-motion behavior.
4. **Verify and review.** Run `npm test`, `npm run build`, browser checks at desktop/narrow widths, `git diff --check`, and an independent diff review. Record any unavailable checks as `NOT_RUN`.

## Acceptance

- Sidebar contains no product/site title; all six destinations retain their labels and expose a corresponding decorative SVG icon.
- Keyboard navigation and status filtering work; focus is visible and selection is announced.
- Protocol/status hues are stable and paired with text; fixture and runtime availability wording is unchanged.
- Tests and production build pass; responsive browser inspection is recorded.
