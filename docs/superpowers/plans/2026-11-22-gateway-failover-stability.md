# Gateway Failover Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a late successful response from a preferred upstream restores that target's priority after concurrent failures trip its circuit.

**Architecture:** Keep health state isolated by route and target. Ignore failures recorded by an obsolete generation, but treat a successful response as recovery evidence that clears the circuit and advances the generation. Include only routing-relevant upstream configuration in the health signature so edits invalidate stale health state.

**Tech Stack:** Node.js ES modules, `node:test`, local HTTP fixtures, existing in-memory gateway health state.

**Spec:** `docs/superpowers/specs/2026-11-22-upstream-service-edit-failover-stability-design.md`

## Global Constraints

- Do not add runtime dependencies.
- Preserve the configured failure threshold, configured status classes, 60-second cooldown, and no-retry behavior for the current failed request.
- Keep circuit state isolated per route and target.
- Use only local HTTP fixtures; make no real provider calls.

## Review Focus

- A success from an older generation must close a circuit opened by concurrent failures; test the next request selecting the preferred target.
- Failures from requests made obsolete by a later success must not reopen the circuit; test late failure after recovery.
- A backup target's success must not clear the preferred target's state; test target isolation.
- Fewer failures than the threshold followed by success must reset the consecutive count; test two failures, success, then two failures.
- Editing endpoint, protocol, credential reference, enabled state, or address trust must refresh health state; changing a display name alone must not.

---

### Task 1: Pin the stale-success regression

**Files:**
- Modify: `tests/runtime/gateway-server.test.mjs`

**Interfaces:**
- Use `createGatewayServer`, `ConfigStore`, and `SecretVault` with the existing local HTTP test pattern.
- Provide two ordered route targets, threshold `3`, status class `[5]`, and a deterministic gate for a fourth primary request.

**Steps:**
- [x] Add a test that starts four requests against the primary before releasing responses; return 502 for three and hold the fourth until after the circuit opens.
- [x] Assert the first three requests fail, the fourth succeeds from the primary, and a subsequent request reaches the primary rather than the backup.
- [x] Run `node --test tests/runtime/gateway-server.test.mjs` and confirm this new case fails because the subsequent request reaches the backup.

**Acceptance:** The new test reproduces the observed state transition without external networking or timing sleeps.

### Task 2: Make successful outcomes heal the current circuit

**Files:**
- Modify: `services/gateway/src/server.mjs`
- Test: `tests/runtime/gateway-server.test.mjs`

**Interfaces:**
- Update the request-local `recordOutcome(failed)` logic around `targetHealth.generation`.

**Steps:**
- [x] Change the regression test only if its first red result exposes a fixture error; keep its behavior assertion unchanged.
- [x] Implement the smallest state transition that lets a same-target success clear `failures` and `openUntil` despite a stale request generation, then advances generation to invalidate older in-flight failures.
- [x] Keep stale failures ignored and preserve the existing threshold, status-class, cooldown, and current-request behavior.
- [x] Add a gated case where an obsolete failure completes after a recovery success and verify the target stays closed.
- [x] Run the focused gateway test and confirm the added tests pass.

**Acceptance:** A successful primary response restores its priority, while older failed outcomes cannot undo that recovery.

### Task 3: Reset target health when routing configuration changes

**Files:**
- Modify: `services/gateway/src/server.mjs`
- Test: `tests/runtime/gateway-server.test.mjs`

**Interfaces:**
- Extend the per-route health signature using route targets, policy, and routing-relevant fields from their configured upstream records.

**Steps:**
- [x] Add a regression test that opens the preferred target's circuit, updates its Base URL or credential reference without changing the route, and verifies the next request tries the updated preferred target.
- [x] Add an assertion that changing only the display name does not discard an otherwise valid circuit state.
- [x] Confirm the tests fail against the current signature.
- [x] Include endpoint, protocol, credential reference, enabled state, approved addresses, and private-network trust in the signature; exclude display name and discovered model list.
- [x] Run the focused gateway test and verify both reset and preservation cases.

**Acceptance:** An edited routing configuration starts with fresh health state, while non-routing metadata does not.

### Task 4: Verify the runtime change

**Files:**
- No additional production files.

**Steps:**
- [x] Run `node --test tests/runtime/gateway-server.test.mjs`.
- [x] Run the complete runtime suite with `npm test` from the repository root.
- [x] Run `git diff --check` and review the full diff for unrelated changes.

**Acceptance:** All runtime tests pass, with explicit output recorded for the focused failover cases and full suite.
