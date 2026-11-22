# Upstream Service Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit an existing upstream through a prefilled Desktop dialog while preserving credentials and existing security settings safely.

**Architecture:** Reuse the authenticated Local Control PATCH endpoint through the established Electron IPC and WorkspaceClient layers. Keep the API Key blank in the renderer until the user enters a replacement. Make key rotation retain the old credential until the replacement is persisted; omitted private-network permission preserves the current upstream trust setting.

**Tech Stack:** React, TypeScript, Electron IPC, existing Local Control API and SecretVault, Vitest, Node.js `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-22-upstream-service-edit-failover-stability-design.md`

## Global Constraints

- Do not add runtime dependencies or create a second upstream update endpoint.
- Keep API keys out of workspace responses and never prefill them in the dialog.
- Preserve the existing upstream's private-network trust when an edit omits that setting.
- Blank API Key means keep the current credential; a submitted replacement becomes active only after persistence succeeds.
- Keep fixture-mode edits session-only and do not imply a network operation.

## Review Focus

- An empty replacement key must preserve the current credential reference; test that the form omits the key and the API leaves the reference unchanged.
- A failed vault write or config persistence must not remove the active old key; test both failure points.
- Editing a private-network Base URL without changing its permission must preserve trust and pass destination validation.
- Renderer bridge calls must retain sender validation and encoded upstream IDs; test the WorkspaceClient-to-IPC shape.
- Failed edits must preserve entered values and the listed upstream; test the modal error state.

---

### Task 1: Pin safe PATCH update semantics

**Files:**
- Modify: `tests/runtime/control-server.test.mjs`

**Interfaces:**
- Exercise the existing `PATCH /v1/control/upstreams/:id` contract with a temporary `ConfigStore`, `SecretVault`, and local HTTP server.

**Steps:**
- [x] Add a test that changing a private upstream's Base URL while omitting `allowPrivateNetwork` preserves its current trust and updates the approved address snapshot.
- [x] Add a test that a rejected `vault.put` while rotating `apiKey` leaves the old `credentialRef` and old secret usable.
- [x] Add a test that successful rotation persists the new reference before retiring the prior secret.
- [x] Run `node --test tests/runtime/control-server.test.mjs` and confirm each new assertion exposes current behavior.

**Acceptance:** Tests fail for the existing destructive key ordering and omitted trust handling, while the existing PATCH contract remains intact.

### Task 2: Make Local Control edits preserve working state

**Files:**
- Modify: `services/local-control/src/server.mjs`
- Test: `tests/runtime/control-server.test.mjs`

**Interfaces:**
- Keep the current PATCH route and response shape; adjust only upstream update ordering and optional trust semantics.

**Steps:**
- [x] Use the existing `trustedPrivateNetwork` value when `allowPrivateNetwork` is omitted during Base URL validation and persistence.
- [x] Write a replacement secret before updating the upstream reference.
- [x] If config persistence fails, remove only the newly written secret and preserve the old reference.
- [x] Remove the old secret only after the new reference is persisted; keep an update successful if post-commit old-secret cleanup needs separate handling.
- [x] Run the focused control-server tests and verify the new tests pass.

**Acceptance:** Failed edits keep the prior usable upstream config and credential; successful edits use the new values without exposing secret material.

### Task 3: Expose upstream update across the Desktop bridge

**Files:**
- Modify: `apps/desktop/electron/main.cjs`
- Modify: `apps/desktop/electron/preload.cjs`
- Add: `apps/desktop/electron/upstream-edit-ipc.cjs`
- Modify: `apps/desktop/src/window.d.ts`
- Modify: `apps/desktop/src/data/workspace-client.ts`
- Test: `apps/desktop/src/data/workspace-client.test.ts`
- Test: `tests/runtime/upstream-edit-ipc.test.mjs`

**Interfaces:**
- Add `updateUpstream(id, input)` with required trimmed `name` and `baseUrl`, optional `apiKey`, and no credential read operation.
- Route the call through an IPC handler that validates sender and ID, then PATCHes the existing local-control endpoint with the runtime control token.

**Steps:**
- [x] Add a WorkspaceClient test that verifies the renderer forwards an upstream ID and only the submitted editable fields to `desktopControls.updateUpstream`.
- [x] Confirm the test fails because no update operation exists.
- [x] Register the update handler through a small main-process IPC module, using the same trusted-sender and ID validation patterns as create/delete operations.
- [x] Test that IPC rejects untrusted or malformed requests, encodes upstream IDs, attaches the control token, and omits a blank replacement key.
- [x] Expose the handler through preload and declare its TypeScript shape.
- [x] Implement the runtime WorkspaceClient method; do not expose a method on the fixture client that implies persistence.
- [x] Run the focused WorkspaceClient test and TypeScript check.

**Acceptance:** The live Desktop path invokes the authorized existing PATCH API without returning a credential to the page.

### Task 4: Add the prefilled edit dialog

**Files:**
- Modify: `apps/desktop/src/domain/types.ts` only if the existing upstream shape needs an explicit editable input type.
- Modify: `apps/desktop/src/pages/UpstreamsPage.tsx`
- Modify: `apps/desktop/src/pages/UpstreamsPage.test.tsx`

**Interfaces:**
- Add a row-level Edit action and an `EditUpstream` dialog state that carries the selected upstream.
- Reuse the existing `Modal`, `TextField`, `Button`, WorkspaceClient, and feedback patterns.

**Steps:**
- [x] Add tests for opening a prefilled edit dialog, blank API Key, saved live edits followed by workspace refresh, error retention, and session-only fixture edits.
- [x] Confirm these tests fail before implementing the dialog.
- [x] Implement the row Edit action and prefilled name/Base URL controls; leave Key empty and optional with a clear hint that blank keeps the existing key.
- [x] On successful live update, refresh workspace data, close the dialog, and show status; on failure keep the dialog/input state and show an alert.
- [x] In fixture mode, update only local page state and use copy that states the change is session-only.
- [x] Run the focused upstream-page test.

**Acceptance:** Live edits persist through the IPC path, fixture edits stay local, and errors never discard the user's input.

### Task 5: Verify the Desktop and control paths

**Files:**
- No additional production files.

**Steps:**
- [x] Run the complete Local Control and Gateway runtime suite with `npm test` from the repository root.
- [x] Run the complete Desktop test suite with `npm test` from `apps/desktop`.
- [x] Run the Desktop production build with `npm run build` from `apps/desktop`.
- [x] Run `git diff --check` and review all changed files for secret exposure, route scope, and unrelated edits.

**Acceptance:** Runtime tests, Desktop tests, TypeScript/Vite build, and diff checks pass. Combine this plan's deliverables with the Gateway failover plan in one dedicated PR against `master`.
