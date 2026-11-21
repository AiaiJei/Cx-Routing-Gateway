# Gateway Timeout and Request Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let long model generations complete under a bounded 10-minute Gateway deadline and make request-log timings consistent and understandable.

**Architecture:** Keep a 5-minute upstream response-header timeout, then apply one absolute 10-minute deadline from Gateway request receipt to all response-body readers. Use monotonic elapsed time for metrics while preserving wall-clock request timestamps; document metric boundaries through the existing Tooltip component.

**Tech Stack:** Node.js HTTP streams, Node test runner, React, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-21-gateway-timeout-metrics-design.md`

## Global Constraints

- Upstream response-header timeout: 300,000 ms.
- Absolute Gateway request deadline: 600,000 ms from request acceptance.
- Incoming request-body timeout remains 30,000 ms.
- Desktop route-test client timeout: 610,000 ms, allowing response parsing after the Gateway deadline.
- Product/package/build release version: 1.1.3, incremented from the confirmed latest 1.1.2.
- Request log field names and units remain unchanged; `createdAt` stays wall-clock ISO time.
- No new runtime dependencies, storage migration, provider calls, code signing, rewrite of the 1.1.2 release, or unrelated worktree cleanup.

## Review Focus

- Upstream sends no response headers: return sanitized 504 at the 5-minute header bound and release the concurrency slot. Pin with `gateway enforces the upstream response-header timeout independently`.
- Headers arrive but JSON or SSE body lasts longer than the former 30-second timeout: allow completion within the absolute request deadline. Pin with `gateway allows response bodies to outlive the header timeout`.
- Response body remains active beyond the absolute deadline: cancel upstream reads, persist a failed `upstream_timeout` record, and release the slot. Pin with `gateway enforces the absolute deadline for JSON and streams`.
- Converted and native streams follow the same deadline. Pin with the deadline test across both response paths.
- Wall-clock time moves while a request is active: elapsed metrics remain monotonic and `createdAt` remains the request-start wall timestamp. Pin with `request logs measure elapsed time monotonically across wall-clock changes`.

---

### Task 1: Separate header and full-request deadlines

**Files:**
- Modify: `services/gateway/src/server.mjs`
- Test: `tests/runtime/gateway-server.test.mjs`
- Test: `tests/runtime/request-logs.test.mjs`

**Interfaces:**
- `createGatewayServer` options: `upstreamHeaderTimeoutMs = 300_000`, `maxRequestDurationMs = 600_000`, and injectable `monotonicNow = () => performance.now()`; existing `now` remains the wall clock.
- `routeTestTimeoutMs = 610_000` keeps the Desktop route-test caller from aborting before the Gateway deadline; tests may inject a shorter value.
- `fetchWithTimeout` owns only the response-header timer and clears it when headers arrive; it retains abort-on-client-disconnect behavior.
- `readJson`, `pipeStream`, and `pipeConvertedStream` receive the same absolute monotonic deadline.
- Body-reader deadline expiry throws `upstream_timeout` with status 504 and cancels its reader.
- `bodyOf` retains its independent 30-second timeout.
- Route-test caller uses a 610,000 ms timeout and reports a clear timeout error.

- [x] **Step 1: Install Desktop dependencies in the task worktree**

Run: `npm ci` from `apps/desktop`.

Expected: dependencies match the existing lockfile; no lockfile changes.

- [x] **Step 2: Establish the clean build and test baseline**

Run: `npm run build` from `apps/desktop`, followed by `npm test` from repository root and `npm test` from `apps/desktop`.

Expected: build and both full suites pass before any runtime implementation changes.

- [x] **Step 3: Add failing header/body separation tests**

Add `gateway enforces the upstream response-header timeout independently`: configure the current `upstreamTimeoutMs` option to a short value, delay headers past it, and assert 504 `upstream_timeout`.

Add `gateway allows response bodies to outlive the header timeout`: configure the current `upstreamTimeoutMs` option to a short value, send headers promptly, finish a JSON body after that value but before the request deadline, and assert success. This assertion reproduces the current timer continuing after headers.

Add `gateway testRoute honors the configured client timeout`: inject a short route-test timeout, delay the local upstream beyond it, and assert the route-test call aborts through its bounded-timeout error path.

- [x] **Step 4: Run the focused tests and verify RED**

Run: `node --test --test-name-pattern="gateway enforces the upstream response-header timeout independently|gateway allows response bodies to outlive the header timeout|gateway testRoute honors the configured client timeout" tests/runtime/gateway-server.test.mjs`

Expected: the body test fails because the current timer remains active after response headers, and the route-test test fails because the client timeout is not injectable; the header-wait test passes.

- [x] **Step 5: Add failing absolute-deadline tests**

Add `gateway enforces the absolute deadline for JSON and streams`. With short injected deadlines, cover JSON, native SSE, and converted SSE; assert timeout status/log data, reader cancellation, and that a subsequent request acquires the concurrency slot.

- [x] **Step 6: Run the deadline test and verify RED**

Run: `node --test --test-name-pattern="gateway enforces the absolute deadline for JSON and streams" tests/runtime/gateway-server.test.mjs`

Expected: at least the paths that currently outlive the single header/body timer fail the deadline assertions.

- [x] **Step 7: Implement independent header and absolute request deadlines**

Set `requestDeadline = monotonicNow() + maxRequestDurationMs` when the Gateway accepts the request. Rename the option to `upstreamHeaderTimeoutMs`, defaulting to 300,000 ms; bound headers by the lesser of that value and remaining request time. Clear the header timer on headers, migrate the test fixture to the renamed option, then enforce the shared deadline in JSON and stream readers. Map expiry to the existing sanitized timeout record and retain client-disconnect cancellation. Set `routeTestTimeoutMs` to 610,000 ms by default and report a generic route-test timeout while keeping the local test override.

- [x] **Step 8: Run focused Gateway and request-log tests**

Run: `node --test tests/runtime/gateway-server.test.mjs tests/runtime/request-logs.test.mjs`

Expected: all focused tests pass, including old timeout, cancellation, conversion, usage logging, and concurrency-slot regressions.

- [x] **Step 9: Run full suites and diff checks for Task 1**

Run: `npm test` from repository root; `npm test` from `apps/desktop`; `git diff --check` from repository root.

Expected: Runtime and Desktop suites pass and the diff check is clean.

- [x] **Step 10: Commit Task 1 with its ledger result**

Commit the Task 1 server, tests, approved design/plan, and contract/task records after verifying only authorized paths changed. Append the Task 1 result and commit range to the SDD ledger in the same operation.

### Task 2: Make elapsed metrics monotonic and explain their boundaries

**Files:**
- Modify: `services/gateway/src/server.mjs`
- Modify: `services/gateway/src/request-metrics.mjs`
- Test: `tests/runtime/request-metrics.test.mjs`
- Test: `tests/runtime/request-logs.test.mjs`
- Modify: `apps/desktop/src/components/RequestLogCells.tsx`
- Create: `apps/desktop/src/components/RequestLogCells.test.tsx`

**Interfaces:**
- Usage records keep numeric `durationMs` and optional `firstTokenMs` in milliseconds.
- `createdAt` is captured once from the wall clock at request entry.
- `durationMs` and `firstTokenMs` use the injected monotonic clock.
- `RequestDuration` uses the existing `Tooltip` and labels first meaningful generated content separately from full Gateway request duration.

- [x] **Step 1: Add failing monotonic timing tests**

Add `request logs measure elapsed time monotonically across wall-clock changes`: inject wall and monotonic clocks, move the wall clock backward/forward during a streamed request, and assert stable monotonic first-content/total durations plus the original wall-clock `createdAt`.

Add `default stream metrics ignore wall-clock jumps` in `request-metrics.test.mjs`: move `Date.now()` backward after recording the monotonic start and assert the default first-content duration remains positive and bounded.

- [x] **Step 2: Run timing tests and verify RED**

Run: `node --test --test-name-pattern="request logs measure elapsed time monotonically across wall-clock changes|default stream metrics ignore wall-clock jumps" tests/runtime/request-logs.test.mjs tests/runtime/request-metrics.test.mjs`

Expected: current wall-clock elapsed calculations fail when the test clock changes.

- [x] **Step 3: Add failing accessible timing-disclosure test**

Add `RequestDuration explains first-content and full-request timing`: focus or activate the timing control, assert the tooltip distinguishes first meaningful generated content from the full Gateway request interval, and dismiss it with Escape.

- [x] **Step 4: Run the UI test and verify RED**

Run: `npm test -- src/components/RequestLogCells.test.tsx` from `apps/desktop`.

Expected: the test fails because `RequestDuration` currently has no timing disclosure.

- [x] **Step 5: Implement monotonic metrics and timing disclosure**

Pass the same monotonic clock and request-start value to `createRequestMetrics`; compute every logged request duration from that clock. Keep wall-clock `createdAt`. Wrap `RequestDuration` in the existing Tooltip with concise definitions for both metrics.

- [x] **Step 6: Run focused metric and UI tests**

Run: `node --test tests/runtime/request-metrics.test.mjs tests/runtime/request-logs.test.mjs` and `npm test -- src/components/RequestLogCells.test.tsx` from `apps/desktop`.

Expected: all focused metric and UI tests pass.

- [x] **Step 7: Run full suites and diff checks for Task 2**

Run: `npm test` from repository root; `npm test` from `apps/desktop`; `git diff --check` from repository root.

Expected: Runtime and Desktop suites pass and the diff check is clean.

- [x] **Step 8: Commit Task 2 with its ledger result**

Commit Task 2 production and regression-test changes after verifying only authorized paths changed; append its test result and commit range to the SDD ledger.

### Task 3: Verify and record evidence

**Files:**
- Modify: `.codex/awg-task.json`
- Modify: `docs/tasks/2026-11-21-gateway-timeout-metrics.md`
- Create: `.task-evidence/gateway-timeout-metrics/verification.md`

- [x] **Step 1: Run full verification**

Run, in order: `npm run build` from `apps/desktop`; `npm test` from repository root; `npm test` from `apps/desktop`; `git diff --check` from the repository root.

Expected: TypeScript/Vite build and both full suites exit 0; diff check emits no errors.

- [x] **Step 2: Review scope and update task evidence**

Inspect the full branch diff against `origin/master`; verify only authorized paths changed, parse `.codex/awg-task.json`, and record command outputs/counts, limitations, and rollback in `verification.md` and the task record.

- [x] **Step 3: Commit the verification evidence and task records**

Commit the updated contract, task record, and verification evidence with a message such as `docs: record gateway timeout verification`.

Expected: verification evidence is committed locally; the branch remains unpushed until the required whole-branch review is complete.

### Task 4: Merge PR #15 and deliver release 1.1.3

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/package-lock.json`
- Modify: `apps/desktop/electron-builder.yml`
- Modify: `apps/desktop/src/pages/SettingsPage.test.tsx`
- Modify: `scripts/check-update.mjs`
- Modify: `scripts/verify-release.mjs`
- Test: `tests/runtime/check-update.test.mjs`
- Test: `tests/runtime/release-manifest.test.mjs`
- Create: `docs/tasks/2026-11-21-release-1.1.3.md`
- Create: `docs/tasks/evidence/release-1.1.3/release-notes.md`
- Create: `docs/tasks/evidence/release-1.1.3/manifest.json`
- Create: `docs/tasks/evidence/release-1.1.3/publish.json`
- Build: `apps/desktop/release/1.1.3-final-reviewed/**`

**Interfaces:**
- Product/package/build version: `1.1.3`.
- Updater accepts exactly two Setup names for that version: `Cx-Routing Gateway Setup 1.1.3.exe` and `Cx-Routing.Gateway.Setup.1.1.3.exe`. The decoded URL filename must equal the chosen asset name; HTTPS host, repository/tag path, and SHA-256 validation remain mandatory.
- Release directory contains x64 `win-unpacked`, Setup installer, `.blockmap`, Portable, and verifier-generated `manifest.json`.
- Desktop destination is `C:\Users\20142\Desktop\Cx-Routing Gateway Portable 1.1.3.exe`; the prior 1.1.2 file remains intact.

- [x] **Step 1: Add a failing updater test for GitHub's dotted installer asset name**

Add `checkUpdate accepts GitHub canonicalized dotted installer asset names` using tag `v1.1.3`, exact dotted asset name, matching HTTPS release URL, and valid SHA-256 digest. Assert the returned installer preserves the exact asset name and digest.

- [x] **Step 2: Run the updater test and verify RED**

Run: `node --test --test-name-pattern="canonicalized dotted installer asset names" tests/runtime/check-update.test.mjs`.

Expected: FAIL because the current updater only searches for the spaced asset name.

- [x] **Step 3: Implement narrow GitHub asset-name compatibility**

Accept only the spaced or dotted Setup filename for the parsed release version. Require the URL's decoded filename to match the selected asset name and preserve existing HTTPS, host, repository/tag path, query/hash, and digest checks.

- [x] **Step 4: Update failing 1.1.3 version expectations**

Update the release-manifest current-version expectation and Settings installed-version UI expectations to `1.1.3`; run the focused tests before bumping metadata and verify they fail only on current version mismatch.

- [x] **Step 5: Bump release metadata and verifier to 1.1.3**

Change only root package metadata in package.json/lockfile, electron-builder `buildVersion`, and `scripts/verify-release.mjs` current version guard to 1.1.3. Do not change dependency versions.

- [x] **Step 6: Write release notes and task evidence**

Create the 1.1.3 task record and Chinese release notes covering the timeout/metric changes and updater's GitHub dotted-asset compatibility. Record version lineage, rollback, verification, manifest and Desktop delivery hashes in release evidence.

- [x] **Step 7: Run focused and full tests/build**

Run focused updater/release-manifest/Settings tests, then `npm run build` in `apps/desktop`, full `npm test` from repo root, full Desktop `npm test`, and `git diff --check`.

Expected: all pass with package/product/build metadata aligned at 1.1.3.

- [x] **Step 8: Build and verify Windows x64 artifacts**

In `apps/desktop`, build the x64 unpacked target and NSIS installer into `release/1.1.3-final-reviewed`, then run `scripts/package-portable.ps1 -OutputDirectory apps/desktop/release/1.1.3-final-reviewed` from repository root. Run `scripts/verify-release.mjs apps/desktop/release/1.1.3-final-reviewed --write`, `scripts/smoke-packaged.mjs` against its `win-unpacked` executable, and `scripts/smoke-portable.mjs` against its Portable executable.

Expected: verifier reports every required artifact and SHA-256; both smoke tests report healthy control/gateway services under isolated user data/non-default ports.

- [x] **Step 9: Ensure tag-release CI packages and smokes the Portable asset**

Update the tag/workflow_dispatch package job to build the Portable in `apps/desktop/release` before `verify-release.mjs`, then run `smoke-portable.mjs` against the versioned Portable using isolated data/ports. Keep the job scoped to release tags and manual packaging; do not affect PR CI.

Expected: the release workflow produces every artifact the verifier requires and fails the release job if the Portable smoke fails. Verified locally: the workflow YAML parses and the job includes Portable packaging/smoke before upload.

- [ ] **Step 10: Run the package workflow on the release branch**

Push the release revision to PR #15 and trigger `.github/workflows/ci.yml` with `workflow_dispatch` against `codex/gateway-timeout-metrics`. Wait for Runtime/Desktop and package jobs.

Expected: Runtime and Desktop pass; package builds Portable, verifies all required assets, and passes unpacked/Portable smoke.

- [ ] **Step 11: Re-review PR #15 and merge after CI**

Run an independent whole-branch review against `origin/master` on the final release branch. Merge PR #15 only after independent review and Runtime/Desktop checks pass.

- [ ] **Step 12: Fast-forward the primary worktree**

Verify the merge commit tree matches the reviewed artifact source tree, then fast-forward the primary checkout with `--ff-only`. Preserve the 1.1.2 Desktop file and all task worktrees.

- [ ] **Step 13: Publish v1.1.3 and deliver the Desktop Portable**

Publish `v1.1.3` at the verified merge commit with Setup, blockmap, Portable, manifest, and release notes. Verify GitHub asset names/digests and updater filename compatibility. Copy the verified Portable to the versioned Desktop destination without overwrite, verify its SHA-256, and smoke-test that exact copy with isolated data/ports. Do not terminate the already-running 1.1.2 process; it remains until the user closes it.
