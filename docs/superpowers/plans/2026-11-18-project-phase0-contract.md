# Project Phase 0 Contract Plan

> **For agentic workers:** Use the native execution workflow for the tasks below. Steps use checkbox syntax. The original phase-0 design tasks are complete; the runtime foundation tasks below are the first implementation slice.

**Goal:** Approve the protocol, architecture, lifecycle, and security contracts, then deliver a runnable local-control and Gateway runtime foundation.

**Architecture:** Preserve the existing Electron/React/TypeScript Desktop shell and add a dependency-light Node runtime for shared configuration, encrypted secrets, loopback control, Gateway authentication, route resolution, native forwarding, and a strict text conversion profile. Later stages can replace the adapters without changing control contracts.

**Tech Stack:** Existing Electron, React, TypeScript, and Vite Desktop shell; backend language, persistence engine, packaging, and provider SDKs remain phase-0 decisions unless the Owner explicitly selects them.

**Spec:** `docs/superpowers/specs/2026-11-18-project-phase0-contract-design.md`

## Global Constraints

- The Owner selected Responses, Messages, and Chat Completions as the Res/Mes/Chat protocol families; exact API paths and version pins must be recorded.
- Inbound protocol comes from each downstream request; outbound protocol comes from its selected model route; responses return in the original inbound protocol.
- Do not claim full interchangeability or silently drop semantics.
- Do not write runtime, API, IPC, persistence, migration, or deployment code during phase 0.
- Runtime foundation code is authorized only under `packages/shared/**`, `services/local-control/**`, `services/gateway/**`, and `tests/runtime/**`.
- Preserve unrelated untracked paths and worktrees.
- Keep lifecycle, listener, storage, and runtime decisions marked proposed or pending until Owner acceptance.

## Review Focus

- API version labels can be confused with model versions; acceptance must test that protocol pins never select a model ID.
- New optional fields or streaming event variants can arrive without a dated OpenAI API version; acceptance must require schema-drift review and unknown-event behavior.
- The Messages `2026-10-21` profile removes sampling parameters and rejects certain document/citation placements; acceptance must include explicit unsupported/lossy conversion cases.
- Private/local upstreams may be legitimate; SSRF controls must distinguish explicit trusted destinations from arbitrary or rebound targets.
- Desktop crash/close can leave a Gateway orphan; lifecycle criteria must cover normal exit and abnormal termination.

---

### Task 1: Pin protocol identities and version evidence

**Files:**
- Modify: `docs/superpowers/specs/2026-11-18-project-phase0-contract-design.md`
- Test: the protocol table, official source links, and endpoint names in the specification

**Interfaces:**
- Produces stable identifiers `Res`, `Mes`, `Chat` and a rule separating protocol version from upstream model ID.

- [x] Record `POST /v1/responses` and `POST /v1/chat/completions` as OpenAI API v1 surfaces; require a reference schema hash before implementing adapters.
- [x] Record `POST /v1/messages` with `anthropic-version: 2026-10-21`; list breaking changes relevant to normalized features.
- [x] Verify official endpoint and version references and amend stale field names.
- [ ] Record Owner approval of the exact baseline.

### Task 2: Define normalized conversation and conversion matrix

**Files:**
- Modify: `docs/superpowers/specs/2026-11-18-project-phase0-contract-design.md`

**Interfaces:**
- Produces domain drafts for inbound request context, ordered content parts, tool definitions/results, response metadata, normalized streaming events, and stable errors.
- Produces one explicit capability record for each of `Res->Res`, `Res->Mes`, `Res->Chat`, `Mes->Res`, `Mes->Mes`, `Mes->Chat`, `Chat->Res`, `Chat->Mes`, and `Chat->Chat`.

- [x] Define capability rows for text, roles/instructions, images/files, tool calls/results, structured output, sampling controls, usage/finish metadata, and streaming.
- [x] Assign each capability `supported`, `lossy-with-explicit-policy`, or `unsupported` for all nine directions.
- [x] Define stable rejection and stream termination semantics for unsupported input, preserving request correlation IDs.
- [x] Add fixture/test-vector requirements for request, response, tool, error, and stream cases to the owning direction.

### Task 3: Define local interfaces and lifecycle boundaries

**Files:**
- Modify: `docs/superpowers/specs/2026-11-18-project-phase0-contract-design.md`

**Interfaces:**
- Produces responsibility and API/interface drafts for Desktop composition, local control, Gateway ingress, routing, protocol adapters, upstream calls, credential references, persistence, and usage records.

- [x] Draft the proposed normal-close/crash behavior, tray/background residency, OS startup, and single-instance policy; Owner acceptance remains pending.
- [x] Draft loopback listener, port-conflict behavior, and LAN exclusion for the first release; Owner acceptance remains pending.
- [x] Define the proposed control-plane trust boundary and secret flow between renderer, Desktop process, and Gateway.
- [x] Keep runtime, storage, and security-policy decisions explicitly proposed or pending until Owner acceptance.

### Task 4: Complete threat model and stage gates

**Files:**
- Modify: `docs/superpowers/specs/2026-11-18-project-phase0-contract-design.md`
- Modify: `docs/task-record.md`
- Modify: `README.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Produces assets, trust boundaries, abuse cases, mitigations, residual risks, and verification cases for later implementation stages.

- [x] Cover credential storage, client-key lifecycle, local control access, DNS/IP rebinding, redirects, request limits, logs/redaction, and crash recovery.
- [x] Define verification evidence and rollback for storage/control plane, protocol adapters/data plane, operations, and packaging.
- [x] Require a separate task contract and independently testable acceptance gate for each later work package.
- [x] Record skill triage, Repo Map availability, source evidence, and Owner acceptance state in the task record.
- [x] Correct the README status so the fixture-backed Desktop UI is distinguished from unimplemented runtime services.
- [x] Correct the architecture tree's Desktop status while keeping Gateway lifecycle and backend marked unimplemented.

### Task 5: Validate and independently review the contract

**Files:**
- Validate: `.codex/awg-task.json`
- Validate: `docs/superpowers/specs/2026-11-18-project-phase0-contract-design.md`
- Validate: `docs/superpowers/plans/2026-11-18-project-phase0-contract.md`
- Validate: `docs/task-record.md`
- Validate: `README.md`
- Validate: `docs/architecture.md`

**Interfaces:**
- Produces a reviewed phase-0 contract with recorded findings and no runtime implementation claims.

- [x] Parse the task contract as JSON and verify every changed path is authorized.
- [x] Check document links and `git diff --check`.
- [x] Run an independent read-only review; address or record its findings.
- [ ] Obtain Owner acceptance before creating an implementation-phase contract.

### Task 6: Runtime foundation

**Files:**
- Create: `package.json`
- Create: `packages/shared/src/config-store.mjs`
- Create: `packages/shared/src/secret-vault.mjs`
- Create: `services/local-control/src/server.mjs`
- Create: `services/gateway/src/server.mjs`
- Create: `apps/desktop/electron/runtime-supervisor.cjs`
- Modify: `apps/desktop/electron/main.cjs`
- Test: `tests/runtime/*.test.mjs`

**Interfaces:**
- `ConfigStore` persists versioned configuration using atomic replacement and a backup.
- `SecretVault` encrypts upstream secrets using an application master key and returns opaque references.
- Local control exposes loopback JSON endpoints for state, upstream creation, route creation, client-key creation/revocation.
- Gateway authenticates client keys, resolves inbound protocol and model route, performs native forwarding or strict `TextCore-1` conversion, and emits sanitized stable errors.

- [x] Write failing runtime tests for persistence, control-plane records, one-time keys, native forwarding, cross-protocol conversion, and unsupported feature rejection.
- [x] Run tests to observe missing runtime modules.
- [x] Implement the minimal runtime foundation and run the full runtime suite.
- [ ] Add CRUD update/delete/model discovery/connectivity-test endpoints and Desktop IPC integration.

### Task 7: Desktop runtime bridge

**Files:**
- Modify: `apps/desktop/electron/main.cjs`
- Modify: `apps/desktop/electron/preload.cjs`
- Create: `apps/desktop/electron/runtime-supervisor.cjs`
- Modify: `apps/desktop/src/data/workspace-client.ts`
- Modify: `apps/desktop/src/data/use-workspace.ts`
- Modify: `apps/desktop/src/domain/types.ts`
- Modify: `apps/desktop/src/pages/*.tsx`

**Interfaces:**
- Electron owns child-process startup/shutdown and exposes only typed state/test IPC to the renderer.
- Renderer uses runtime state when IPC is available and falls back to clearly labeled fixtures in browser tests.

- [x] Add supervisor health/start/stop test.
- [x] Wire Electron main/preload IPC and runtime master-key bootstrap.
- [x] Map control state to UI domain types and distinguish live runtime from fixtures.
- [x] Run Desktop tests/build and runtime tests.

### Task 8: Protocol matrix and streaming baseline

**Files:**
- Modify: `services/gateway/src/server.mjs`
- Modify: `services/local-control/src/server.mjs`
- Modify: `apps/desktop/src/data/workspace-client.ts`
- Modify: `apps/desktop/src/pages/CredentialsPage.tsx`
- Test: `tests/runtime/gateway-server.test.mjs`, `tests/runtime/control-server.test.mjs`

**Interfaces:**
- Six off-diagonal text conversions are exercised with the route-selected outbound profile.
- Native same-protocol requests preserve unknown fields, tools, and SSE wire events; cross-protocol streaming remains explicitly rejected.
- Model discovery persists the discovered model IDs for route editing.

- [x] Add tests for the remaining cross-protocol directions and native field preservation.
- [x] Implement native SSE pass-through with response-size and duration bounds.
- [x] Persist model discovery results and expose them to the Desktop renderer.
- [x] Add route update and client-key rotation endpoints with Desktop credential actions.
- [x] Connect Desktop upstream and route create/delete actions to the control API; keep browser fixtures session-only.
- [x] Implement text-only cross-protocol SSE conversion and one function-tool definition/call conversion.
- [ ] Implement streamed tool-call deltas and complex multi-tool orchestration under separate capability gates.

### Task 9: Operational entrypoints

**Files:**
- Create: `scripts/runtime-health.mjs`
- Create: `deploy/.env.example`
- Create: `apps/desktop/electron-builder.yml`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/package-lock.json`
- Modify: `deploy/README.md`
- Modify: `package.json`

**Interfaces:**
- `npm run health` checks control and Gateway health endpoints and exits non-zero on failure.
- Deployment documentation defines environment variables, config backup, and rollback procedure without committing secrets.

- [x] Add health-check script and environment sample.
- [x] Document current backup/rollback path and remaining packaging limits.
- [x] Persist request duration and rejected/failed status codes and expose aggregate metrics.
- [ ] Complete installer, automatic update, clean-machine packaging, and release acceptance.
- [x] Generate an unsigned Windows NSIS installer with Electron Builder; clean-machine, signing, update, and release acceptance remain pending.
