# Revision 5 local delivery — 2026-11-26

- Desktop: `C:/Users/20142/Desktop/Cx-Routing Gateway Portable 1.1.10 - Codex Memory Test.exe`
- Version: **1.1.10**; Windows x64 portable; unsigned local candidate.
- Size: **115,070,587 bytes**.
- SHA256: `2EF12A661298C107BBD269543A361462B87B78C1C9A5F468E0F5944A1C912EF5`.
- Build directory: apps/desktop/release/1.1.10-codex-memory-20261126. Desktop file copied without overwrite and hash-matched to built portable.
- Packaged version smoke PASS1.1.10. **44** packaged native files/UI assets/affected runtime files byte-match source. Package identity remains @cx-routing-gateway/desktop-ui and appId com.cxrouting.gateway.

## Runtime and preservation

The actual Desktop copy ran twice with one isolated synthetic userData/CODEX_HOME. Both launches reported healthy Control/Gateway services and reused encrypted upstream and client Keys. Routes, model/default/credential draft, master key and encrypted vault bytes remained unchanged; local request logs persisted1→2 and reasoning_effort high reached the loopback fixture each time. No external provider request. Fixture: .tmp/codex-memory-effort-20261126/portable-preservation-5gOyE0. Log: portable-final-smoke.log.

Verified all six original Gateway files against the pre-revision backup: config.json, config.json.bak, secrets.json, runtime-master.key, Local State and Preferences. Total50,967 bytes, unchanged. The backup remains under .tmp/codex-memory-effort-20261126/data-backup. No plaintext contents were printed or decrypted.

Original Desktop Direct Test1.1.10, Modes Test1.1.10 and GitHub Release1.1.9 executable hashes remain unchanged. Original app PIDs22696/6364/21304/20388/20320 remain running. The task did not stop the user's app. The existing modifications to the original plan/progress and deletion of the original ci.md remain as they were before revision5.

Verification script result: .tmp/codex-memory-effort-20261126/delivery-result.json. Vite preview stopped and isolated smoke processes terminated.

## User retest and integration

Exit the old Gateway from its tray menu before opening the new Memory Test executable, so the existing process does not handle the launch. Select saved models/default/credential, review 当前用户 scope, then explicitly 保存并启用网关. Restart Codex/start a new session and choose reasoning effort inside Codex. Remembered choices alone never activate configuration.

Old hash-only Keys cannot be reconstructed. Explicitly read an existing managed Gateway token from current Codex configuration, or enter the matching original Key once to retain it encrypted. Revoked/missing/mismatched/scope-limited Keys remain blocked without automatic rotation.

Real login, actual upstream support for every effort value and Owner acceptance: NOT_RUN. Implementation/local delivery PASS; acceptance PARTIAL. Worktree branch codex/codex-route-management-20261125 remains at d1fe810529ed59455bb1854da05fa21a39d2c671 with local revisions2–5 uncommitted/unpushed. PR25 remains OPEN and unchanged; no master merge or public release.

AWG boundary: direct terminal/file/UI actions are not AWG MCP enforced; see integration.md. Next action: Owner local retest. No additional developer action pending for this local delivery.
