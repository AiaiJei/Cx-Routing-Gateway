# Tray Close and Product README Design

## Intent

Make closing the Cx-Routing Gateway window keep the local gateway available in the Windows notification area, and replace the planning-oriented repository README with formal product documentation that shows the actual 1.1.1 application.

## Goals

- Closing the main window hides it and leaves the application and local runtime running.
- Clicking the tray icon restores and focuses the main window.
- The tray context menu offers opening the main window and fully exiting; exit stops the runtime before ending Electron.
- Set the desktop package version to `1.1.1` and keep the lockfile and Settings version display in sync.
- The root README describes version 1.1.1, core capabilities, supported release platform, and important operational limits in Chinese.
- Embed screenshots captured from the actual 1.1.1 application, not concept illustrations.

## Non-goals and constraints

- No new settings, minimize-to-tray toggle, startup-at-login behavior, backend changes, or installer/release changes.
- Keep Electron APIs in the main process; tray lifecycle logic should be testable without launching Electron.
- Do not replace existing user data or existing screenshot/evidence files.
- Build the dedicated PR from the merged PR #10 commit `db1e32512953ba4f31fe8b109c2d6ded6bb2c498`.
- Do not merge the new PR or publish another release.

## Approaches

1. **Close-to-tray with direct tray restore and context-menu exit (selected).** Closing hides the window; a normal tray click restores it, and the context menu exposes Open and Exit. This matches the requested behavior with the fewest steps.
2. **Tray icon opens a menu for both Open and Exit.** This is explicit but adds a menu step every time the user wants to return to the app.
3. **Minimize to tray while the close button exits.** This contradicts the request that closing the window should keep the program running, so it is excluded.

## Design

Keep `main.cjs` as the Electron composition root and move window/tray event wiring into a small injectable lifecycle module. The module receives Electron primitives and the runtime-stop callback, builds a tray from the existing product icon, hides on ordinary window close, restores/focuses on tray click or Open, and requests normal application quit from Exit. The existing `before-quit` path remains responsible for stopping the runtime exactly once before final process exit; `window-all-closed` must no longer implicitly quit the hidden application.

Replace the root README's mixed planning notes with a concise Chinese product overview, feature list, release/version and platform details, setup/use entry points, security/release caveats, and links to maintained project documentation. Add a small set of actual application screenshots under `docs/screenshots/` and embed them from the README.

## Evidence and acceptance

- Electron-independent lifecycle tests prove close-to-hide, tray restore/focus, Open, Exit, and one-time runtime stop.
- Existing Desktop and Runtime suites and production build pass; `git diff --check` passes.
- Desktop package/lock versions and the Settings version display all read `1.1.1`.
- Screenshots visibly come from the running 1.1.1 application and render correctly in the README.
- The dedicated PR is based on merged PR #10, targets `master`, and is not merged as part of this task.

## Rollback

Revert the task commit(s) from the feature branch. No data migration or release asset is involved. Keep the new PR open for owner review; do not delete the branch/worktree or merge without a separate request.

## Remaining implementation choices

- Add focused lifecycle tests beside the Runtime tests and use injected fakes for Electron primitives.
- Capture a landing/overview view and representative route/upstream screens from the actual running app; keep image dimensions suitable for repository documentation.
- Preserve the existing project documentation links while removing claims that conflict with the merged 1.1.0 implementation.
