# Codex route management implementation plan
> Execute using superpowers:subagent-driven-development. Keep task evidence in docs/tasks/evidence/codex-route-management-20261125/.
Goal: turn the Codex placeholder into a working, reversible setup manager and create one dedicated open PR.
Architecture: isolated native configuration service + trusted IPC adapter + existing React workspace UI.
Tech: Electron CommonJS, Node filesystem/HTTP, TOML parser, React/TypeScript, node:test, Vitest.
Spec: docs/superpowers/specs/2026-11-25-codex-route-management-design.md

## Global constraints
The specification and task contract control scope. No real user config/auth access, provider calls, merge, release, version bump or cleanup. Client credentials are redacted from outputs/evidence. Existing routes/keys remain the source of truth. Native host safety and actual runtime tests are distinct from UI mocks.

## Task 1: Native configuration and IPC
Own apps/desktop/electron/codex-*.cjs, main.cjs composition, preload.cjs exposure, apps/desktop/package*.json parser dependency, tests/runtime/codex-*.test.mjs.
- [x] Write focused tests for config status, preview, apply/restore, failures and security boundaries, observe intended failure.
- [x] Implement service and fixed-path file store with backup/restore and safe errors. Add a small maintained TOML runtime dependency only if needed.
- [x] Implement IPC input/trusted-sender checks and local route/key validation; compose in main and expose through preload.
- [x] Test actual file roundtrip and local HTTP fixtures; report commands and failures truthfully.
- [x] Independent task review and fix blockers.
Produces the four exact desktopControls methods and result shapes from the design; no frontend files owned.

## Task 2: Codex management screen
Own apps/desktop/src/pages/CodexPage*, components/Codex*, data/codex-*, domain/codex-*, window.d.ts, styles/codex.css and removal of obsolete codex-only styles in app.css.
- [x] Add behavior tests for eligible routes, preview, client-key creation, explicit apply/restore, failed operations and fixture-mode restrictions; observe intended failure.
- [x] Implement typed API boundary and form with existing components; clear secret only after successful apply, retain on recoverable failure; invalidate previews on selection changes.
- [x] Display status/backup truthfully and configuration formatting/restart/project override limitations.
- [x] Focused tests + TypeScript/build, independent task review and fix blockers.
Consumes Task 1 IPC contract plus useWorkspace and existing createClientKey.

## Task 3: Full evidence, review and PR
Owner: coordinator; README, task contract/docs/evidence and repository ignore entries only.
- [x] Full npm test; npm --prefix apps/desktop test; npm --prefix apps/desktop run build; git diff --check.
- [x] Real browser wide/minimum/narrow screenshots and keyboard/state checks. Isolated Electron/local HTTP smoke verifies the native composition when possible.
- [x] Independent whole-branch review, resolve blocking findings, rerun affected checks.
- [ ] Write acceptance matrix and risk/runtime limitations; commit task paths, push dedicated branch, create and attach one PR against master, verify CI and open state.
No merge/release. Owner installed-client acceptance remains explicitly NOT_RUN.
