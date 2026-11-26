# Revision5 implementation plan
Spec: docs/superpowers/specs/2026-11-26-codex-memory-effort-design.md.
Use subagent-driven-development with distinctownership and independentreview. Allworklocal, no actualaccount/config/provider actions.
- [x] Task1 credentialworker: create/rotate encryptedclientsecret, sanitizedlist/read/retain API, races/legacyfailuretests.
- [x] Task2 nativeworker: user-scopedpersistentdraft, credential bridge/currentread/IDapply, configScope, versioned Gateway reasoningcatalog; nativefixturetests.
- [x] Task3 protocolworker: normalize/serialize effort, allprotocol/requestlog regressions, actualCodexlocal requestproof.
- [x] Task4 UIworker: rememberedselection/autosavefeedback/dropdown+retainlegacy/current, scopeprompt, noextraRGreasoningselector; StrictMode/asynctests.
- [x] Coordinator: fullregression/build; nativeUI+CLIproof; independentreviews/fixes; separate1.1.10localcandidate preserveoldstate.

Local delivery complete. Owner real-account/provider retest NOT_RUN; no commit/push/merge/release. Evidence: docs/tasks/evidence/codex-memory-effort-20261126/acceptance.md.
