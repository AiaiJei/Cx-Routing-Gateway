# Stream Completion Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent incomplete or empty New API/Sub2API streams from appearing as useful successful generations, and classify resets and client cancellations safely.

**Architecture:** Extend the existing bounded SSE metrics observer with protocol completion and observable-output metadata. Make both passthrough and converted stream paths require a valid terminal result before recording completion; normalize stream failures before log persistence, then map the optional metadata to explicit Desktop status details.

**Tech Stack:** Node.js built-in HTTP/streams, `node:test`, React/TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-22-stream-completion-diagnostics-design.md`

## Global Constraints

- No real upstream/provider calls.
- No prompt, response body, stream frame, credential, or raw provider error persistence.
- No automatic retry after streaming begins.
- No dependency, public API, request-conversion, or schema migration changes.
- Keep new usage fields optional so historical records remain readable.
- Do not merge the dedicated PR or publish a release.

## Review Focus

1. Chat `[DONE]` without `finish_reason` after a proxy timeout must not be accepted as completion; test in `request-metrics.test.mjs` and the Gateway request-log integration.
2. Responses `response.failed`/`response.incomplete` and empty `response.completed` must not be shown as useful success; test in `request-metrics.test.mjs`, `request-logs.test.mjs`, and Desktop mapping/UI.
3. SSE events split across arbitrary byte boundaries, including multibyte UTF-8, must retain existing first-content and usage extraction; test with the existing byte-at-a-time metrics case plus terminal-frame splits.
4. A reset after first content must preserve TTFT and distinguish upstream reset from downstream cancellation; test both paths in Runtime fixtures.
5. Legacy records without completion metadata and success with hidden/non-text token usage must not be mislabeled as empty; test adapter mapping.

### Task 1: Observe protocol completion and useful output

**Files:** `services/gateway/src/request-metrics.mjs`; `tests/runtime/request-metrics.test.mjs`.

**Interfaces:** `createRequestMetrics(...).snapshot()` adds optional `streamCompletion`, `outputObserved`, and usage evidence without retaining response data. `streamCompletion` is `completed`, `failed`, or `incomplete` for streaming requests.

- [ ] Add failing unit tests for Chat finish reason vs `[DONE]` alone; Messages `message_stop`; Responses completed/failed/incomplete; visible text/tool output and empty completion; usage-only reasoning.
- [ ] Run the focused test file and confirm expected failures.
- [ ] Implement bounded event classification within the existing observer. Require Chat finish reason, accept Responses `response.done` only with completed status, and inspect terminal Responses output without inventing TTFT.
- [ ] Rerun the focused metrics tests; preserve chunk-boundary and usage assertions.
- [ ] Commit `fix: validate streaming protocol completion`.

### Task 2: Enforce completion and normalize disconnects in Gateway

**Files:** `services/gateway/src/server.mjs`; `tests/runtime/request-logs.test.mjs`; `tests/runtime/gateway-server.test.mjs`.

**Interfaces:** Both stream pipe functions reject incomplete/failed terminal state with bounded codes. Usage records keep upstream HTTP status and preserve metrics already observed. The catch path writes only `upstream_stream_incomplete`, `upstream_stream_failed`, `upstream_connection_reset`, `client_disconnected`, or existing bounded Gateway codes.

- [ ] Add failing integration tests for Chat `[DONE]` without finish reason, heartbeat-only EOF, each protocol's valid empty completion, explicit Responses failure, reset after first output, and downstream cancellation.
- [ ] Run the focused integration tests and confirm expected failures.
- [ ] Enforce the observer result before stream `res.end`; on invalid Chat `[DONE]` in converted output do not synthesize a downstream success terminal. Track client-close state, avoid counting it against upstream health, and classify nested socket reset codes.
- [ ] Rerun focused Runtime tests; verify no retry occurs and the request concurrency slot is released.
- [ ] Commit `fix: record stream completion and disconnect causes`.

### Task 3: Expose empty-response and usage diagnostics

**Files:** `apps/desktop/src/domain/types.ts`; `apps/desktop/src/data/workspace-client.ts`; `apps/desktop/src/pages/LogsPage.tsx`; `apps/desktop/src/data/workspace-client.test.ts`; `apps/desktop/src/pages/LogsPage.test.tsx`.

**Interfaces:** Runtime metadata maps to optional `CallLog.streamCompletion` and `CallLog.outputObserved`. UI distinguishes suspected empty results and missing usage, localizes normalized disconnect errors, and preserves legacy rows.

- [ ] Add failing adapter and UI tests for suspected-empty, known zero output, content-with-missing-usage, upstream reset, client cancel, and legacy log display.
- [ ] Run focused Desktop tests and confirm the missing statuses/diagnostics fail as expected.
- [ ] Implement mappings and localized status details using existing status badge, tooltip, and detail modal patterns.
- [ ] Run focused Desktop tests and production build.
- [ ] Commit `feat: surface empty stream diagnostics in logs`.

### Task 4: Verify, review, and open the dedicated PR

**Files:** `.codex/awg-task.json`; `docs/tasks/2026-11-22-stream-completion-diagnostics.md`; `docs/tasks/evidence/stream-completion-diagnostics/verification.md`.

- [ ] Run the full Runtime suite, full Desktop suite, production build, and `git diff --check`; record counts and limitations.
- [ ] Review the whole branch against `master`, fix Critical/Important findings test-first, and document deferred Minor findings or rulings.
- [ ] Push `codex/protocol-completion-state` and create one PR against `master`; record URL, head SHA, and CI status.
- [ ] Leave the PR open/unmerged and preserve all worktrees and unrelated untracked directories.

## Rollback

Revert this task's commits only. Do not remove the branch/worktree or alter upstream configuration, published releases, or existing request records.
