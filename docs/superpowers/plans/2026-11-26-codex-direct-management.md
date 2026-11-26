# Codex direct provider management plan
Use superpowers:subagent-driven-development. Spec: docs/superpowers/specs/2026-11-26-codex-direct-management-design.md.
Goal: correct direct semantics and provide a complete mode-save/provider-management loop.
Constraints: existing1.1.10 local revision preserved; no real user auth/config/provider actions in development, no Git integration. Fixtures .tmp/codex-direct-management-20261126.

## Task1 Native direct profiles and mode switching
Ownership: electron/codex-config-service/store/toml-editor/model-catalog/runtime-client/errors/ipc/main/preload; new codex-direct-*.cjs; tests/runtime/codex-config*,codex-direct*,codex-ipc.
- [x] RED tests saved encrypted profilesCRUD/currentimport/redaction/conflict, advanced direct->gateway->direct preserving unrelated data, directstatus and official noforcedlogin.
- [x] Implement profile store/source projection and exact spec7 new/additive methods, immutable direct catalog refactor, automatic lastdirect capture.
- [x] Native focused tests then review, repair blockers; report native.md.

## Task2 Frontend top-level modes and profiles
Ownership: pages/CodexPage*, components/Codex*, data/codex-* except codex-login hook, domain/window/styles.
- [x] RED tests top modes view-only, actualactive vs viewed, current custom metadata/noofficialfallback, inline savepreviewconfirmfeedback, supplierCRUD/dialogs, gateway models/scopedKey, tab/focus/StrictMode.
- [x] Reuse existing controls; modular direct-profile list/form/hook and top-level mode header; no hidden mandatory save step; status accurate.
- [x] Targeted/build/review; report ui.md.

## Task3 Client diagnostics compatibility
Ownership: codex-client-manager.cjs+test; data/codex-login.ts/tests only if needed, coordinate UI.
- [x] Reproduce warning-prefixed version output; parse unique exact version line, ambiguous remainsunknown.
- [x] Adapt official gate to direct/kindofficial; preserve login safeguards and statusredaction; testsPASS reportclient.md.

## Task4 Coordinator
- [x] Record CC Switch research/pinned SHA/spec; prepare independent review packages from pre-rev4 snapshot including untracked.
- [x] Real CLIconfig/model list on generateddirect/gateway + native UI CRUD/modes+restore; fullRuntime/Desktop/build/audit; independent whole revisionreview.
- [x] Build distinctlocal1.1.10candidate, preserve prior data/binaries, smoke and evidence; no commit/push.
