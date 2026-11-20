# Tray Close and Product README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Cx-Routing Gateway running in the notification area after its window closes, and publish a formal README with screenshots from the 1.1.1 application.

**Architecture:** Keep `main.cjs` as the Electron composition root and put injectable tray/window event wiring in `tray-lifecycle.cjs`. Keep the existing trusted renderer IPC and `before-quit` runtime shutdown path; tray Exit calls `app.quit()` so that path stops the local runtime. Replace the root README with Chinese product documentation and embed screenshots captured from the running app.

**Tech Stack:** Electron 45, Node.js built-in test runner, React/Vite desktop renderer, Markdown and PNG screenshots.

**Spec:** `docs/superpowers/specs/2026-11-20-tray-close-readme-design.md`

## Global Constraints

- Base the branch on merged PR #10 commit `db1e32512953ba4f31fe8b109c2d6ded6bb2c498`.
- Set desktop package/lock/Settings display version to `1.1.1`.
- Closing the window hides it and leaves the app and local runtime alive.
- Tray click restores and focuses the main window; tray menu offers Open and Exit.
- Tray Exit uses the existing `before-quit` runtime shutdown path.
- Keep Electron APIs in the main process and preserve trusted IPC boundaries.
- Document the `1.1.1` product and actual supported/verified platform; do not claim unverified support.
- Screenshots must come from the actual running application and must not replace existing concept/evidence images.
- Create a dedicated PR targeting `master`; do not merge it or publish a release.

## Review Focus

- Close-to-tray must not stop the runtime or destroy the only window; cover close event prevention and hide behavior in Task 1.
- Tray click and Open must handle hidden, minimized, and already-visible windows without creating duplicates; cover restoration/focus in Task 1.
- Tray Exit must reach the existing shutdown path; cover the `app.quit()` action in Task 1 and verify runtime health ends only after exit during manual app validation.
- Existing single-instance and macOS activation behavior must still surface the main window; cover the second-instance restoration and activation path in Task 1.
- Package-version changes must not leave the release verifier fixture pinned to older artifact names; derive fixture paths from package metadata in Task 2.
- README screenshots and links must exist in the branch and accurately show the 1.1.1 UI; check all references and inspect captured images in Task 2.

## File Structure

- `apps/desktop/electron/tray-lifecycle.cjs`: injectable tray creation, window hide/restore/focus, and tray menu actions.
- `apps/desktop/electron/main.cjs`: compose the tray lifecycle, wire each created window, route activate/second-instance to the existing window, and remove automatic quit when all windows are hidden.
- `tests/runtime/tray-lifecycle.test.mjs`: Electron-free behavior tests using fake EventEmitter-based Electron primitives.
- `apps/desktop/package.json`, `apps/desktop/package-lock.json`, `apps/desktop/src/pages/SettingsPage.test.tsx`: patch version metadata and display assertion for `1.1.1`.
- `tests/runtime/release-manifest.test.mjs`: derive expected artifact names from the package version so the release verifier regression tracks the version bump.
- `.gitignore`: ignore the repository-local `.worktree/` container so linked worktrees do not appear as untracked project content.
- `README.md`: product overview, version/platform, features, operation, security and release limits, and embedded screenshots.
- `docs/screenshots/overview.png`, `docs/screenshots/routes.png`, `docs/screenshots/settings.png`: actual application captures embedded in the README.
- `.codex/awg-task.json`, `docs/tasks/2026-11-20-tray-close-readme.md`, `docs/tasks/evidence/tray-close-readme/`: task contract, progress/verification record, and evidence.

---

### Task 1: Tray Window Lifecycle

**Files:**
- Create: `apps/desktop/electron/tray-lifecycle.cjs`
- Modify: `apps/desktop/electron/main.cjs`
- Test: `tests/runtime/tray-lifecycle.test.mjs`

**Interfaces:**
- `installTrayLifecycle({ app, BrowserWindow, Tray, Menu, iconPath, shouldQuit })` creates one tray and returns `{ attachWindow(window), showMainWindow() }`.
- `attachWindow(window)` hides on ordinary close by calling `preventDefault()` then `hide()`; when `shouldQuit()` is true, it lets the window close.
- Tray click and the Open menu item restore a minimized window if needed, then show and focus it; Exit calls `app.quit()`.
- `main.cjs` creates the lifecycle after Electron is ready, attaches each created window, and keeps runtime shutdown in the existing `before-quit` handler.

- [x] Write tests for close-to-hide, close during quit, tray-click restore/focus, Open restore/focus, Exit calling `app.quit()`, and no duplicate tray/window creation.
- [x] Run `node --test tests/runtime/tray-lifecycle.test.mjs`; confirm failure because the lifecycle module does not exist.
- [x] Implement the injected tray lifecycle and wire it from `main.cjs`; remove `window-all-closed` auto-quit and make app activation/second-instance show the existing hidden window.
- [x] Run `node --test tests/runtime/tray-lifecycle.test.mjs` and `npm test`; expect focused lifecycle tests and the full Runtime suite to pass.
- [x] Build the Desktop renderer with `npm --prefix apps/desktop run build` to catch packaging/type regressions.
- [x] Commit the lifecycle module, main-process wiring, and focused test as `fix: keep desktop gateway running in tray` (`3ba5352`).

### Task 2: Product README and Screenshots

**Files:**
- Modify: `README.md`
- Modify: `apps/desktop/package.json`, `apps/desktop/package-lock.json`, `apps/desktop/src/pages/SettingsPage.test.tsx`
- Modify: `tests/runtime/release-manifest.test.mjs`
- Create: `docs/screenshots/overview.png`, `docs/screenshots/routes.png`, `docs/screenshots/settings.png`

**Interfaces:**
- README embeds screenshots using relative paths under `docs/screenshots/` and identifies the product release as `1.1.1`.
- Screenshots are captured from the running application, are legible at README display width, and contain no credentials or personal data.

- [x] Change the Settings version assertion to `1.1.1`; run the focused Settings test and confirm it fails against the current `1.1.0` package version.
- [x] Update `apps/desktop/package.json` and the two root package records in `apps/desktop/package-lock.json` to `1.1.1`; run the focused Settings test and confirm it passes.
- [x] Update the release manifest fixture to derive installer/portable names from `package.json`; the initial full Runtime run exposed the stale `1.1.0` fixtures after the version bump.
- [x] Launch the 1.1.1 renderer with isolated fixture data and capture overview, routes, and settings screens.
- [x] Inspect the screenshots for correct rendering, legible text, and absence of secrets or unrelated desktop content.
- [x] Rewrite the root README in formal Chinese with version 1.1.1, verified platform, core capabilities/features, run/package entry points, actual screenshot embeds, and material security/release limits.
- [x] Check every README image/link target exists and inspect all three screenshot files.
- [ ] Commit the version metadata, verifier fixture, README, and screenshot assets as `docs: publish 1.1.1 product README and screenshots`.

### Task 3: Verification, Evidence, and Dedicated PR

**Files:**
- Modify: `.gitignore`, `.codex/awg-task.json`
- Create: `docs/tasks/2026-11-20-tray-close-readme.md`, `docs/tasks/evidence/tray-close-readme/`

- [x] Add `.worktree/` to `.gitignore`; verify the ignore rule with `git check-ignore`.
- [x] Run `npm test` (108/108), `npm --prefix apps/desktop test -- --run` (134/134), `npm --prefix apps/desktop run build`, and `git diff --check`.
- [x] Attempt native Electron verification; record `NOT_RUN` because the user-level npm policy only permits `@opencode/cli` install scripts and no Electron binary is present.
- [x] Update the contract and task evidence with completed scope, test results, screenshot paths, owner-acceptance state, and capability gaps.
- [ ] Commit `.gitignore`, task contract, plan and evidence as `docs: record tray and README verification`.
- [ ] Perform a fresh whole-branch code review against the spec and Review Focus; fix Critical/Important findings test-first and record any deferred Minor findings.
- [ ] Commit and push the task branch, create the dedicated PR against `master`, and confirm its head/base and CI state. Do not merge.
