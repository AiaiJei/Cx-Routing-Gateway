# Revision5 client credential evidence

Project `cx-routing-gateway`, repository `aiaijei-cx-routing-gateway`, task `CXRG-CODEX-ROUTE-MANAGEMENT-20261125`, contract revision5. Worktree: `C:/Users/20142/Desktop/Cx-Routing Gateway/.tmp/worktrees/codex-route-management-20261125`, branch `codex/codex-route-management-20261125`. Local implementation only; no commit, push, merge, release, actual Codex configuration, account, provider, or user credential access.

## Implementation

- `services/local-control/src/client-key-service.mjs` owns client-key state and encrypted-secret lifecycle. Existing `ConfigStore` and `SecretVault` remain the only storage implementations. Gateway authentication still uses the current SHA256 `keyHash` and existing route scope.
- New creation and rotation stage encrypted secrets before configuration commit. Confirmed failed commit removes the staged reference when vault cleanup is available. Rotation and original-key retention compare the current serialized state with the captured hash, enabled state, secret reference and `authMutationRevision`; delayed requests cannot restore revoked/deleted/rotated state or replace a newer reference. Creation starts this revision at1; every explicit retain/rotate/revoke increments it, including repeated revoke. Legacy missing revision is0.
- `GET /v1/control/client-keys` returns only `{credentials:[{id,name,scope,enabled,secretAvailable}]}`. `secretAvailable` reports that an encrypted reference was saved; it does not guarantee the vault is currently readable. The actual secret endpoint validates vault availability, current enabled state and SHA256 after vault I/O.
- `GET /v1/control/client-keys/:id/secret` returns `{id,key}`. Legacy hash-only entries return `409 key_secret_unavailable`. Disabled entries return `409 key_disabled`; missing entries return `404 not_found`; stale read snapshots return `409 key_changed`; inconsistent decrypted values return `409 key_secret_mismatch`.
- `POST /v1/control/client-keys/:id/secret` accepts exactly `{key}` and retains only the matching original. It never rotates the key or changes scope/authorization. It returns the metadata record directly. Wrong/stale original returns `409 key_secret_mismatch`; malformed/extra fields return `400 invalid_client_key`.
- Public workspace state strips both `keyHash` and `secretRef`. List, match and error responses never contain the raw key, hash or vault reference. Every credential endpoint retains the existing control-bearer gate. The existing explicit `allowUnauthenticated` fixture option remains unchanged.

## Agreed API addendum

Native must identify the currently configured token without exposing hashes in renderer metadata. Coordinator approved additive read-only `POST /v1/control/client-keys/match` with exactly `{keyHash:<64 hex characters>}`. Native computes the hash locally; the response is `{credential:<metadata>}` for an enabled match or `{}`. Invalid/extra fields return `400 invalid_key_hash`. No raw token enters the lookup URL/body or response; no state mutation occurs.

Successful retention, rotation or permanent deletion returns optional `secretCleanupPending:true` only if retiring the old encrypted reference fails. This reports encrypted residue without rolling back already committed authentication. Ordinary successful responses omit the field. Vault/config I/O failures before commit return sanitized `503 key_secret_storage_unavailable`; the prior key/hash remain active. If rollback cleanup itself also fails, an unreferenced encrypted entry may remain; no automatic broad vault cleanup was added.

Configuration errors after an attempted mutation are reconciled against the durable store before staged-secret cleanup. If id/hash/ref/enabled/auth revision exactly match the intended committed record, create/rotate/retain returns the normal successful result with optional `stateWriteReconciled:true`. If a later authorization mutation has superseded it, no stale success is returned. A staged reference found anywhere in current client-key/upstream configuration is preserved; if reconciliation reads fail, ciphertext is conservatively retained and the response stays a safe503. Unknown outcome can therefore leave encrypted residue, but cannot remove a potentially live Key.

## Verification

RED: new actual HTTP tests ran before implementation. Missing encrypted storage and secret/list/match endpoints produced seven assertion failures; three controlled I/O race cases timed out because the required vault calls did not yet exist. Existing bearer protection passed. Additional strict-input and cleanup-warning tests were separately observed failing before those behaviors were added.

GREEN command:

```text
node --test --test-timeout=15000 tests/runtime/client-key-secrets.test.mjs tests/runtime/control-server.test.mjs tests/runtime/secret-vault.test.mjs tests/runtime/config-store.test.mjs
```

Result after independent-review fixes: **61/61 PASS**, including **20 new credential tests**. Tests create loopback Control and Gateway servers, real temporary ConfigStore/SecretVault files under `.tmp/codex-memory-effort-20261126/client-key-fixtures/`, and use real HTTP. Gateway `/v1/models` proves retained/rotated keys authenticate with their original scope and revoked/old keys fail, without provider/model calls.

Coverage: encrypted file/config/backup contain no plaintext key; metadata/state redaction; legacy unavailable; wrong original; matching hash lookup without writes; control unauthorized; scope preserved; revoked read/retain; rotate/delete cleanup; wrong decrypted hash; vault put/read failures; config commit failure and staged cleanup; delayed read/retain/rotation versus revoke/delete/rotate; competing retains/rotations; strict input validation; cleanup residue warning with committed authentication still valid.

Independent review identified two additional failure paths. Both were reproduced RED before repair: an already-disabled key's delayed rotation incorrectly enabled it after repeated revoke; a committed config update throwing during unlock incorrectly deleted the now-active secret. The repaired tests cover repeated-revoke fencing, actual `ConfigStore.update` with its real lock release followed by a controlled error for create/rotate/retain, unreadable outcome after both committed/uncommitted writes, and commit followed by a newer revoke before error reconciliation. All pass, including correct key authentication, retained current ciphertext, replaced-old cleanup, truthful flags and refusal of stale success.

`node --check` for both control source files and `git diff --check` for owned source/test files: **PASS**. Existing `control-server.test.mjs` was run unchanged.

## Status and handoff

Control credential implementation and focused verification: **PASS**. Native worker was notified of the stable endpoints, response shapes and error codes. Independent review, full combined regression, packaged UI/runtime, deployment and Owner acceptance are coordinator-owned and **NOT_RUN by this worker**. Changes remain uncommitted in the task worktree; main/PR were not updated. Commands and writes used terminal/file tools, not AWG operation validation.
