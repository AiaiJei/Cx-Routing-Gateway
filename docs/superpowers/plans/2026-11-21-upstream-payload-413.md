# Gateway upstream error status handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow bounded large JSON requests through the gateway, frame upstream JSON with an exact UTF-8 `Content-Length`, and classify allowlisted upstream HTTP errors without leaking provider bodies.

**Architecture:** Keep request parsing and upstream transport in `services/gateway/src/server.mjs`. Add one pure status-classification function beside existing protocol helpers so the request handler remains the composition point. Serialize each outbound payload once, derive byte length from that exact string, and use the classifier only for client response shaping; preserve raw upstream status in usage records and existing failover class behavior.

**Tech Stack:** Node.js ESM, `node:http`, built-in `fetch`-compatible `Response`, Node test runner, existing ConfigStore/SecretVault fixtures.

**Spec:** `docs/superpowers/specs/2026-11-21-upstream-payload-413-design.md`

## Global Constraints

- Inbound JSON limit is 4 MiB; upstream response limits remain 4 MiB.
- Allowlisted upstream statuses: 400, 401, 402, 403, 404, 408, 409, 413, 415, 422, 429.
- 413 maps to `upstream_payload_too_large`; 429 maps to `upstream_rate_limited`; other allowlisted statuses use stable `upstream_http_<status>` codes.
- 5xx and unknown statuses map to HTTP 502 / `upstream_error`; usage keeps `upstreamStatus`.
- Never expose upstream response body or arbitrary upstream response headers. Preserve gateway `x-request-id`.
- Do not change auth, storage schema, concurrency, timeout, response limits, failover configuration, desktop UI, or real provider behavior.

## Review Focus

- UTF-8 byte length differs from JavaScript string length: assert exact `Content-Length` with non-ASCII payload.
- Same-protocol and cross-protocol outbound serialization: assert the received upstream body is the serialized body whose length was advertised.
- 413 and 429 must be client-visible status/code while provider body stays absent.
- Unknown/5xx status must remain sanitized 502 and still record the original upstream status.
- Inbound body just under 4 MiB passes; over 4 MiB remains 413 without upstream I/O.

### Task 1: Add failing runtime regressions

**Files:**
- Modify: `tests/runtime/gateway-server.test.mjs`

- [ ] Add a fixture test for a UTF-8 request larger than 1 MiB and below 4 MiB; upstream records `content-length`, reads the body, and returns success.
- [ ] Add a fixture test that returns 413, 429, representative 4xx, 500, and 599; assert client status, stable code, no provider message, request ID, `upstreamStatus`, and failover behavior remains driven by original status class.
- [ ] Add a fixture test for an over-4 MiB body that asserts gateway 413 and zero upstream calls.
- [ ] Run focused tests and record the expected RED failures in `.task-evidence/upstream-payload-413/red.log`.

### Task 2: Implement bounded body and outbound framing

**Files:**
- Modify: `services/gateway/src/server.mjs`

- [ ] Change the gateway inbound `MAX_BODY` constant to 4 MiB; leave response limits unchanged.
- [ ] Before `fetchWithTimeout`, serialize `payload` once into `serializedPayload`; set `headers['content-length'] = String(Buffer.byteLength(serializedPayload, 'utf8'))`; pass that same string as the request body.
- [ ] Keep existing content type, auth headers, request ID and protocol conversion behavior.
- [ ] Run the large-body focused test and verify GREEN.

### Task 3: Implement explicit upstream status classification

**Files:**
- Modify: `services/gateway/src/server.mjs`

- [ ] Add `classifyUpstreamStatus(status)` returning `{ clientStatus, errorCode }`. Use explicit entries for 400/401/402/403/404/408/409/413/415/422/429; fallback to `{ clientStatus: 502, errorCode: 'upstream_error' }`.
- [ ] In the non-2xx branch, retain `upstreamStatus`, use the classifier for the client response, and continue consuming/cancelling the upstream body without parsing it.
- [ ] Do not use the classifier for `recordOutcome`; retain the existing `Math.floor(status / 100)` failover policy behavior.
- [ ] Run the focused status tests and verify GREEN.

### Task 4: Full verification and evidence

**Files:**
- Modify: `.codex/awg-task.json`, `docs/tasks/2026-11-21-upstream-payload-413.md`, `.task-evidence/upstream-payload-413/**`

- [ ] Run `node --test tests/runtime/gateway-server.test.mjs`.
- [ ] Run `npm test` from the repository root.
- [ ] Run `git diff --check`.
- [ ] Save command outputs and final counts under `.task-evidence/upstream-payload-413/`; update contract/record with exact results and remaining `NOT_RUN` boundaries.
- [ ] Perform a fresh read-only branch review before commit/PR.
- [ ] Commit, push the task branch, and create the dedicated PR against `master`; do not merge.
