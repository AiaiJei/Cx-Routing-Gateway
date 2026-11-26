# Revision3 progress
Plan: docs/superpowers/plans/2026-11-25-codex-modes-models.md
User confirmed multi-model actual Codex picker + default and official ChatGPT mode.
Baseline source d1fe810 + revision2 uncommitted1.1.10 version changes. Pre-existing plan/progress modifications and ci.md deletion left untouched.
Preflight: Task1/2 interface getStatus/startLogin/cancelLogin fixed, Task1 owns main/preload. Task1/3 selection/status/preview exact spec union, Task3 owns TS. Task2/3 client status enums fixed. Distinct file ownership; services and UI can proceed against contract. Task4 consumes actual results.
Task1 pending; Task2 pending; Task3 pending; Task4 pending.
Task1 implementation45 targetedPASS; native reviewPASS plus minor interrupted-link retry recovery fixed/re-reviewedPASS.
Task2 implementation18 targetedPASS; client independent reviewPASS. Actual sign-in NOT_RUN.
Task3 implementation35 targeted/231fullDesktop/buildPASS; UI review found StrictMode busylock and focus transfer, fixes23targeted/tscPASS, re-review pending.
Task4 actual generated-catalog CLI0.167 proofPASS (selected2/defaultbeta, official config removal, restore). Electron native UI multi-select2/defaultbeta/apply→official→restorePASS; actual disk metadata confirmed and modelRequests0. No login initiated; client status read uses isolated auth file mode.
Ruling: Required generic base instructions shipped as unmodified Apache2 official fallback with LICENSE/NOTICE, pinned rust-v0.167.0, because actual CLI rejected missing template. No model-specific policy/capability claims copied.
Ruling: Keep source changes local and build a distinct1.1.10 candidate for Owner retest; prior delivery binary remains. No additional version increment or PR push inferred.
Ruling: Use content-addressed immutable local model catalogue, with config as activation pointer; this preserves old catalogue during config rollback and does not add a second model router.
