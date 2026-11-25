# Native Codex management implementation evidence
Date: 2026-11-25
Task: CXRG-CODEX-ROUTE-MANAGEMENT-20261125
Worktree: C:/Users/20142/Desktop/Cx-Routing Gateway/.tmp/worktrees/codex-route-management-20261125
Status: implementation and native verification PASS; independent review and installed-client acceptance not claimed.

## Changes and ownership
- codex-config-store.cjs owns bounded fixed-path IO, content revisions, immutable content-addressed original snapshots, write-ahead recovery state and atomic configuration replacement.
- codex-config-service.cjs owns TOML parsing/serialization, managed provider changes, redacted status/preview, input validation and apply/restore orchestration.
- codex-runtime-client.cjs owns authenticated loopback Control/Gateway reads, enabled Responses-route eligibility and scoped client-Key catalogue validation. Redirects, oversized/invalid responses and unavailable runtime fail closed; it never generates model requests.
- codex-ipc.cjs owns trusted-sender gate and sanitized native error boundary. main.cjs lazily composes the service; preload exposes four fixed channels.
- Added smol-toml 1.9.1 as an exact runtime dependency. npm reports its CommonJS export, Node >=18 and BSD-3-Clause license. Existing package/product version remains 1.1.9.
- Tests are tests/runtime/codex-config.test.mjs and codex-ipc.test.mjs. Only temporary homes under the task worktree .tmp/codex-route-management-20261125 are used.

## Interface
desktopControls methods match the design exactly:
- getCodexStatus() -> CodexStatus
- previewCodexConfig({routeId, reasoningEffort?}) -> CodexPreview
- applyCodexConfig({routeId, reasoningEffort?, clientKey, expectedRevision}) -> CodexStatus
- restoreCodexConfig({backupId, expectedRevision}) -> CodexStatus

Channels: runtime:codex-status / preview / apply / restore.
revision is 'missing' or a 64-character SHA-256 hex digest. backup.id is a SHA-256 digest of the immutable backup JSON, not a path or UUID.
CodexStatus: configPath, exists, revision, configured, credentialConfigured; optional model, baseUrl, reasoningEffort, backup:{id,createdAt}.
CodexPreview: configPath, revision, model, baseUrl, configPreview, replacesCurrentProvider.
Safe errors: CODEX_INPUT_INVALID, CONFIG_CHANGED, CONFIG_INVALID, CONFIG_TOO_LARGE, PATH_UNSAFE, BACKUP_INVALID, IO_FAILED, ROUTE_UNAVAILABLE, RUNTIME_UNAVAILABLE, KEY_REJECTED (all prefixed CODEX_). Each has a fixed Chinese message; raw filesystem/parser/network errors are discarded.

## Behavior and safety evidence
- Status/preview do not initialize a missing home/config and never return direct keys, existing headers, unrelated provider URLs or unredacted existing configuration.
- Apply rechecks active route before and after local Key validation, then checks the source revision before backup and immediately before config replacement.
- Managed auth conflicts (env_key, env_key_instructions, gateway_oauth, case-insensitive Authorization/x-api-key/api-key in static or environment headers) are removed within the managed provider. Other provider/settings semantics remain intact; exact original bytes are recoverable.
- Existing malformed TOML or invalid UTF-8/oversized/nonregular files fail safely; symlink/junction ancestors, config/state/backup links and hardlinked files are rejected.
- File and directory creation uses 0600/0700 modes where supported. Temp writes are exclusive and flushed. Backups contain exact original bytes, original-presence marker, before/after revisions and creation time.
- A write-ahead state record is persisted before config rename. On restart, the current revision identifies whether the prepared apply committed, failed, or restore completed. A failed next apply or restore retains the previous applicable recovery record.
- Restore checks expected revision, current applied hash, active backup identity and backup content hash before replacement. Missing-original restore removes only generated config.toml.
- Successful config rename is the commit boundary. Its result is returned from known committed bytes; a later status-read or temporary-cleanup failure cannot falsely report the operation failed.
- Native tests use actual ConfigStore, Local Control and Gateway servers to prove scoped-Key validation and isolated file apply/restore. Gateway usage remains empty; no model generation occurs.

## Commands and results
1. RED: node --test tests/runtime/codex-config.test.mjs -> expected MODULE_NOT_FOUND before implementation.
2. GREEN initial: same command -> 14/14 PASS.
3. RED: node --test tests/runtime/codex-ipc.test.mjs -> expected MODULE_NOT_FOUND before runtime client/IPC implementation.
4. GREEN: both files -> 20/20 PASS.
5. Added post-commit status-read regression: 16/17 pass, expected CODEX_IO_FAILED reproduced; fixed returning known committed result.
6. Added post-commit cleanup regression: focused case failed with expected CODEX_IO_FAILED; fixed cleanup not to alter commit outcome.
7. Final focused: node --test tests/runtime/codex-config.test.mjs tests/runtime/codex-ipc.test.mjs -> 24/24 PASS, 0 skipped, including symlink/junction tests on this host.
8. Native module and main syntax: node --check -> PASS.
9. First npm test -> 276/277; npm install had dropped the pre-existing custom cxrgProductVersion field in the lock root. Restored that field without changing its value. release-manifest.test.mjs -> 2/2 PASS.
10. Fresh npm test -> 277/277 PASS, 0 failures/skips, duration about 5.7 seconds.

## Limitations and handoff
- Windows runtime smoke/renderer UI and whole-branch review are coordinator-owned and not claimed by this report.
- No Owner Codex home/config/auth file was read or modified. No real provider/model traffic, version bump, installed binary replacement, commit, push, merge, release or unrelated cleanup was performed by this worker.
- TOML serialization normalizes formatting/comments; exact original bytes live in the backup.
- Direct client Keys and original configs/backups are plaintext at the fixed local Codex location. On Windows, inherited ACLs govern access; POSIX mode arguments do not encrypt files or guarantee Windows ACL isolation.
- Writes are serialized within this Electron process, including multiple service instances. Source checks reduce lost updates from outside editors, but no OS-wide lock or race elimination against a noncooperating filesystem writer is claimed.
- File bytes are flushed before rename. Directory-entry durability under sudden power loss is platform dependent and was not physically crash-tested; restart behavior is tested via actual persisted write-ahead state and injected IO failures.
- Old backup files are retained. The UI exposes the current applicable backup; backup deletion/pruning is outside this task.
- Native edits were performed using repository file/terminal tools after coordinator scope verification; individual writes were not executed through AWG MCP.
