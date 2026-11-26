# Native direct provider management — revision 4
Date: 2026-11-26 (Asia/Shanghai).
Task: CXRG-CODEX-ROUTE-MANAGEMENT-20261125, contract revision 4.
Worktree: C:/Users/20142/Desktop/Cx-Routing Gateway/.tmp/worktrees/codex-route-management-20261125
Status: implementation and focused native tests PASS; independent review and final runtime/package evidence are coordinator-owned.

## Delivered behavior
- Current third-party/native routing is classified as direct, with bounded provider/model/validated endpoint metadata. It is not mistaken for official ChatGPT or a Gateway route. Unreadable TOML fails with the existing safe error; unsupported routing projection is marked non-importable with a bounded warning.
- Direct selection uses {mode:'direct',profileId,profilesRevision}. Gateway keeps its routeIds/defaultRouteId contract. Profile library methods match the spec: get/save/import/duplicate/delete CodexDirectProfile. All renderer paths and unexpected fields remain rejected.
- Official is a reserved nondeletable built-in profile. Enabling it removes active routing selector/default/catalogue/endpoint overrides and the built-in openai override, uses Codex's native default, and does not force ChatGPT sign-in or alter auth.json/keychain.
- Custom profiles support name, strict HTTPS or loopback HTTP endpoint, native Responses,1..100 unique models/default and API Key. Blank API Key on edit preserves the native stored value. Structured activation uses cx_codex_direct, explicit requires_openai_auth=false, a real immutable model catalogue and its selected default.
- Simple current Responses/bearer configurations import as editable custom profiles when their full routing state is representable. Their original recipe is retained until an explicit edit; editing converts to the structured managed provider. Unknown fields, env/header authentication, external catalogues and other advanced routing import as read-only snapshots rather than dropping behavior.
- Saved/edited profiles update only the library. Actual active state is computed from the current source projection/provider/model/catalogue, not a persisted active flag. External edits cease matching the saved profile.
- Before entering Gateway, the current direct routing is saved/deduplicated in encrypted storage, and lastDirectProfileId persists across multiple later Gateway changes. Automatic capture failure prevents Gateway activation. Official explicit model choices are preserved as a snapshot rather than reset on return.
- Snapshot return restores only routing roots plus the captured active-provider table. Newer MCP, Hooks, projects, reasoning and unrelated settings survive. Dotted/quoted/inline provider syntax and scalar precision are covered by real IO tests. External catalogue references remain references; arbitrary external files are never read.
- Profile and config revisions are checked through asynchronous preparation and immediately before config replacement. Pending official login blocks config apply/restore, while profile CRUD and browsing stay available. The check uses the client manager's cached-only getLoginState accessor without extra CLI probes.

## Module responsibilities
- codex-direct-store.cjs: fixed-path encrypted library, OS secure-storage availability, bounded/deep schema validation, cross-instance in-process queue, optimistic revisions and atomic encrypted replacement.
- codex-direct-projection.cjs: safe display URL/classification and raw TOML routing-only recipe capture/validation.
- codex-direct-profiles.cjs: profile CRUD, redacted metadata, actual active matching, import/capture/deduplication and last-direct retention.
- codex-config-builder.cjs: mode-specific route edits and redacted preview fragments.
- codex-config-service.cjs: compose route resolution, profile choice, immutable catalogue preparation and original-byte config backup/commit/restore.
- Existing TOML editor now accepts only native-generated raw recipe values; renderer cannot supply them. Result is still parsed before writes, and unrelated scalar source remains intact.
- Existing catalogue builder adds planDirect; existing publication/recovery/hash/symlink guards are retained.
- main.cjs supplies fixed app.getPath('userData')/codex-direct-profiles.enc and Electron safeStorage. No plaintext profile fallback. preload/IPC expose five profile methods through fixed trusted channels and safe error transport.

## Encryption and safety
The entire profile payload, including Keys and snapshot recipes, is encrypted with injected Electron async safeStorage. Reads deep-validate decrypted schema, URL/model/key/ID bounds, recipe scope and fingerprint. OS secure-storage unavailable produces CODEX_PROFILES_UNAVAILABLE for writes/secret use. With no existing library, built-in official mode can still be used without encryption. Missing-file library reads return reserved official plus secureStorageAvailable:false.

Library files/ancestors retain ordinary-file/symlink/hardlink and size protections. Maximum50 saved profiles excludes official; encrypted library maximum8MiB. Names80, model IDs256, direct Keys8192 printable ASCII bytes. Profiles IDs are internally generated UUIDv4 names. No raw stored Key, header/env authentication, encrypted payload or routing source is returned to the renderer, logs or report.

New stable safe codes: CODEX_PROFILES_UNAVAILABLE, CODEX_PROFILES_INVALID, CODEX_PROFILES_CHANGED, CODEX_PROFILE_NOT_FOUND, CODEX_PROFILE_IN_USE, CODEX_PROFILE_LIMIT. Delete refuses official, actual active and last-direct entries and never changes live config.

## Evidence
- Initial new direct tests failed against revision3 with missing profile methods and old direct classification.
- New store failure regression reproduced a raw IO exception; store now sanitizes it before returning.
- Focused command: node --test tests/runtime/codex-config.test.mjs tests/runtime/codex-config-modes.test.mjs tests/runtime/codex-ipc.test.mjs tests/runtime/codex-direct.test.mjs tests/runtime/codex-direct-store.test.mjs ->61/61 PASS,0 skipped.
- New tests cover encrypted at-rest redaction/CRUD/stale revisions; corrupted/deep-invalid payloads; encryption and replacement failures; separate-instance revision serialization; symlink/hardlink rejection; profile limit; structured native activation; imported advanced routing -> Gateway twice -> direct while preserving newer MCP; simple import/edit blank-Key; unknown fields readonly; official selected model retention; profile edits during preview/activation; pending login; unavailable encryption; dotted/quoted/inline projection and original precision.
- Existing config/modes/IPC regressions were migrated to encrypted isolated fixtures and the corrected direct union. Existing parser precision, stale config, original-byte restoration, backup failure, immutable catalogue and transport error tests remain active.
- All native service/builder/projection/store/profile/main/preload syntax checks and scoped diff whitespace checks PASS.
- No runtime dependencies or product-version changes were made by this worker. New code was conventionally formatted with pinned Prettier3.6.2 through an ephemeral tool invocation; package manifests were not altered.

## Boundaries and handoff
All development files/IO fixtures are inside .tmp/codex-direct-management-20261126. No actual Owner Codex config/auth, Gateway app data, real account login or provider generation was accessed. No commit/push/merge/release or installed program replacement occurred. Earlier local1.1.10 revisions, unrelated dirty docs and older binaries are preserved.

The encrypted library is protected by the OS account storage; live Codex config and its exact original-byte backups still use existing plaintext behavior. The profile library has no plaintext fallback. Writes are in-process serialized and revision-checked; no OS-wide lock against noncooperating external editors is claimed. Source-projection advanced shapes that cannot be safely represented are refused rather than silently simplified. Snapshot duplication remains read-only; simple imported profiles are editable.

Independent native/UI/final review, full Runtime/Desktop/build, actual installed CLI parsing/model-list checks, real Electron/browser flow and the separate internal executable are coordinator-owned. Actual account sign-in and real provider access remain NOT_RUN until Owner retest.

## Independent-review fix batch
- Important: imported advanced snapshots could preserve requires_openai_auth=true without an independent provider credential, allowing official account fallback to a third-party destination. Added first-failing tests for status/import/automatic capture and a validly encrypted tampered recipe. All are now refused before changing config or library.
- The validation follows pinned Codex rust-v0.167.0 source: model-provider/src/auth.rs resolves provider env_key (missing environment value fails), then experimental_bearer_token, then ambient official auth when requires_openai_auth is true. provider.rs identifies that first-party fallback path independently of static headers; bearer_auth_provider.rs inserts Authorization. Therefore static/env headers alone do not prove safety when official auth remains enabled.
- Safe configured provider bearer tokens and syntactically valid env_key names may be retained; environment values are never resolved. With requires_openai_auth=false, static/env-header snapshots have no official fallback and may be preserved read-only. No claim is made that those credentials exist or the third party accepts them.
- Built-in openai with a configured endpoint redirect is treated as requiring independent credentials unless official auth is explicitly disabled. Unsafe status stays direct but importable:false with a safe warning. CODEX_DIRECT_AUTH_UNSAFE has a fixed Chinese message and is mapped by the UI.
- Checks run at current capture/import, decrypted recipe validation (including active provider identity), selected snapshot use and the actual patched config before activation. This prevents malformed/decrypted recipe changes or inactive-provider differences from bypassing the rule. Official built-in default remains valid.
- Minor: snapshot activation previously returned catalogStatus:none even when restoring an external/managed catalogue pointer. The target catalogue is now inspected before the config commit and that known result is returned afterward. Added external-pointer and retained-managed-catalogue tests; the latter injects a post-commit read failure and still reports the successful managed result.
- Focused native five-file regression command now passes66/66,0 skipped. Syntax/diff checks pass. No live account/provider activity or Git integration performed in this fix batch.
- Sources: https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/model-provider/src/auth.rs ; provider.rs ; bearer_auth_provider.rs and model-provider-info/src/lib.rs. These establish auth precedence, not live provider validation.

## Final concurrency fix
- Final review identified that the final source revision check ran before asynchronous encrypted-profile validation. An external config edit during that decryption could therefore be overwritten.
- Added a real service regression which pauses safeStorage decryption specifically after backup state preparation, writes an external config/MCP change, then releases validation. Before the fix the operation committed and the expected rejection was absent.
- CodexConfigStore.replace now awaits profile/login validation first, then performs its source revision check. The new test rejects CODEX_CONFIG_CHANGED and retains the exact external bytes. The existing unavoidable filesystem race after the last source check remains explicitly unclaimed as an OS-wide lock.
- New focused regression PASS; full native five-file regression67/67 PASS,0 skipped. Syntax and scoped diff checks PASS. No changes beyond store ordering, covering test and this evidence; no Git integration or actual user files accessed.

## Pure official default identity correction
- A saved empty official snapshot could match before the reserved official entry, causing a later explicit official activation to display snapshot and reject the official login mode gate.
- Added a failing actual-service flow: import pure default, enable Gateway, explicitly enable official. It reproduced direct.kind:snapshot before the fix.
- Active matching now prioritizes reserved official only when the actual route is official and the captured routing recipe has zero values. Explicit model choices and forced/advanced snapshots retain their separate identity.
- The test verifies official profileId/active flag and passes the actual client manager mode/revision gate up to a deliberately unavailable fake CLI (no process/auth access).
- Focused native five-file regression after both final fixes68/68 PASS,0 skipped. Syntax/diff checks PASS. No commits or actual user configuration/provider actions.
