# Upstream Credential and Routing Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep saved upstream credentials usable after Desktop restarts and prevent circuit-breaker cooldown from blindly oscillating traffic back to an unhealthy preferred upstream.

**Architecture:** Keep the encrypted SecretVault and ConfigStore boundaries. Extract Desktop master-key persistence into a testable module that fails closed on invalid existing key material. In Gateway, probe a cooled-down preferred target through its configured `/v1/models` endpoint using the same approved-address and credential rules; return to it only after a successful probe, with concurrent probes deduplicated per route target.

**Tech Stack:** Node.js CommonJS/ES modules, Electron safeStorage, existing HTTP clients, `node:test`, local HTTP fixtures.

**Spec:** `docs/superpowers/specs/2026-11-23-upstream-credential-routing-stability-design.md`

## Global Constraints

- Do not add runtime dependencies.
- Do not make real provider requests during development or verification.
- Keep API keys encrypted in SecretVault and out of public configuration responses.
- Preserve failure threshold, status classes, 60-second cooldown and no retry for the currently failed request.
- Only probe after a target's circuit cooldown expires; successful probes are required before failback.
- Keep the task branch/worktree and unrelated user files; PR creation does not authorize merge or release.

## Review Focus

- Existing encrypted and raw master-key file formats remain readable; test legacy migration and new persisted formats in Task 1.
- An unreadable/decryption-failing existing key never silently generates a replacement; test preservation of the original file in Task 1.
- Three failures open the preferred circuit and subsequent requests stay on backup while its probe fails; test in Task 2.
- Concurrent requests after cooldown share one probe and only probe success permits preferred-target selection; test in Task 2.
- DNS changes, private-network trust and upstream credentials still use current validation; test the probe against pinned local fixture addresses and required auth in Task 2.

---

### Task 1: Persist and recover the Desktop master key

**Files:**
- Create: `apps/desktop/electron/runtime-master-key.cjs`
- Modify: `apps/desktop/electron/main.cjs`
- Test: `tests/runtime/runtime-master-key.test.mjs`
- Test: `tests/runtime/supervisor.test.mjs`

**Interfaces:**
- `loadOrCreateRuntimeMasterKey({ filePath, safeStorage, envMasterKey, randomBytes }) -> string` reads a valid existing key, persists a new key only when the file is absent, and throws on malformed or undecryptable existing material.
- Preserve compatibility with existing encrypted base64 values and existing 43-character base64url plaintext values; new writes use an explicit version marker so future safeStorage availability changes cannot reinterpret the file.

- [ ] Write tests for existing key reuse across calls, safeStorage encrypted key reuse, legacy plaintext reuse, and corrupt/decryption-failing key preservation.
- [ ] Run `node --test tests/runtime/runtime-master-key.test.mjs` and confirm the new behavior assertions fail before implementation.
- [ ] Implement the helper with atomic temp-file replacement and make `main.cjs` use it without changing the stable `app.getPath("userData")/runtime` data directory.
- [ ] Add a supervisor stop/start regression using the same `dataDir` and master key: create an upstream/key through authenticated Local Control, stop, restart, send a Gateway request to a local fixture, and assert the fixture receives the original credential.
- [ ] Run focused master-key, vault, control-server and supervisor tests; assert `secrets.json` does not contain plaintext and `config.json` stores only a credential reference.

### Task 2: Require successful health probes before failback

**Files:**
- Modify: `services/gateway/src/server.mjs`
- Test: `tests/runtime/gateway-server.test.mjs`

**Interfaces:**
- Extend `createGatewayServer` with an injectable bounded `upstreamHealthProbeTimeoutMs` defaulting to 5000 ms for deterministic local tests.
- Keep health state scoped by route and target; store one in-flight probe promise per target health entry.
- Probe `GET /v1/models` with the target's protocol-specific authentication after its circuit cooldown expires, using `validateDestination` and pinned approved addresses. Treat only 2xx as healthy; do not parse or persist discovered models.

- [ ] Add a local fixture test proving three preferred-target failures move later requests to backup; advance the injected clock through cooldown and verify a failed authenticated probe keeps routing on backup.
- [ ] Add a success case proving an authenticated 2xx probe resets the preferred target and only then routes the next request back to it.
- [ ] Add a concurrency case proving simultaneous post-cooldown requests share one probe and a late old failure cannot reopen a recovered target.
- [ ] Run the new focused tests and confirm they fail because the current cooldown immediately makes the preferred target selectable.
- [ ] Implement probe deduplication, deadline cleanup, authenticated request headers, destination validation, health-state transition and error handling. Probe failure extends the open interval by the configured cooldown and selection continues to the next available target.
- [ ] Run `node --test tests/runtime/gateway-server.test.mjs` and verify all failover cases pass without changing same-request retry behavior.

### Task 3: Full verification and PR evidence

**Files:**
- Create: `docs/tasks/2026-11-23-upstream-credential-routing-stability.md`
- Create: `docs/tasks/evidence/upstream-credential-routing-stability/verification.md`
- Modify: `docs/tasks/2026-11-23-upstream-credential-routing-stability-contract.json`

- [ ] Build the Desktop production bundle, then run `npm test` at repository root and `npm test` under `apps/desktop`.
- [ ] Run `node --check` on changed CommonJS files, parse the contract JSON, and run `git diff --check`.
- [ ] Review the final diff for credential exposure, probe cancellation/timeouts, target isolation and unrelated changes; record all evidence and unavailable checks honestly.
- [ ] Request independent read-only code review and resolve Critical/Important findings with failing tests first.
- [ ] Commit and push only this task's files, then create one dedicated PR against `master`; preserve the worktree for review.
