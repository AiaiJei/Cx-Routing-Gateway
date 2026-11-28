# Desktop 2.0 Route Pages Implementation Plan

> **Execution mode:** Inline execution in the existing task worktree. Preserve all previously staged overview work.

**Goal:** Complete the approved Desktop 2.0 visual refresh for the six routes that still use the old page layouts.

**Architecture:** Keep the shared AppShell, sidebar, navigation groups, icons and breadcrumb. Add a route-scoped stylesheet and small page-root classes; reuse the existing React components, workspace data, controls and state transitions. Do not change APIs, persistence, route behavior or fixture/live semantics.

**Tech Stack:** React 18, TypeScript, CSS, Vitest, Vite, Chromium browser inspection.

**Spec:** `docs/tasks/desktop2-overview-contract.json` (revision 2).

## Global Constraints

- Keep the 224px sidebar, its groups, order and icons, plus the existing breadcrumb/top bar.
- Preserve existing actions, validation, loading/error/empty states, API calls, credential masking and protocol meaning.
- Use existing CSS tokens and Geist fonts; use status/protocol colors only where they encode real data.
- Do not add dependencies, invented statistics, fixture values, backend changes, version changes, packaging or release work.
- Keep tests and evidence in the existing task worktree and preserve all unrelated dirty files.

---

## Confirmed Page Composition

- Upstreams: service identity and connection state lead each row; search, add/edit/test/delete stay where operators can reach them.
- Routes: make the existing inbound protocol → unified model → upstream/outbound protocol → response protocol relationship scan as one flow; preserve the current route form and test dialog.
- Credentials: keep masked previews and lifecycle status prominent, with the local Gateway endpoint as the clear client setup detail.
- Request Logs: keep search/status/date controls together above a dense investigation table; retain the existing detail and clear-confirmation dialogs.
- Codex: organize the existing mode tabs, activation state and configuration details into one readable configuration workspace; do not change mode or activation behavior.
- Settings: separate Gateway settings, Desktop update settings and protocol terminology into clearly titled sections; keep every existing save/check action.

Every page gets its own hierarchy; do not add a repeated KPI-card row or decorative data.

## Task 1: Expand the contract and plan

**Files:** `.codex/awg-task.json`, `.codex/codex-awg-task-contracts/CXRG-DESKTOP2-OVERVIEW.json`, `docs/tasks/desktop2-overview-contract.json`, `docs/tasks/desktop2-overview-plan.md`.

- [x] Record the Owner’s approval to include the six remaining pages.
- [x] Add the six page components, their existing tests, the new route stylesheet and its entry import to revision 2 scope.
- [x] Verify every planned source path appears in the active revision 2 contract.
- [ ] AWG MCP `scope_check`: NOT_RUN because the current tool set does not expose the AWG namespace; no code paths are written until local scope matching passes.

## Task 2: Build the route-scoped style layer

**Files:** `apps/desktop/src/main.tsx`, `apps/desktop/src/styles/desktop2-routes.css`.

- [x] Import the new stylesheet after the existing route styles.
- [x] Add styles under explicit route root classes only; do not change global shell or shared tokens.
- [x] Use aligned labels, restrained separators, readable row density and clear state/action hierarchy.
- [x] Add responsive rules so controls wrap or stack without hiding actions at 1024px and 390px.

## Task 3: Refine the six route roots without changing behavior

**Files:** `apps/desktop/src/pages/UpstreamsPage.tsx`, `RoutesPage.tsx`, `CredentialsPage.tsx`, `LogsPage.tsx`, `CodexPage.tsx`, `SettingsPage.tsx` and their existing `*.test.tsx` files if accessible semantics need adjustment.

- [x] Add the route-specific root class and rearrange only presentation markup needed by the approved composition.
- [x] Preserve each page’s existing controls, labels, form fields, dialogs, feedback roles, data source and event handlers.
- [x] Keep existing tests intact unless an accessible structure changes; never weaken behavior assertions to accommodate styling.

## Task 4: Verify page behavior and compilation

- [x] Run the six focused page test files (106/106 pass).
- [x] Run all Desktop tests with `npm test` from `apps/desktop` (43 files, 374/374 pass).
- [x] Run `npm run build` from `apps/desktop` (PASS).
- [x] Run the repository-root `npm test` runtime suite (531/531 pass).

## Task 5: Inspect actual rendered pages

- [x] Run the app from the task worktree and visit each of the six routes.
- [x] Inspect all six routes at 1600px, 1440px, 1024px and 390px (24 combinations; no page-level overflow).
- [x] Exercise representative existing controls: upstream add dialog, route-family filter, credential demo action and masking, log detail, and Codex tabs. Settings was inspected without invoking network update checks.
- [x] Save browser results at `docs/tasks/evidence/desktop2-overview/route-pages-verification.json`. Route screenshots were captured in the browser tool output but could not be saved as repository image files with the available API. Live runtime remains `NOT_RUN`.

## Task 6: Review and prepare the dedicated PR

- [x] Self-review the complete diff against revision 2 scope and preserve the staged overview batch; separate independent review remains `NOT_RUN` in this execution.
- [x] Run a whitespace check scoped to this task’s changed source and document files.
- [ ] Commit and push the completed task branch, then open the dedicated Desktop 2.0 PR to `master`.
- [ ] Do not merge, publish a release, bump versions, package a Desktop build, delete worktrees or alter running Desktop data/processes.

## Evidence and rollback

`docs/tasks/evidence/desktop2-overview/route-pages-verification.json` records focused/Desktop/runtime tests, build, route and viewport results, interactions, and review status. Browser screenshots were visually inspected in the task output; the available browser-control tool could not save screenshot bytes into the repository. Live runtime and independent review remain `NOT_RUN`.

The approved overview screenshots remain evidence for the overview only. Record route screenshots, test/build output, browser results and review separately. Roll back only this task’s route changes or close its PR; preserve the existing overview changes, `master`, other worktrees, unrelated files, running processes and user data.
