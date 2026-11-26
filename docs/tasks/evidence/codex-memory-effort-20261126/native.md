# Native Gateway memory, reasoning catalogue and credential bridge — revision5
Date:2026-11-26 (Asia/Shanghai). Task CXRG-CODEX-ROUTE-MANAGEMENT-20261125, contract revision5.
Worktree:C:/Users/20142/Desktop/Cx-Routing Gateway/.tmp/worktrees/codex-route-management-20261125
Status:implementation and focused native verification PASS. Independent review/full application/package checks are coordinator-owned.

## Remembered choices
New codex-gateway-preferences.cjs owns a fixed app userData/codex-gateway-preferences.json file. It stores only route IDs/default and credential source/ID; it never stores Key, prompt or configuration contents. Each entry is bound to SHA256 of the normalized absolute Codex home. Different homes share no choices even when using the same app file. The format is strict/versioned/bounded, with max100 unique route IDs/default-in-selection or an empty draft, source current/stored/manual and stored-only credentialId.

Reads report revision/exists and never create the file. With no entry, only an active valid managed Gateway catalogue supplies initial route/default IDs; saved drafts take precedence and remain while direct mode is active. No native preference operation applies Codex config. File writes are atomic and serialized across instances with optimistic revision checks, directory/file/link protections and safe corruption/conflict errors. Corrupt data is not silently replaced.

Exact new methods:
- getCodexGatewayPreferences -> runtime:codex-gateway-preferences
- saveCodexGatewayPreferences -> runtime:codex-gateway-preferences-save
- getCodexGatewayCredentials -> runtime:codex-gateway-credentials
- retainCodexGatewayCredential -> runtime:codex-gateway-credential-retain

main.cjs supplies the fixed native preferencesPath. Renderer cannot supply any filesystem path. Status adds configScope:'user'; configPath remains the native resolved CODEX_HOME/config.toml. Scope labels and debounced UI draft behavior are UI-owned.

## Native credential bridge
New codex-gateway-credentials.cjs exposes only bounded metadata:id/name/scope/enabled/secretAvailable/current, currentCredentialId and currentConfigured. It strips any unexpected response fields and never returns a raw stored Key. Current matching reads only the managed cx_routing_gateway.experimental_bearer_token, including when inactive, computes SHA256 natively and uses authenticated read-only POST /v1/control/client-keys/match {keyHash}; neither raw Key nor hash is placed in the URL or renderer response.

Runtime client consumes the credential worker's list/secret/retain endpoints through loopback Control Bearer authentication, bounded response bodies, timeout and redirect rejection. Secret-by-ID is resolved only in native memory. Gateway apply accepts credentialId or clientKey, rejects ambiguity, validates all selected model aliases and does not silently replace an unavailable stored credential with current/manual input. Omitted/blank both retains existing current Key for compatibility. Current token format does not prove current authorization; matched enabled record and apply validation provide separate evidence.

retain {id,fromCurrent:true} or {id,key} requires exactly one source. Current retention uses only the managed token. Control verifies its hash before encrypted vault retention; native returns a fresh metadata list. Wrong originals map CODEX_CREDENTIAL_MISMATCH; unavailable/revoked/legacy/no-secret and unknown failures are safe. No rotation is initiated by retain.

## Reasoning catalogue
Gateway plan() now creates strict _cxrg.version2/kindgateway catalogues with six standard request efforts:none/minimal/low/medium/high/xhigh, defaultmedium, supports_reasoning_effort_updates:false. It does not write model_reasoning_effort. Existing explicit Codex reasoning settings remain source-preserved.

planDirect remains version1 with previous empty reasoning metadata. inspect accepts strict historical version1 and version2 descriptors, preserving old immutable catalogue files/backups and exact restoration. No model-specific capability, security policy, context-window or instruction changes were added. Upstream support for each request effort is not claimed; unsupported requests may fail explicitly.

## Verification
Initial six revision5 tests were written before implementation and failed for missing memory/credential methods and absent reasoning options.
Focused six-file command:
node --test tests/runtime/codex-config.test.mjs tests/runtime/codex-config-modes.test.mjs tests/runtime/codex-ipc.test.mjs tests/runtime/codex-direct.test.mjs tests/runtime/codex-direct-store.test.mjs tests/runtime/codex-gateway-memory.test.mjs
Result:79/79 PASS,0 failures/skips.

New memory/bridge suite11/11 covers:
- Draft persistence/restart/empty choices and no config apply; per-home separation; strict invalid input/corruption; source-safe atomic conflicts; multiple-instance serialization; linked-file refusal.
- Active managed catalogue initialization, saved draft retained through direct switch, configScope user.
- Stored native credential resolution/all-model validation; unavailable/malformed secret failures without fallback; current/manual retention ambiguity and raw-key redaction.
- Actual Control+Gateway+SecretVault fixture: legacy current matching, wrong original refusal, explicit current retention, secret encrypted at rest, ID apply, new scoped key refusing an out-of-scope selected alias, revoked ID refusal, config unchanged on failures, no model-generation usage.
- Runtime request contracts:Control Bearer only, SHA POST body, fixed ID path encoding, safe mismatch, no raw Key in URLs/output.
- Gateway six effort choices/defaultmedium/requestparameter behavior; direct metadata unchanged; historical version1 catalogue readable and exact restored.

Native preference/credential/runtime/catalogue/service/IPC/main/preload syntax checks and scoped diff whitespace checks PASS. No runtime dependencies/version changes by this worker.

Protocol worker's actual installed Codex0.167 proof result was inspected:
.tmp/codex-memory-effort-20261126/installed-codex-reasoning-result.json reports ok:true, six efforts/defaultmedium; installed app-server -> local Gateway -> local Responses SSE fixture completed explicit high, explicit none and catalogue-defaultmedium turns. Captured upstream requests and sanitized logs matched each value; tool executions0, externalProviderCalls0, actualLogin NOT_RUN. This worker did not run or edit that proof.

## Handoff/limits
Native edits are uncommitted/unpushed. No actual user Codex config/auth, live provider/login, existing Gateway app data or installed programs were accessed. Fixtures are within .tmp/codex-memory-effort-20261126; older native regression fixtures remain isolated. Earlier local1.1.10 edits and binaries are preserved.

Memory file is nonsecret local app state; live Codex config/exact backups retain existing plaintext Key semantics. SecretVault ownership and create/rotate/revoke/delete consistency are credential-worker responsibilities; the actual fixture verifies the integration available in this snapshot. In-process serialization and source revisions do not claim an OS-wide lock against noncooperating external writers.

Independent native/UI/final review, full Runtime/Desktop/build, browser/Electron persistence/dropdown/scope checks and separate local executable are coordinator-owned. Actual account login and real provider effort support remain NOT_RUN until Owner retest.
