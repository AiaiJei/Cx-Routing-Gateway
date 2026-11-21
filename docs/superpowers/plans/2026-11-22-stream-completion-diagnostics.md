# Stream Completion Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent incomplete or empty New API/Sub2API streams from appearing as useful successful generations, and classify resets and client cancellations safely.

**Architecture:** Extend the existing bounded SSE metrics observer with protocol completion, user-facing output, and reasoning metadata. Make both passthrough and converted stream paths require a valid terminal result before recording completion; hold success terminators until EOF so incomplete or semantically empty streams cannot appear successfully finished downstream. Normalize stream failures before log persistence, then map the optional metadata to explicit Desktop status details.

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

1. Chat `[DONE]` without `finish_reason`, or `finish_reason` without `[DONE]`, must not be accepted as completion; test in `request-metrics.test.mjs` and the Gateway request-log integration.
2. Responses `response.failed`/`response.incomplete` and empty `response.completed` must not be shown as useful success; test in `request-metrics.test.mjs`, `request-logs.test.mjs`, and Desktop mapping/UI.
3. SSE events split across arbitrary byte boundaries, including multibyte UTF-8, must retain existing first-content and usage extraction; test with the existing byte-at-a-time metrics case plus terminal-frame splits.
4. A reset after first content must preserve TTFT and distinguish upstream reset from downstream cancellation; test both paths in Runtime fixtures.
5. Legacy records without completion metadata and success with hidden/non-text token usage must not be mislabeled as empty; test adapter mapping.
6. Chat passthrough must process `[DONE]` in frame order; an invalid early sentinel in a multi-frame read must not be forwarded because a later valid completion was observed in the same read.
7. Responses with reasoning items and nonzero reasoning-token usage but no user-facing output must be classified as suspected empty; actual media output remains non-empty.

### Task 1: Observe protocol completion and useful output

**Files:** `services/gateway/src/request-metrics.mjs`; `tests/runtime/request-metrics.test.mjs`.

**Interfaces:** `createRequestMetrics(...).snapshot()` adds optional `streamCompletion`, user-facing `outputObserved`, `reasoningObserved`, and usage evidence without retaining response data. `streamCompletion` is `completed`, `failed`, or `incomplete` for streaming requests.

- [x] Add failing unit tests for Chat finish reason vs `[DONE]` alone; Messages `message_stop`; Responses completed/failed/incomplete; visible text/tool output and empty completion; usage-only reasoning.
- [x] Run the focused test file and confirm expected failures (5 new assertions failed against the old observer).
- [x] Implement bounded event classification within the existing observer. Require Chat finish reason plus `[DONE]`, accept Responses `response.done` only with completed status, and inspect terminal Responses output without inventing TTFT.
- [x] Rerun the focused metrics tests; preserve chunk-boundary and usage assertions (14/14 passed).
- [x] Commit `fix: validate streaming protocol completion` (`1f44bd2`).

### Task 2: Enforce completion and normalize disconnects in Gateway

**Files:** `services/gateway/src/server.mjs`; `tests/runtime/request-logs.test.mjs`; `tests/runtime/gateway-server.test.mjs`.

**Interfaces:** Both stream pipe functions reject incomplete/failed terminal state and semantically empty completions with bounded codes. Success terminators are withheld until the full stream has been validated. Usage records keep upstream HTTP status and preserve metrics already observed. The catch path writes only bounded Gateway codes such as `upstream_empty_response`, `upstream_stream_incomplete`, `upstream_stream_failed`, `upstream_connection_reset`, and `client_disconnected`.

- [x] Add failing integration tests for Chat `[DONE]` without finish reason, heartbeat-only EOF, each protocol's valid empty completion, explicit Responses failure, reset after first output, and downstream cancellation.
- [x] Run the focused integration tests and confirm expected failures.
- [x] Enforce the observer result before stream `res.end`; on invalid Chat `[DONE]` in converted output do not synthesize a downstream success terminal. Track client-close state, avoid counting it against upstream health, and classify nested socket reset codes.
- [x] Rerun focused Runtime tests; verify no retry occurs and the request concurrency slot is released.
- [x] Commit `fix: record stream completion and disconnect causes` (`17f9275`).

### Task 3: Expose empty-response and usage diagnostics

**Files:** `apps/desktop/src/domain/types.ts`; `apps/desktop/src/data/workspace-client.ts`; `apps/desktop/src/pages/LogsPage.tsx`; `apps/desktop/src/data/workspace-client.test.ts`; `apps/desktop/src/pages/LogsPage.test.tsx`.

**Interfaces:** Runtime metadata maps to optional `CallLog.streamCompletion`, `CallLog.outputObserved`, and `CallLog.reasoningObserved`. UI distinguishes suspected empty results (including reasoning-only results) and missing usage, localizes normalized disconnect errors, and preserves legacy rows.

- [x] Add failing adapter and UI tests for suspected-empty, known zero output, content-with-missing-usage, upstream reset, client cancel, and legacy log display.
- [x] Run focused Desktop tests and confirm the missing statuses/diagnostics fail as expected.
- [x] Implement mappings and localized status details using existing status badge, tooltip, and detail modal patterns.
- [x] Run focused Desktop tests (26/26) and production build.
- [x] Commit `feat: surface empty stream diagnostics in logs` (`838595e`).

### Review revision: terminal ordering and reasoning-only output

- [x] Add red tests for an early Chat `[DONE]` followed by a later valid completion in one read, and Responses reasoning-only output with nonzero usage.
- [x] Add tests proving Messages thinking/Chat reasoning are not user-facing output while audio output still counts.
- [x] Hold success terminal frames until EOF, preserve frame order, reject empty completed streams, and map reasoning-only evidence in Desktop details.
- [x] Obtain independent review of the revision and rerun full verification; follow-up review found no actionable findings, Runtime 144/144 and Desktop 145/145 passed, and the production build succeeded.

### Task 4: Verify, review, and open the dedicated PR

**Files:** `.codex/awg-task.json`; `docs/tasks/2026-11-22-stream-completion-diagnostics.md`; `docs/tasks/evidence/stream-completion-diagnostics/verification.md`.

- [x] Run the full Runtime suite (144/144), full Desktop suite (145/145), production build, and `git diff --check`; record counts and limitations.
- [x] Review the whole branch against `master`; the follow-up independent review found no Critical, Important, or Minor findings. The two Important findings from the first review were fixed with regression tests.
- [x] Push `codex/protocol-completion-state` and create one PR against `master`; record URL, creation head SHA, and CI status.
- [x] Leave PR #16 open/unmerged and preserve all worktrees and unrelated untracked directories.

## Rollback

Revert this task's commits only. Do not remove the branch/worktree or alter upstream configuration, published releases, or existing request records.
