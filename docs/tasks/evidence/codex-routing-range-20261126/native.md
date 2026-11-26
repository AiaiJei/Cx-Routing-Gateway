# Revision6 native configuration evidence

Project `cx-routing-gateway`; repo `aiaijei-cx-routing-gateway`; task `CXRG-CODEX-ROUTE-MANAGEMENT-20261125`; active contract revision6. Worktree `.tmp/worktrees/codex-route-management-20261125`, branch `codex/codex-route-management-20261125`. Local uncommitted/unpushed implementation; no merge/release.

## Scope and implementation

- `codex-runtime-client.cjs` now returns validated `{id,model,reasoning?,outboundProtocol}` from one Control snapshot. The config service retains both fields and rechecks them after Key validation. Old isolated embedding callers without outbound metadata retain prior behavior.
- New `codex-reasoning-range.cjs` exports the seven wire scalar levels (`none,minimal,low,medium,high,xhigh,max`) and strict min/max validation. Coordinator's installedCLI evidence established that Ultra is a UI alias rather than an independent wire level; the native boundary rejects `ultra` rather than inventing a route rank for it. New Gateway catalogs use schema3, store aligned `reasoningRanges` (`null` means legacy), list each interval's choices, and use medium clamped into that interval. Routes with no range retain the old medium/six-choice behavior. Schema1, schema2, direct catalogs and historical prompt bytes remain recognized by integrity reconstruction.
- `codex-search-policy.cjs` owns the search settings separately from provider/catalog construction. Any selected Chat/Mes outbound explicitly sets root `web_search="disabled"`, and also the root-selected legacy profile's setting when present. Other profiles, local tools, MCP, hooks and reasoning settings are preserved. No `use_responses_lite` capability disable was introduced; `supports_search_tool:false` remains only the existing catalog discovery capability.
- The existing encrypted direct library stores only the affected search fields and their original value/absence. Repeat Gateway saves preserve the original capture. Direct return or switching to pure Responses restores those fields. Optimistic config/library checks protect both files; external edits to managed search fields fail closed. A released restoration record is written before publication, remains retryable if config publication fails, and is cleaned after success. Cleanup failure cannot report an already committed apply as failed or overwrite later search edits.
- If a restoration write fails and the config is then externally changed while its search fields remain disabled, automatic retry returns `CODEX_CONFIG_CHANGED` without writing. The ambiguous partial state requires reconciling the external edit before retry; it cannot silently report a restored direct setup.

## Renderer contract

Preview adds `catalogRefresh:"on-explicit-apply"` for Gateway and safe `searchPolicy` facts:

```text
webSearch: disabled | unchanged | restored
reason?: converted-upstream
activeProfile?: string
affectsActiveProfile: boolean
externalOverrides: not-managed
```

Status returns current `searchPolicy` with `disabled|unchanged`. `configPreview` explicitly shows the search edits; `changes` explains user scope, direct restoration and explicit catalog refresh. Actual Gateway runtime enforcement after a route save is separate from native catalog refresh, which happens only on explicit save/enable.

Coordinator's installed Codex0.167 investigation found that root `profile=` legacy configuration is rejected, and current `--profile` reads a separate config file. The legacy preservation tests here prove safe handling of existing TOML only. They do not claim legacy profile CLI support. Independent `--profile` files, startup arguments and external configuration layers are explicitly outside this user-config edit and must be synchronized separately.

## Test-first and verification

Initial `node --test tests/runtime/codex-route-range.test.mjs`: 7 tests, 5 expected failures (lost range/protocol projection, absent v3/preview, search not disabled, restoration conflict not rejected, route changes during validation not rejected). Later regressions separately reproduced stale search restoration after pure Responses and failed direct restoration before fixing them.

Final focused command:

```text
node --test tests/runtime/codex-route-range.test.mjs tests/runtime/codex-config.test.mjs tests/runtime/codex-config-modes.test.mjs tests/runtime/codex-direct.test.mjs tests/runtime/codex-direct-store.test.mjs tests/runtime/codex-gateway-memory.test.mjs tests/runtime/codex-ipc.test.mjs
```

Result: **PASS 94/94**, including 15 dedicated native range/search tests, fresh after the final implementation change. Exact existing assertions were updated only for schema3 metadata and the newly returned outbound protocol. New tests include v1/v2/direct recognition, altered hash-valid schema3 rejection, interval validation, legacy embeddings, profile/root absence restoration, newer unrelated profile/MCP/hook preservation, failed publication/restart retry and post-commit metadata-cleanup failure.

`git diff --check` for touched tracked native/test files: PASS. `node --check` for the new and changed CJS helpers plus the dedicated test: PASS.

## Boundaries and next action

All fixtures are inside `.tmp/codex-routing-range-20261126` or the existing isolated fixture directories. No actual user Codex config/auth, provider credentials or real provider calls were read or used. InstalledCLI cross-protocol tools, UI, portable delivery, full suite/build and independent review are **NOT_RUN by this native package**, owned by the coordinator and other packages.

AWG `scope_check` was attempted with this verified worktree root and returned **BLOCKED / PROJECT_ROOT_MISMATCH**, because the installed MCP remains bound to the primary repository root. It was not rebound or bypassed. File work and checks here used terminal/apply_patch after manually verifying repository identity, revision6 allowed paths and explicit delegation; they were **not AWG-validated operations**.

Native implementation and focused validation: PASS. Owner/runtime/provider acceptance: NOT_RUN here. Next: coordinator reviews this package, performs combined installedCLI/UI/build acceptance, and keeps all Git integration disabled for this local revision.

## Independent review fixes

Two independent-review P2 findings were reproduced with two new failing tests before changes:

1. Returning from converted Gateway to pure Responses/direct cleared the active search record, but restoring the TOML backup returned to disabled Gateway without its original search values. The later direct return retained disabled search.
2. A route change after credential validation but during catalog publication was not checked before final config publication. Both a new reasoning range and Res-to-Chat change incorrectly activated an old catalog/search setup.

Fix1 adds encrypted, validated `gatewaySearchRecoveries` entries bound to the existing backup IDs. At most the currently exposed backup plus a pending backup are retained, so a failed newer publication cannot discard the older usable recovery record. Search metadata restoration preserves newer direct profiles and is completed before TOML restore; final revision checks cover both files. `CodexConfigStore.restore` accepts an optional validation callback, retains the existing post-callback TOML read, and remains compatible with old callers. Failed metadata/config restore writes remain retryable. Search cleanup only removes the active released record and retains the backup-bound record.

Fix2 re-resolves the complete selected route projection and Gateway URL in the final replace callback, after catalog/capture/encryption/backup preparation. A changed range or outbound protocol returns `CODEX_ROUTE_UNAVAILABLE` without activating TOML. Profile/login checks then run and the existing final TOML read catches edits made while those asynchronous checks were running.

Additional focused cases cover direct and pure Responses backup rollback, newer direct-profile preservation, a failed later save retaining the current backup, failed search metadata replacement, failed TOML restore/restart retry, and an external TOML edit during final route resolution. Final focused suite after these fixes: **PASS 100/100**, including **21 dedicated native tests**. Independent re-review remains pending; actual CLI/renderer/portable checks remain coordinator-owned.

### Re-review: rejected rollback side effect

Independent re-review found that `restoreSearchRecovery` wrote active search metadata before the store rejected a backup whose `afterRevision` no longer matched current TOML. The focused regression reproduced encrypted library bytes changing on a rejected restore and the following fresh direct apply being blocked.

The service now checks `snapshot.revision === backup.afterRevision` before any metadata write. A stale restore therefore leaves encrypted library bytes unchanged. A second regression changed TOML after metadata publication but before the final restore check; it reproduced an uncommitted old search record becoming active. Rollback metadata is now prepared as `gatewaySearchRollback:{backupId,targetRevision,restore}`. Reads activate that prepared record only if TOML has reached the exact target revision. Otherwise the original active search state remains in force. Finalization after successful TOML publication is best effort and revision checked; failure remains usable through the prepared record after restart. A following apply materializes the effective state and clears the pending marker without discarding the backup recovery records.

The vocabulary correction also has a failing-then-passing test: exactly seven wire levels, `max` highest, with `ultra` rejected. Final focused suite after re-review fixes: **PASS 104/104**, including **25 dedicated native tests**. No renderer interface change. Independent re-review pending.

### Pending finalization and unrelated edits

The independent reviewer extended the finalization-failure case by appending only a new Hooks table after successful TOML rollback, then restarting before returning direct. Exact whole-file revision matching lost the prepared recovery state. The strengthened test failed with search still disabled.

Prepared rollback now also records normalized source and target routing/search fingerprints. The projection covers root provider/model/catalog/redirect/profile selection, the selected provider configuration, active legacy-profile routing/search fields, and all affected search paths. It ignores Hooks, MCP and unrelated profiles. Besides an exact target revision, recovery accepts the target projection only when source and target projections differ. This preserves proof that the routing/search transition happened while allowing unrelated edits after successful publication. Uncommitted source configuration and an externally changed live search value cannot match the disabled target. The regression now passes with cached search restored and the newer Hooks value preserved; the earlier prepublication external-edit regression still passes. Final focused suite remains **104/104 PASS**, dedicated **25/25 PASS**; independent re-review pending.
