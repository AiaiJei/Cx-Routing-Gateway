# Upstream Editing and Failover Stability

- Task: `CXRG-UPSTREAM-EDIT-FAILOVER-2026-11-22`
- Repository: `AiaiJei/Cx-Routing-Gateway`
- Base: `master` at `75716847b8e308f53ae0a3284f74241373ea2aa4`
- Branch/worktree: `codex/upstream-service-edit` / `.worktree/upstream-service-edit`
- Date: 2026-11-22
- Status: PR #18 merged; GitHub Release v1.1.5 published; Desktop Portable delivered; task worktree removed
- Contract: `docs/tasks/2026-11-22-upstream-edit-failover-contract.json`
- Design: `docs/superpowers/specs/2026-11-22-upstream-service-edit-failover-stability-design.md`

## Scope Delivered

- Added a prefilled edit dialog for existing upstream services. The API Key stays blank; leaving it blank keeps the active credential. Fixture mode edits are limited to the current page session.
- Routed live edits through the existing authenticated Local Control PATCH endpoint and a separately testable Electron IPC handler. The renderer receives no credential read operation.
- Preserved the existing private-network trust setting when an edit changes Base URL but omits `allowPrivateNetwork`.
- Made key rotation preserve the old credential until the new reference is persisted. Failed replacement or config writes leave the old secret usable.
- Updated Gateway circuit recovery so a late successful response heals the same target and invalidates older in-flight failures. Routing-relevant upstream edits refresh health state.
- Kept the configured failure threshold, status classes, cooldown, and current-request no-retry behavior unchanged.

## Verification

- Runtime: `npm test` from repository root, 146/146 passed after review-driven race and input-validation fixes.
- Desktop: `npm test` from `apps/desktop`, 158/158 passed.
- Desktop production build: `npm run build`, TypeScript and Vite passed.
- The concurrent late-success regression passed five consecutive focused runs and passed in the full runtime suite.
- The delayed blank-key edit/concurrent credential-rotation regression passed five consecutive focused runs; it confirms the active replacement secret remains usable.
- Independent review exposed a race where delayed DNS validation could overwrite a concurrently rotated key. Updates now merge against the latest stored upstream, remove only the credential reference they actually replaced, reject empty Base URLs, and revalidate the current URL when revoking private-network trust.
- Fresh read-only review of `75716847..f7041b9` confirmed those findings are resolved and reported no Critical, Important, or Minor findings. The reviewer did not rerun tests; verification evidence above is from the implementation run.
- Electron `main.cjs`, `preload.cjs`, and `upstream-edit-ipc.cjs` passed `node --check`.
- Contract JSON parsed successfully; `git diff --check` passed.
- No real third-party provider request was made.

## Release Authorization

- Latest stable GitHub Release and package/product/build metadata: `1.1.4`; authorized next patch: `1.1.5`.
- User authorized merging PR #18, fast-forwarding the primary `master` worktree, removing only `.worktree/upstream-service-edit`, publishing verified Windows x64 assets, and adding a new Desktop Portable 1.1.5 copy.
- The task branch and existing v1.1.4 release/Desktop file remain preserved. Release evidence and the execution plan will be recorded under `docs/tasks/evidence/upstream-service-edit-failover/release-1.1.5/`.

## Limits and Follow-Up

- Visual inspection of the local browser preview is `NOT_RUN`: the preview tab opened, then Computer Use stopped because its URL safety verification could not authorize reading the page.
- Independent review passed. PR #18 Runtime/Desktop CI passed at final head `0df656c` (package job skipped by its workflow condition); PR #18 was merged at `351693e61ee30ea52f590775a4c3d7fdceb27641`. The latest user instruction authorizes v1.1.5 release, Desktop delivery, and removal of only this task worktree. Branch deletion and unrelated worktree changes remain unauthorized.
- All explicitly authorized execution steps are complete. Final user review remains pending.

## Integration

- PR #18 merged on 2026-11-22 as `351693e61ee30ea52f590775a4c3d7fdceb27641`; the primary `master` worktree was fast-forwarded to the merge commit.
- Post-merge verification: Runtime 146/146, Desktop 158/158 across 23 files, and TypeScript/Vite production build passed.
- PR final-head GitHub Runtime and Desktop checks passed at `0df656c`; the package job was skipped by its workflow condition.

Detailed command evidence and the diagnosed test-fixture race are recorded in `docs/tasks/evidence/upstream-service-edit-failover/verification.md`.

## Version 1.1.5 Release

- Package/product/build metadata is 1.1.5. Fresh Runtime 146/146, Desktop 158/158, TypeScript/Vite build, and release-manifest checks passed on the primary `master` worktree.
- Windows x64 Setup, blockmap, Portable, and unpacked application artifacts were generated in `apps/desktop/release/1.1.5-final-reviewed/`. The verifier recorded 11 non-empty artifact hashes in `manifest.json`; unpacked version smoke and isolated Portable Local Control/Gateway health smoke passed.
- The manifest records `signed: false`; no signing certificate is configured. Full release, Desktop-copy, and cleanup evidence will be appended in `docs/tasks/2026-11-22-upstream-edit-failover-release.md`.
- GitHub Release v1.1.5 is published at `https://github.com/AiaiJei/Cx-Routing-Gateway/releases/tag/v1.1.5`; the tag points to the 1.1.5 version commit. GitHub asset names, sizes, and hashes were read back and matched the verified files.
- Portable 1.1.5 is on the Desktop at `C:\Users\20142\Desktop\Cx-Routing Gateway Portable 1.1.5.exe`; its size and hash match the release artifact, and isolated Local Control/Gateway health smoke passed. The 1.1.4 Desktop Portable remains unchanged.
- Final publication and delivery evidence is recorded in `docs/tasks/2026-11-22-upstream-edit-failover-release.md` and `docs/tasks/evidence/upstream-service-edit-failover/release-1.1.5/verification.md`.
- After recording and committing release evidence, the clean `.worktree/upstream-service-edit` was removed. The local and remote task branches remain; unrelated worktrees were preserved.
