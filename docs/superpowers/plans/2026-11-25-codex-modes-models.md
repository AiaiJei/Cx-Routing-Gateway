# Codex modes and models implementation plan
> Use superpowers:subagent-driven-development with independent ownership/review. Coordinator owns final integration/validation. Preserve existing dirty revision2 and pre-existing doc edits.
Goal: functional official-vs-Gateway setup, real multiple-model catalogue/default and Codex workspace tabs.
Architecture: source-preserving config service + immutable model catalogue + native official CLI login wrapper + React tabs/draft.
Tech: current Electron/Node/TOML/React stack; no new runtime dependencies.
Spec: docs/superpowers/specs/2026-11-25-codex-modes-models-design.md

## Global constraints
No actual user config/auth access, live login/model requests, commit/push/merge/release. Tests use worktree .tmp/codex-modes-models-20261125. Version1.1.10 and original Desktop executable retained. Existing reasoning config untouched; independent UI setting removed. Full original source preservation/backup/conflict contract still applies.

## Task1 Native modes/catalogue (native worker)
Files: electron/codex-config-service.cjs, codex-config-store.cjs, codex-runtime-client.cjs, codex-errors.cjs, new codex-model-catalog.cjs, codex-ipc.cjs, main.cjs/preload.cjs integration, tests/runtime/codex-config*.test.mjs and codex-ipc.test.mjs.
Consumes installed client-manager module from Task2; exact interface in spec. Produces selection/status/preview union in spec.
- [x] Tests RED: two selected routes/default; all-alias Key validation; official mode without Gateway; mode roundtrip; legacy config; wrong/default/duplicate route; immutable catalogue and failure/restoration/tamper; reasoning untouched.
- [x] Implement minimal isolated catalogue module/source edits. Reuse file protections and pending-backup transaction; immutable catalogue content precedes config commit.
- [x] Wire client manager IPC/main/preload after Task2 exports stable.
- [x] Targeted GREEN and native reviewer gate. Record native-revision3.md.

## Task2 Official CLI login adapter (client worker)
Files exclusively new electron/codex-client-manager.cjs and tests/runtime/codex-client-manager.test.mjs. No main/preload edit (Task1 owns).
Produces createCodexClientManager({codexHome,resolveExecutable?,spawnImpl?,getConfigStatus}), methods getStatus/startLogin/cancelLogin/dispose.
- [x] Tests RED: unavailable/version/status classifications, bounded output/timeouts, no raw secret returns, fixed args/home/no shell, duplicate login and cancel, official-mode/revision gate, browser login completion/failure.
- [x] Implement bounded status/discovery/process lifecycle; no raw credential collection, no logout.
- [x] Focused GREEN and independent review; report client-revision3.md.

## Task3 Frontend navigation/tabs/multiselect (UI worker)
Own src/components/navigation.ts, AppShell.test.tsx, Codex* components, pages/CodexPage*, data/codex-*, domain/codex-management.ts, window.d.ts, styles/codex.css.
Consumes exact native/client APIs from spec. Reuse current workspace route/credential API. No backend/package edits.
- [x] Tests RED: nav order/group/label; tab roles/keyboard/draft retention; checkbox multiselect/default constraints/search; all-selected scoped Key; two modes; no reasoning control; reuse stored Key; direct works with Gateway unavailable; native login states/confirm; stale async result safety.
- [x] Implement components/hooks with clear responsibilities. Status distinguishes saved vs draft config and login; no fake official models.
- [x] Focused GREEN/build; independent UI review. Report ui-revision3.md.

## Task4 End-to-end/runtime/inner-test (coordinator)
- [x] Validate catalogue with installed CLI0.167.0 app-server initialize/model/list in isolated home; assert selected aliases and selected default.
- [x] Full Runtime/Desktop/build and native/browser checks; fix findings and independent whole-revision review.
- [x] Preserve prior executable/data; build separate local1.1.10 candidate if checks pass; write evidence and actual limits. No git integration.
