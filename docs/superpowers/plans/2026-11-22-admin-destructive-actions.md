# Admin Actions and Focus States Implementation Plan

> **For agentic workers:** Use the inline execution method selected by the user. Complete tasks in order and keep each task's test cycle and evidence in the task ledger.

**Goal:** Make local admin deletion and log clearing reliable, simplify two focused fields, and deliver the verified 1.1.4 Portable build.

**Architecture:** Keep destructive operations in the authenticated local-control API and preserve the existing Electron IPC boundary. Serialize reference validation with config mutations, expose explicit results to the renderer, and keep fixture mode non-destructive. Package the resulting UI/runtime with matching 1.1.4 metadata and copy only the smoke-tested Windows x64 Portable executable to the Desktop.

**Tech Stack:** Node.js `node:test`, React, TypeScript, Vitest, Electron IPC, Vite, electron-builder, PowerShell.

**Spec:** `docs/superpowers/specs/2026-11-22-admin-destructive-actions-design.md`

## Global Constraints

- Do not change the config schema or add dependencies.
- Preserve `DELETE /client-keys/:id` as revoke; permanent deletion uses `DELETE /client-keys/:id/permanent`.
- Block upstream deletion for all referencing routes, enabled or disabled, and list route details.
- Keep confirmations for irreversible log clear and permanent key deletion.
- Keep fixture-mode destructive actions unavailable.
- Change only the requested request-log and credential-scope focus rings.
- Set package/product/build metadata to `1.1.4`; do not publish a GitHub Release.
- Preserve Desktop Portable `1.1.3` and all unrelated worktrees/untracked files.

## Review Focus

- A route may reference an upstream through either legacy `upstreamId` or `targets`, including while disabled.
- Concurrent route creation/update and upstream deletion must leave no dangling reference.
- Log clear must ignore UI filters, report the removed count, and allow later requests to be logged.
- Permanent deletion must remove active and revoked keys while revoke remains compatible.
- Failed UI operations must preserve rows and display a useful error; fixture mode must not call destructive APIs.
- Keyboard focus must remain visible with one accent indicator at each targeted field.
- Package, product, builder, verifier, and copied artifact versions/hashes must agree.

---

### Task 1: Serialized Runtime Actions

**Files:**
- Modify: `services/local-control/src/server.mjs`
- Test: `tests/runtime/control-server.test.mjs`

**Interfaces:**
- `DELETE /v1/control/logs` returns `{ deleted: true, removedCount: number }` and atomically clears `usage`.
- `DELETE /v1/control/client-keys/:id/permanent` returns `{ id, deleted: true }`; existing `DELETE /v1/control/client-keys/:id` keeps returning revoked state.
- A blocked `DELETE /v1/control/upstreams/:id` returns HTTP 409 with `{ error: "upstream_in_use", routes: [{ id, alias, inboundProtocol }] }`.
- Route create/update validate every upstream reference inside the same `store.update` mutation that writes the route.

- [ ] Add failing API tests for clear count/persistence, permanent-vs-revoke behavior, enabled/disabled legacy/target references, and serialized route/delete races.
- [ ] Run `node --test tests/runtime/control-server.test.mjs`; confirm the new assertions fail against current behavior.
- [ ] Implement the three operations and move route reference checks into serialized updates.
- [ ] Run `node --test tests/runtime/control-server.test.mjs`; all tests pass.
- [ ] Commit as `feat: add reliable local admin actions`.

### Task 2: Electron and Workspace Client

**Files:**
- Modify: `apps/desktop/electron/main.cjs`
- Modify: `apps/desktop/electron/preload.cjs`
- Modify: `apps/desktop/src/window.d.ts`
- Modify: `apps/desktop/src/data/workspace-client.ts`
- Test: `apps/desktop/src/data/workspace-client.test.ts`

**Interfaces:**
- Expose `clearRequestLogs()`, `permanentlyDeleteClientKey(id)`, and a typed `deleteUpstream(id)` result through preload and `WorkspaceClient`.
- The upstream-delete result distinguishes success from `{ deleted: false, error, routes }` so IPC preserves dependency details without relying on serialized thrown-error properties.

- [ ] Add failing runtime-client tests for command forwarding and structured upstream dependency results.
- [ ] Run `npm --prefix apps/desktop test -- --run src/data/workspace-client.test.ts`; confirm the new assertions fail.
- [ ] Add the IPC handlers, preload methods, types, and runtime-client forwarding.
- [ ] Run the focused workspace-client tests and `npm --prefix apps/desktop run build`; both pass.
- [ ] Commit as `feat: expose destructive runtime commands to desktop`.

### Task 3: Admin Page Confirmations and Feedback

**Files:**
- Modify: `apps/desktop/src/pages/LogsPage.tsx`
- Modify: `apps/desktop/src/pages/CredentialsPage.tsx`
- Modify: `apps/desktop/src/pages/UpstreamsPage.tsx`
- Test: corresponding `LogsPage.test.tsx`, `CredentialsPage.test.tsx`, and `UpstreamsPage.test.tsx`

**Interfaces:**
- Logs show a live-runtime-only clear action; confirm all retained logs are removed regardless of filters, report the count, and refresh after success.
- Credentials show a live-runtime-only permanent delete action separate from revoke; keep the row on cancellation or failure.
- Upstream delete confirms first, shows dependent route aliases returned by the API, keeps blocked rows, and refreshes only after successful deletion.

- [ ] Add failing page tests for confirm/cancel/success/failure on all three operations and fixture-mode absence of destructive actions.
- [ ] Run `npm --prefix apps/desktop test -- --run src/pages/LogsPage.test.tsx src/pages/CredentialsPage.test.tsx src/pages/UpstreamsPage.test.tsx`; confirm new assertions fail.
- [ ] Implement the controls and feedback without optimistic row removal.
- [ ] Run the focused page tests; all pass.
- [ ] Commit as `feat: add confirmed admin delete actions`.

### Task 4: Single Focus Indicator

**Files:**
- Modify: `apps/desktop/src/pages/LogsPage.tsx` (scope the logs toolbar)
- Modify: `apps/desktop/src/styles/app.css`
- Test: focused-field coverage in the affected page tests and browser inspection.

- [ ] Add a failing focused-state test proving the two target fields use the scoped focus classes.
- [ ] Run the focused Vitest cases; confirm the new assertions fail.
- [ ] Remove the outer ring only for request-log search, use one accent border on focus, and remove the extra outline only for credential scope while keeping its accent border.
- [ ] Run the focused tests and inspect screenshots at 1440, 768, and 390px plus keyboard focus; confirm one indicator remains and layout does not overflow.
- [ ] Commit as `style: remove duplicate admin field focus rings`.

### Task 5: Version 1.1.4 and Local Portable Delivery

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/electron-builder.yml`
- Modify: `scripts/verify-release.mjs`
- Modify: `tests/runtime/release-manifest.test.mjs`
- Create: `docs/tasks/evidence/admin-destructive-actions/delivery.md`

- [ ] Add a failing runtime assertion for package/product/build metadata fixed at `1.1.4`.
- [ ] Run `node --test tests/runtime/release-manifest.test.mjs`; confirm it fails while metadata remains `1.1.3`.
- [ ] Set package `version`, `cxrgProductVersion`, and builder `buildVersion` to `1.1.4`; align verifier and manifest test.
- [ ] Run `node --test tests/runtime/release-manifest.test.mjs`, `npm --prefix apps/desktop test`, and `npm --prefix apps/desktop run build`; all pass.
- [ ] Build unpacked x64 files with electron-builder into `apps/desktop/release/1.1.4-local`, create the Portable artifact with `scripts/package-portable.ps1 -OutputDirectory apps/desktop/release/1.1.4-local`, and run `scripts/smoke-portable.mjs` plus the packaged version check.
- [ ] Copy only the verified artifact to `C:\Users\20142\Desktop\Cx-Routing Gateway Portable 1.1.4.exe`; smoke-test the copy and record matching SHA-256 without replacing 1.1.3.
- [ ] Commit source and delivery evidence as `build: prepare desktop version 1.1.4`.

### Task 6: PR, Merge, Sync, and Worktree Removal

**Files:**
- Modify: `docs/tasks/2026-11-22-admin-destructive-actions-contract.json` with verified PR, review, CI, merge, and delivery evidence.

- [ ] Run the complete Runtime and Desktop suites, Desktop production build, focused release verification, visual inspection, and `git diff --check` from the task worktree.
- [ ] Obtain an independent review of the full branch diff and resolve all blocking findings.
- [ ] Push the task branch and create one dedicated PR against `master`; record its URL.
- [ ] Wait for required CI checks, recheck the PR diff and base, then merge the PR.
- [ ] Fast-forward the primary `master` worktree, verify its HEAD contains the PR merge and that the merged tree matches the reviewed build.
- [ ] Confirm the new Desktop Portable copy still matches its recorded SHA-256, then remove only `.worktree/log-credential-upstream-actions` after it is clean; retain the local branch and all other worktrees.
