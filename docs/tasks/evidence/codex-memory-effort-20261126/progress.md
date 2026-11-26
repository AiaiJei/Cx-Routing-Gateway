# Revision5 progress
Owner memory/effort/scope/credential request. Before snapshot .tmp/codex-memory-effort-20261126/before.json. Existingd1fe810+uncommittedrevisionspreserved.
Task1–4 implementation complete. Integration, independent reviews and separate Desktop delivery complete; Owner retest pending.
Ruling: Memory means route/default/credentialchoices, draft only; no secrets persisted there. Legacy hash-only Key not reconstructible, explicitvalidatedretain/current-token recovery offered; neverauto-rotate.
Ruling: reasoning remains in Codex chooser; Gateway advertises generic forwarding controls and forwardsselectedvalue, not claimprovideracceptance.

- Final source checks: Runtime377/377, Desktop271/271, TypeScript/Vite build, production audit0 and diff check PASS.
- Independent native, protocol, UI, credentials and final integration reviews PASS. All review findings fixed and rechecked.
- Actual installed Codex0.167 local request chain and isolated Electron navigation/restart/credential-ID apply PASS.
- Desktop1.1.10 Memory Test built and verified with two isolated launches; model/default/credential draft and encrypted secrets retained. Original six data files, three older executables and preexisting edits unchanged; original five user processes preserved.
- Remaining: Owner tests their actual Codex/provider. No real login or model-provider call made here. PR25 OPEN at d1fe810; revisions2–5 remain local/uncommitted/unpushed; no merge/release.
- Packaging check initially used forward slashes for a nested ASAR path on Windows, causing a false missing-asset report. Archive listing proved the asset existed; changing the verification script to path.join resolved it. All44 packaged source/assets then matched. Product code and binary were unchanged by this diagnostic correction.
