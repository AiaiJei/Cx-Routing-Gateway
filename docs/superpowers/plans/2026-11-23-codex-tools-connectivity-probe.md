# Codex Tools and Connectivity Probe Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make Codex namespaced function/custom tools work through Res-to-Chat/Mes adapters and make failback health checks test transport connectivity without sending an HTTP/API request.

**Architecture:** Normalize Responses namespace members into target-protocol function tools while retaining reversible source metadata for request choices, responses, history, and streams. Represent custom freeform input as a target JSON function with one string field, carry the original format instructions in its description, and restore the raw input; Chat/Mes cannot enforce arbitrary grammar. Probe a DNS-approved address with TCP for HTTP or a verified TLS handshake for HTTPS; retain the existing circuit state and probe deduplication.

**Tech Stack:** Node.js built-in HTTP/TCP/TLS modules, Node test runner, existing Res/Mes/Chat adapter.

**Spec:** docs/tasks/2026-11-23-codex-tools-connectivity-probe-contract.json

## Global Constraints

- Do not call a real upstream provider or send a model/API request from a recovery probe.
- Keep existing circuit thresholds, cooldowns, per-target health isolation, and generation handling.
- For the original implementation, do not make real provider calls. Release-stage authorization is recorded as revision 1 in the task contract.
- Keep unsupported tool semantics explicit in field/direction errors; do not silently drop tools.
- Preserve all changes and untracked user files outside the named worktree.

## Review Focus

- Duplicate or long namespace/member names must map to unique target function names and restore the original identity.
- A namespace-qualified explicit tool choice must select the matching target name; ambiguous or unknown choices must fail with a safe field error.
- Custom tool input, history, and streaming must return a Responses custom call with its namespace and raw input.
- Built-in Responses tool types that Chat/Mes cannot represent must not be silently serialized as ordinary functions.
- DNS changes, unapproved/private addresses, failed TCP/TLS handshakes, and probe timeout must not mark the preferred target healthy or expose credentials.

---

### Task 1: Preserve Codex Namespaced Tools

**Files:**
- Modify: services/gateway/src/protocol-adapters.mjs
- Modify: services/gateway/src/server.mjs
- Test: tests/runtime/protocol-adapters.test.mjs
- Test: tests/runtime/gateway-server.test.mjs

**Interfaces:**
- parseRequest(protocol, body, profile) returns target-safe tools plus source identity (name, optional namespace, and kind) and resolves explicit choices to the serialized target name.
- parseResponse(protocol, body, toolContext) and stream serialization use the normalized tool context to restore Responses source identity.
- Custom tools map to a target function with one string input and original format instructions; responses return as custom_tool_call with the original freeform input. Do not claim that a Chat/Mes target enforces an arbitrary source grammar.

- [x] Write a failing test for namespace groups containing function tools, exact target tool names, and namespace-qualified tool_choice.
- [x] Run node --test tests/runtime/protocol-adapters.test.mjs; verify it fails because namespace groups are rejected or lose their identity.
- [x] Write failing non-streaming and streaming tests for namespaced function calls, custom tool calls, and follow-up tool output history.
- [x] Run the focused adapter tests and verify the failures identify missing namespace/custom conversion.
- [x] Implement reversible namespace/name mapping, custom string-input adaptation, response/history restoration, and matching streaming events.
- [x] Run node --test tests/runtime/protocol-adapters.test.mjs; all adapter tests pass.
- [x] Run focused Gateway protocol tests in tests/runtime/gateway-server.test.mjs; converted HTTP/SSE requests preserve the same tool identity.
- [x] Commit the plan, contract, task binding, and verified adapter changes as the Task 1 commit.

### Task 2: Make Failback Probes Transport-Only

**Files:**
- Modify: services/gateway/src/server.mjs
- Test: tests/runtime/gateway-server.test.mjs

**Interfaces:**
- probeTarget keeps DNS destination validation and cooldown state, then calls a bounded transport check using the URL origin and approved IPs.
- HTTP upstreams use TCP connect; HTTPS upstreams use a TLS handshake with the original hostname for SNI and certificate validation.
- The probe takes no credential and sends no HTTP request; a narrow injected connectivity function is permitted for deterministic timeout/deduplication tests.

- [x] Replace the existing /v1/models-based success test with a failing assertion that a successful post-cooldown probe does not create an HTTP request or credential lookup.
- [x] Add failing tests for TCP failure keeping the backup selected and concurrent calls sharing one probe.
- [x] Run the focused probe tests and confirm the old authenticated HTTP probe violates the expected boundary.
- [x] Implement bounded TCP/TLS connectivity checks over approved addresses, retaining DNS validation, abort/timeout handling, and deduplication.
- [x] Run all focused probe tests; verify failed connectivity stays on backup and successful connectivity restores preferred priority.
- [x] Commit the verified transport-probe change as the Task 2 commit.

### Task 3: Verify, Review, and Open the Dedicated PR

**Files:**
- Update: docs/tasks/2026-11-23-codex-tools-connectivity-probe-contract.json
- Create: docs/tasks/2026-11-23-codex-tools-connectivity-probe.md
- Create: docs/tasks/evidence/codex-tools-connectivity-probe/verification.md
- Update: .codex/awg-task.json

- [x] Run the full Runtime suite, Desktop suite, Desktop production build, changed-file syntax checks, and git diff --check.
- [x] Review the full branch against the plan using a fresh read-only reviewer; resolve Critical/Important findings with RED/GREEN tests.
- [x] Record exact commands, results, review limits, and provider NOT_RUN status in task evidence and contract.
- [x] Commit final evidence and task-state updates, push the task branch, and create one dedicated PR against master.
- [x] Leave the PR open; do not merge, bump a version, publish, copy a Desktop binary, or delete the worktree.

### Task 4: Version, Merge, and Release 1.1.7

**Files:**
- Update: apps/desktop/package.json
- Update: apps/desktop/package-lock.json
- Update: apps/desktop/electron-builder.yml
- Update: apps/desktop/src/pages/SettingsPage.test.tsx
- Update: tests/runtime/release-manifest.test.mjs
- Update: scripts/verify-release.mjs
- Update: docs/tasks/2026-11-23-codex-tools-connectivity-probe-contract.json
- Update: docs/tasks/2026-11-23-codex-tools-connectivity-probe.md
- Update: docs/tasks/evidence/codex-tools-connectivity-probe/verification.md

**Interfaces:**
- Package, product, lockfile root, builder, UI version expectation, test expectation, and verifier must agree on 1.1.7.
- Release output is `apps/desktop/release/1.1.7-final-reviewed/`; Desktop destination is `Cx-Routing Gateway Portable 1.1.7.exe`.
- GitHub release assets are Setup, Setup blockmap, Portable, and manifest; preserve v1.1.6 and its Desktop copy.

- [x] Record this explicit authorization revision and release acceptance/rollback gates before code or release writes.
- [x] Change all current product-version metadata and assertions from 1.1.6 to 1.1.7; run focused release tests, full Runtime and Desktop suites, Desktop build, syntax, and diff checks.
- [x] Commit and push the version change to PR #21; merge only after checks on the new head succeed.
- [x] Fast-forward and verify the primary `master` worktree while preserving unrelated untracked directories and all other worktrees.
- [x] Build Windows x64 artifacts in a confirmed-new output directory; verify manifest, packaged smoke, Portable smoke, and SHA-256.
- [x] Publish GitHub v1.1.7 only after all local gates pass; verify tag and uploaded asset digests.
- [x] Copy Portable to the confirmed-new Desktop path and verify its digest and isolated health smoke.
- [x] Record exact final commit, PR checks, artifact hashes, release asset state, Desktop path, and provider `NOT_RUN` state.
