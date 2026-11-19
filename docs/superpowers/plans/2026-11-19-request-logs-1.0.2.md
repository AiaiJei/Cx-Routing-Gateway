# Request logs 1.0.2 Implementation Plan

> **For agentic workers:** Use executing-plans inline; one fresh independent whole-branch review. Track steps here and in the task record.

**Goal:** Deliver request logs with real type/token/first-token metrics and compact accessible disclosures in version 1.0.2.
**Architecture:** An isolated Gateway metrics observer emits optional allowlisted metadata into existing usage storage. The runtime adapter maps it into typed log data; shared Tooltip and log-specific cells own presentation.
**Tech Stack:** Node HTTP/SSE, React 18, TypeScript, Vitest, Node test.
**Spec:** docs/superpowers/specs/2026-11-19-request-logs-design.md

## Global Constraints
- Base 6acebc964b7f4f331ec5827819f4bf923829fd5f (merged PR #6); version 1.0.2.
- Existing layout, routes, authorization and protocol behavior preserved. No dependencies or body persistence.
- Missing ≠ 0; nonstream first-token is unavailable. Real provider calls excluded.
- Commit/push task branch and create PR authorized; merge/publish/cleanup excluded.

## Review Focus
- Delayed role/heartbeat/empty/usage events must not manufacture TTFT.
- Chunked UTF-8, CRLF, malformed or oversized SSE must not corrupt forwarding or retain bodies.
- Partial cumulative usage must preserve fields and zero without double counting.
- Historical/failed/malformed numeric records must not claim real zeros or crash.
- Tooltip focus, Escape, touch, scroll clipping and long IDs must work at narrow widths.

## Task 1: Runtime telemetry
Files: services/gateway/src/request-metrics.mjs; services/gateway/src/server.mjs; tests/runtime/request-metrics.test.mjs; tests/runtime/request-logs.test.mjs.
Interface: createRequestMetrics({ protocol, stream, startedAt, clock }) → { observeJson(body), push(chunk), finish(), snapshot() }; snapshot contains stream, firstTokenMs (optional), tokens (allowlisted optional fields).
- [x] Write tests for the Review Focus telemetry cases; run and observe missing implementation failure.
- [x] Implement bounded metadata extraction, connect both stream paths and JSON path, preserve failed request metadata and start timestamp.
- [x] Run targeted node tests, then full runtime suite after Desktop build. Expected all pass.

## Task 2: Typed UI and version
Files: apps/desktop/src/domain/types.ts, data/workspace-client.ts, data/fixtures.ts, components/Tooltip.tsx, components/RequestLogCells.tsx, domain/request-log.ts, pages/LogsPage.tsx, styles/request-logs.css, navigation/route-test labels, tests, package/lock.
Interface: RequestTokens has input/output/cacheRead/cacheWrite/total/reasoning/audio fields; CallLog receives optional stream, firstTokenMs, tokens and nullable duration. Sanitization occurs at adapter boundary.
- [x] Extend real adapter and user-interaction tests for unknown/zero/malformed data, hidden request IDs, protocol/token disclosure and Escape; observe meaningful failures.
- [x] Reuse existing shared components, implement tooltip and typed log cells, update title/nav/help and detail dialog, bump package/lock to 1.0.2.
- [x] Run Desktop suite/build; run Runtime suite. Expected all pass.

## Task 3: Verify, review, PR
- [x] Inspect real browser screenshots at 1440/768/390, verify popover placement and keyboard behavior; record any limitations.
- [x] Independent whole-branch review; fix substantive findings with regression verification.
- [x] Record fresh tests/build, capability inventory, acceptance limits; commit explicit files and push dedicated branch; create and attach dedicated PR, check CI.
