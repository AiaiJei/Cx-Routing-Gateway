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
- Request log field names and units remain unchanged; `createdAt` stays wall-clock ISO time.
- No new runtime dependencies, storage migration, provider calls, version bump, merge, release, or unrelated worktree cleanup.

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

- [ ] **Step 1: Add failing monotonic timing tests**

Add `request logs measure elapsed time monotonically across wall-clock changes`: inject wall and monotonic clocks, move the wall clock backward/forward during a streamed request, and assert stable monotonic first-content/total durations plus the original wall-clock `createdAt`.

Add a unit regression in `request-metrics.test.mjs` proving first-content time derives only from the injected monotonic clock.

- [ ] **Step 2: Run timing tests and verify RED**

Run: `node --test --test-name-pattern="request logs measure elapsed time monotonically across wall-clock changes" tests/runtime/request-logs.test.mjs tests/runtime/request-metrics.test.mjs`

Expected: current wall-clock elapsed calculations fail when the test clock changes.

- [ ] **Step 3: Add failing accessible timing-disclosure test**

Add `RequestDuration explains first-content and full-request timing`: focus or activate the timing control, assert the tooltip distinguishes first meaningful generated content from the full Gateway request interval, and dismiss it with Escape.

- [ ] **Step 4: Run the UI test and verify RED**

Run: `npm test -- src/components/RequestLogCells.test.tsx` from `apps/desktop`.

Expected: the test fails because `RequestDuration` currently has no timing disclosure.

- [ ] **Step 5: Implement monotonic metrics and timing disclosure**

Pass the same monotonic clock and request-start value to `createRequestMetrics`; compute every logged request duration from that clock. Keep wall-clock `createdAt`. Wrap `RequestDuration` in the existing Tooltip with concise definitions for both metrics.

- [ ] **Step 6: Run focused metric and UI tests**

Run: `node --test tests/runtime/request-metrics.test.mjs tests/runtime/request-logs.test.mjs` and `npm test -- src/components/RequestLogCells.test.tsx` from `apps/desktop`.

Expected: all focused metric and UI tests pass.

- [ ] **Step 7: Run full suites and diff checks for Task 2**

Run: `npm test` from repository root; `npm test` from `apps/desktop`; `git diff --check` from repository root.

Expected: Runtime and Desktop suites pass and the diff check is clean.

- [ ] **Step 8: Commit Task 2 with its ledger result**

Commit Task 2 production and regression-test changes after verifying only authorized paths changed; append its test result and commit range to the SDD ledger.

### Task 3: Verify, record evidence, and open the dedicated PR

**Files:**
- Modify: `.codex/awg-task.json`
- Modify: `docs/tasks/2026-11-21-gateway-timeout-metrics.md`
- Create: `.task-evidence/gateway-timeout-metrics/verification.md`

- [ ] **Step 1: Run full verification**

Run, in order: `npm run build` from `apps/desktop`; `npm test` from repository root; `npm test` from `apps/desktop`; `git diff --check` from the repository root.

Expected: TypeScript/Vite build and both full suites exit 0; diff check emits no errors.

- [ ] **Step 2: Review scope and update task evidence**

Inspect the full branch diff against `origin/master`; verify only authorized paths changed, parse `.codex/awg-task.json`, and record command outputs/counts, limitations, and rollback in `verification.md` and the task record.

- [ ] **Step 3: Commit, push, and create one PR against `master`**

Use a focused commit message such as `fix: separate gateway response and request deadlines`. Push `codex/gateway-timeout-metrics` and open a PR titled `fix: allow long gateway generations and clarify timing`.

Expected: one open, unmerged PR; no master push, merge, release, or worktree deletion.

- [ ] **Step 4: Inspect GitHub checks and record final state**

Run: `gh pr checks <number> --repo AiaiJei/Cx-Routing-Gateway` and inspect the PR head/base/state.

Expected: Runtime and Desktop checks pass; otherwise record the actual failure and continue only with task-scoped fixes.
