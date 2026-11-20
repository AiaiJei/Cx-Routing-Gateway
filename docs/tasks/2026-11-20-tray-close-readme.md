# Tray Close and README Task

- Task: `CXRG-TRAY-README-2026-11-20` / project `Cx-Routing Gateway` / repository `AiaiJei/Cx-Routing-Gateway`.
- Base: merged PR #10, commit `db1e32512953ba4f31fe8b109c2d6ded6bb2c498`.
- Worktree: `.worktree/tray-close-readme`; branch: `codex/tray-close-readme`.
- Pull request: [#11](https://github.com/AiaiJei/Cx-Routing-Gateway/pull/11), merged into `master` at `ba4ad680485fc8001169b88557a42acda3d7246a`.
- Scope revisions: desktop package/lock version changed to `1.1.1`; the user later authorized publishing `v1.1.1` and placing the portable app on Desktop.
- Design and implementation plan: `docs/superpowers/specs/2026-11-20-tray-close-readme-design.md` and `docs/superpowers/plans/2026-11-20-tray-close-readme.md`.

## Changes

- Closing the main window hides it to the system tray. Clicking the tray icon or choosing Open shows/focuses the window; Exit calls `app.quit()` and uses the existing `before-quit` handler to stop the runtime.
- Desktop package metadata, lockfile and Settings display are synchronized to `1.1.1`. The release manifest test derives expected artifact names from the package version.
- Replaced the planning-oriented root README with Chinese product documentation and three screenshots from the local 1.1.1 renderer using read-only repository fixtures.
- Added a repository-root ignore rule for the designated `.worktree/` container.
- Added immediate update-check feedback, duplicate-request prevention, and a missing-token action that focuses the credential field.

## Verification

- Tray lifecycle tests: 9/9, including second-instance and activation registration; full Runtime suite: 111/111.
- Desktop suite: 135/135; Settings tests: 12/12; update-check feedback regression passed RED/GREEN; production TypeScript/Vite build passed.
- Update-check regression asserts immediate live status, pending button lockout, clear missing-token explanation, and token-field focus action.
- PR #11 includes this update-feedback fix at `81d59dd`; Runtime and Desktop CI passed on head `b94e9d56`, while the package job was skipped by the PR workflow condition.
- README local links, screenshot files, synchronized version metadata, `.worktree/` ignore rule and `git diff --check` passed.
- Electron main/tray modules pass `node --check`.
- Screenshots are 1440x980. Capture source, fixture-mode limitation, and SHA-256 values are in `docs/tasks/evidence/tray-close-readme/screenshots.json`.
- Native Electron tray interaction is `NOT_RUN`: `C:\Users\20142\.npmrc` permits dependency install scripts only for `@opencode/cli`, so the Electron executable was unavailable. The user-level npm policy was left unchanged; tray behavior is covered by the Electron-independent lifecycle tests.
- Independent review found one Important coverage gap in main-process event wiring. Three tests were observed failing before implementation and passing afterward; no Critical/security or Minor findings were reported. The inline workflow did not dispatch a second review.
- GitHub Runtime and Desktop CI passed on PR #11; the package job was skipped for pull requests by workflow condition.
- PR #11 is merged and primary `master` is synchronized with `origin/master`.
- Release `v1.1.1` was published; installer/portable hashes, smoke and Desktop-copy evidence are in `docs/tasks/evidence/release-1.1.1/`.
- Known limitation: GitHub's uploaded setup asset name uses periods where the local updater expects spaces, so in-app update from 1.1.0 may report a missing installer. Direct Release download works; no existing published asset/tag was rewritten.
- GitHub canonicalizes spaces in uploaded release asset names to periods, while the shipped updater currently expects spaces. Existing 1.1.0 clients may need to download the 1.1.1 installer/portable asset directly; updater repair requires a follow-up build. The published release/tag was not rewritten.

## Integration Boundary

PR #11 and Release `v1.1.1` were completed under the user's explicit requests. The task worktree and branch are preserved for traceability.
