# Upstream Editing and Failover Stability

- Task: `CXRG-UPSTREAM-EDIT-FAILOVER-2026-11-22`
- Repository: `AiaiJei/Cx-Routing-Gateway`
- Base: `master` at `75716847b8e308f53ae0a3284f74241373ea2aa4`
- Branch/worktree: `codex/upstream-service-edit` / `.worktree/upstream-service-edit`
- Date: 2026-11-22
- Status: implementation and fresh verification complete; independent review and dedicated PR creation pending
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
- Electron `main.cjs`, `preload.cjs`, and `upstream-edit-ipc.cjs` passed `node --check`.
- Contract JSON parsed successfully; `git diff --check` passed.
- No real third-party provider request was made.

## Limits and Follow-Up

- Visual inspection of the local browser preview is `NOT_RUN`: the preview tab opened, then Computer Use stopped because its URL safety verification could not authorize reading the page.
- Independent review and the dedicated PR are pending. No merge, release, deployment, branch deletion, or worktree cleanup is authorized by this task.
- Owner acceptance remains pending after the PR is available for review.

Detailed command evidence and the diagnosed test-fixture race are recorded in `docs/tasks/evidence/upstream-service-edit-failover/verification.md`.
