# Tray Close and README Task

- Task: `CXRG-TRAY-README-2026-11-20` / project `Cx-Routing Gateway` / repository `AiaiJei/Cx-Routing-Gateway`.
- Base: merged PR #10, commit `db1e32512953ba4f31fe8b109c2d6ded6bb2c498`.
- Worktree: `.worktree/tray-close-readme`; branch: `codex/tray-close-readme`.
- Pull request: [#11](https://github.com/AiaiJei/Cx-Routing-Gateway/pull/11), open against `master`, head at creation `2bcf6fc42d98dd21224b6164d8e01b540f53e69c`.
- Scope revision: desktop package and lockfile version changed to `1.1.1` at the user's request. The GitHub Release currently published is `v1.1.0`; this task does not publish a release.
- Design and implementation plan: `docs/superpowers/specs/2026-11-20-tray-close-readme-design.md` and `docs/superpowers/plans/2026-11-20-tray-close-readme.md`.

## Changes

- Closing the main window hides it to the system tray. Clicking the tray icon or choosing Open shows/focuses the window; Exit calls `app.quit()` and uses the existing `before-quit` handler to stop the runtime.
- Desktop package metadata, lockfile and Settings display are synchronized to `1.1.1`. The release manifest test derives expected artifact names from the package version.
- Replaced the planning-oriented root README with Chinese product documentation and three screenshots from the local 1.1.1 renderer using read-only repository fixtures.
- Added a repository-root ignore rule for the designated `.worktree/` container.

## Verification

- Tray lifecycle tests: 9/9, including second-instance and activation registration; full Runtime suite: 111/111.
- Desktop suite: 134/134; Settings version test: 11/11; production TypeScript/Vite build passed.
- README local links, screenshot files, synchronized version metadata, `.worktree/` ignore rule and `git diff --check` passed.
- Electron main/tray modules pass `node --check`.
- Screenshots are 1440x980. Capture source, fixture-mode limitation, and SHA-256 values are in `docs/tasks/evidence/tray-close-readme/screenshots.json`.
- Native Electron tray interaction is `NOT_RUN`: `C:\Users\20142\.npmrc` permits dependency install scripts only for `@opencode/cli`, so the Electron executable was unavailable. The user-level npm policy was left unchanged; tray behavior is covered by the Electron-independent lifecycle tests.
- Independent review found one Important coverage gap in main-process event wiring. Three tests were observed failing before implementation and passing afterward; no Critical/security or Minor findings were reported. The inline workflow did not dispatch a second review.
- GitHub Runtime and Desktop CI passed on PR #11 head `1d276a88`; the package job was skipped for pull requests by workflow condition. Owner acceptance remains pending.

## Integration Boundary

The task is authorized to push the dedicated branch and create a PR against `master`. Merging the PR and publishing version `1.1.1` remain out of scope.
