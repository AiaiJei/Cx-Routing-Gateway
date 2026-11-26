# Native revision 3 — Codex modes and models
Date: 2026-11-26 (Asia/Shanghai)
Task: CXRG-CODEX-ROUTE-MANAGEMENT-20261125, contract revision 3.
Worktree: C:/Users/20142/Desktop/Cx-Routing Gateway/.tmp/worktrees/codex-route-management-20261125
Status: native implementation and focused checks PASS; independent review/final package acceptance are coordinator-owned.

## Result
The configuration contract now accepts only {mode:'official'} or {mode:'gateway',routeIds,defaultRouteId}. Apply also accepts expectedRevision and, for Gateway only, an optional new clientKey. The old independent reasoning selector is rejected; existing reasoning source remains untouched.

Gateway writes a real Codex model_catalog_json and default model. Every selected enabled Responses route is resolved from one coherent Control API snapshot, its alias is validated through the Gateway model catalogue using the candidate or native stored Key, and the whole selection is revalidated before file preparation. Omitted/blank Key reuses the managed provider token without returning it to the renderer. Duplicate IDs/default mismatches/duplicate aliases/disabled or missing targets fail safely.

Official mode works without Gateway. It selects built-in openai + forced ChatGPT login, removes the old default model, model catalogue, root OpenAI/ChatGPT endpoint overrides and built-in openai provider overrides. The inactive Gateway provider block/Key and unrelated config/auth files remain intact. Status classifies customized built-in redirect/forced-API/catalogue states as other until cleanup is applied, so the official login gate cannot rely on a misleading official mode.

## Model catalogue
- New codex-model-catalog.cjs prepares immutable content-addressed JSON under fixed CODEX_HOME/.cx-routing-gateway/catalogs/<sha256>.json.
- A random exclusive temporary file is fully written and flushed before exclusive atomic hard-link publication. The temporary link is removed before validation/config commit. A failed partial write leaves no final hash file and the same selection can retry. Existing/tampered hash files are never overwritten.
- Catalogues are bounded to 8 MiB; max100 selected models is tested. The default receives priority0 and remaining entries positive priority, matching actual Codex picker default behavior.
- Descriptors use minimal generic fallback metadata: text input, no claimed web/image/reasoning capabilities, no invented context window or Guardian/security policy overrides.
- Installed Codex0.167.0 requires base_instructions. It is the coordinator-provided unmodified generic Apache-2.0 fallback asset shipped beside the modules with license/notice, not provider-specific instructions.
- Reads verify fixed managed location, ordinary-file protections, content hash, version1 metadata and descriptor schema. Historical valid generic fallback bytes are retained instead of comparing against the app's current prompt asset. External catalogue paths are never read.
- Status reports managed/legacy/none/external/missing/invalid and preserves restore access for valid config backups despite missing/tampered model catalogues.
- catalogPreview is a bounded summary JSON with slug/display name/priority and selection/default metadata. It omits generic instructions and the full runtime descriptor; actual catalogue files contain required full metadata.
- Full catalogue creation precedes config backup/commit. Atomic config replacement remains the sole activation point. Failed config commits leave the previous config and referenced catalogue usable. Historical catalogue files are retained for exact original config restoration.

## Native composition
main.cjs fixes one Codex home for both configuration and the client manager. preload.cjs exposes the existing four config methods plus:
- getCodexClientStatus -> runtime:codex-client-status
- startCodexLogin({expectedRevision}) -> runtime:codex-login
- cancelCodexLogin -> runtime:codex-cancel-login

The client worker owns codex-client-manager.cjs. Main lazily constructs it with getConfigStatus and disposes only its owned processes on app quit/update exit. The same trusted-sender and message-safe error boundary covers all channels. New fixed codes include CODEX_CATALOG_INVALID and the client worker's LOGIN_MODE_REQUIRED/CLI_NOT_FOUND/LOGIN_PENDING/LOGIN_FAILED/CLIENT_DISPOSED.

Status no longer emits reasoningEffort. It reports mode, selected route IDs/aliases, defaultRouteId where consistent, catalogue status and reusable managed credentialConfigured even while inactive. Status reads require no Gateway request.

## Verification
- Wrote initial revision3 tests before implementation: seven cases failed with CODEX_INPUT_INVALID against the old single-route contract.
- Coherent multi-route lookup test failed before getRoutes existed, then passed.
- Partial-catalogue failure/retry regression failed against direct hash-filename writes, then passed with temporary+exclusive publication.
- Added failing summary-size/secret-content and official-mode safety regressions, then passed after implementing bounded summary and customized-built-in classification.
- Existing config safety tests were migrated to the new selection union while preserving their stale-preview, exact restoration, IO failure, symlink, precision and concurrency checks. Their temp roots now use .tmp/codex-modes-models-20261125.
- Focused config/modes/IPC: node --test tests/runtime/codex-config.test.mjs tests/runtime/codex-config-modes.test.mjs tests/runtime/codex-ipc.test.mjs => 43/43 PASS, 0 skipped.
- Client worker frozen suite independently rerun: node --test tests/runtime/codex-client-manager.test.mjs => 18/18 PASS.
- main/catalogue syntax checks PASS. Scoped git diff --check PASS after preserving repository LF line endings.
- Coordinator actual installed CLI proof inspected at .tmp/codex-modes-models-20261125/generated-catalog-proof.json: ok:true; Codex0.167.0 model/list returned exactly picker-beta (default true) and picker-alpha; config/read default beta; official provider openai + forcedChatGPT, custom catalogue removed, reasoning preserved; restore returned Gateway and both route IDs. Generation requests0, liveLogin NOT_RUN. This worker did not run or edit the coordinator probe.

## Limits and handoff
- No actual Owner Codex home/config/auth, real sign-in, provider generation or installed Gateway data was accessed by this worker. No commit/push/merge/release/version changes.
- Test files and catalogue content live only under the task worktree's new fixture directory. Previous local1.1.10 beta edits and older evidence remain intact.
- Existing source-preserving TOML editor and write-ahead backup transaction are reused. Its explicit unsupported-shape refusal, plaintext Key/backups, inherited Windows ACLs, in-process serialization and external-editor race limits still apply.
- Immutable catalogue publication requires same-filesystem hard-link support. Failure is sanitized and occurs before config activation.
- Runtime model listing/default behavior is proven against installed CLI0.167.0 in an isolated home. Other Codex client versions and real account/model requests are not claimed.
- Coordinator supplies independent native/UI/final review, complete regression/build/browser checks, and the distinct local internal executable; user environment acceptance remains NOT_RUN.

## Scoped reliability fix after native review
- Review found a publication interruption window: the final hard link could survive together with its generated temporary alias. The normal hard-link refusal correctly rejected it, but retrying the same catalogue could not recover.
- Added a failing real-filesystem regression that creates this exact two-link interrupted state, then retries the full service apply. It failed with CODEX_CATALOG_INVALID before the fix.
- Catalogue writes now recover only a final regular file with exactly two links, bounded expected bytes and matching SHA-256, plus exactly one generated hash/UUIDv4 temporary name with the same device/inode, size and modification time. Directory scanning is bounded to4096 entries, and identities are rechecked immediately before removing only that temporary alias. Ordinary inspect/read hard-link guards remain unchanged.
- Separate real-filesystem cases prove arbitrary extra aliases, tampered final bytes, same-named temporary files on a different inode, and three-link states are refused without config change or alias deletion.
- Focused native config/modes/IPC verification after the fix:45/45 PASS,0 skipped. Catalogue syntax and scoped diff check PASS. No commits or actual user configuration/provider access. Coordinator supplies scoped re-review and final application restart/smoke.
